#!/usr/bin/env node
/**
 * Can Marsad correct a company's data, and can it merge two records for one
 * business without losing the reports attached to the one that disappears?
 *
 * Both are new write paths on the registry, and both are the kind that fail
 * quietly: an edit that saves nothing, or a merge that deletes a row while
 * fourteen ON DELETE CASCADE foreign keys take its reports with it. So every
 * check here reads the tables back rather than trusting a return value.
 *
 * Everything runs inside a transaction that is rolled back, including the two
 * throwaway companies the merge is tested on.
 *
 * Usage: node scripts/probe-company-edit.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}
const q = async (sql, args) => (await c.query(sql, args)).rows
const one = async (sql, args) => (await q(sql, args))[0]

// A statement that raises aborts the transaction, so each attempt gets its own
// savepoint or every check after the first refusal reports 25P02.
let sp = 0
const raises = async (sql, args) => {
  const n = `s${++sp}`
  await c.query(`savepoint ${n}`)
  try { await c.query(sql, args); await c.query(`release savepoint ${n}`); return null }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return e.message.split('\n')[0] }
}

const [admin] = await q("select id, email from public.users where role = 'platform_admin' limit 1")
// A member whose tenant may still add companies.
//
// This took whichever member came back first, and that member's tenant had been
// suspended from adding companies by a real administrator — a standing decision,
// entered from the admin panel on 27 July. So the checks below asked whether an
// insert succeeds, got a correct refusal, and reported a defect in the document
// rule that was working exactly as written. Nothing had changed except which row
// arrived first.
//
// The suspension is production data and stays. What the probe needs is a
// contributor who is not under one, stated rather than assumed.
const [member] = await q(`
  select u.id from public.users u
    join public.tenants t on t.id = u.tenant_id
   where u.role <> 'platform_admin'
     and u.tenant_id is not null
     and not coalesce(t.company_add_suspended, false)
   limit 1`)
const [tenant] = await q('select t.id from public.tenants t join public.users u on u.tenant_id = t.id limit 1')

await c.query('begin')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])

// ---- editing ---------------------------------------------------------------
console.log('\n  تصحيح البيانات\n')
{
  const co = await one('select id, sector from public.companies where approved limit 1')

  const res = await one(
    "select public.admin_update_company($1, $2::jsonb, $3) as r",
    [co.id, JSON.stringify({ sector: 'قطاع الفحص', city: 'مدينة الفحص' }), 'فحص آلي'])
  ok('التعديل يحفظ ويعدّ الحقول', res.r.count === 2, `${res.r.count} حقل`)

  const after = await one('select sector, city from public.companies where id = $1', [co.id])
  ok('القيمة وصلت الجدول فعلاً', after.sector === 'قطاع الفحص' && after.city === 'مدينة الفحص')

  const log = await one(
    'select actor_id, change_reason from public.company_audit_log where company_id = $1 order by created_at desc limit 1',
    [co.id])
  ok('السجل يعرف من عدّل', log.actor_id === admin.id, log.actor_id || 'لا أحد')
  ok('السجل يعرف لماذا', log.change_reason === 'فحص آلي', log.change_reason || 'بلا سبب')

  // Saving the same values again must not invent a change.
  const again = await one("select public.admin_update_company($1, $2::jsonb, $3) as r",
    [co.id, JSON.stringify({ sector: 'قطاع الفحص' }), 'فحص آلي'])
  ok('حفظ بلا تغيير يُبلّغ صفر', again.r.count === 0, `${again.r.count}`)

  // A field can be cleared, which is different from being left alone.
  const cleared = await one("select public.admin_update_company($1, $2::jsonb, $3) as r",
    [co.id, JSON.stringify({ city: null }), 'فحص آلي'])
  const nulled = await one('select city from public.companies where id = $1', [co.id])
  ok('null يمسح الحقل', cleared.r.count === 1 && nulled.city === null)

  const other = await one('select cr_number from public.companies where id <> $1 limit 1', [co.id])
  const refusals = [
    ['بلا سبب', { name: 'س' }, ''],
    ['سجل تجاري بحروف', { cr_number: 'CR123456' }, 'فحص'],
    ['سجل تجاري بتسعة أرقام', { cr_number: '123456789' }, 'فحص'],
    ['سجل تجاري مكرّر', { cr_number: other.cr_number }, 'فحص'],
    ['اسم فارغ', { name: '   ' }, 'فحص'],
    ['بريد غير صالح', { official_email: 'خطأ' }, 'فحص'],
    ['موقع بلا بروتوكول', { website: 'example.com' }, 'فحص'],
    ['سنة تأسيس مستحيلة', { founded_year: '1200' }, 'فحص'],
    ['حقل محميّ', { approved: 'true' }, 'فحص'],
    ['حقل غير موجود', { nonsense: 'x' }, 'فحص'],
  ]
  for (const [label, patch, why] of refusals) {
    const msg = await raises('select public.admin_update_company($1, $2::jsonb, $3)',
      [co.id, JSON.stringify(patch), why])
    ok(`مرفوض: ${label}`, !!msg, msg || 'مرّ!')
  }
}

// ---- a company member must not reach it ------------------------------------
if (member) {
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: member.id, role: 'authenticated' })])
  const co = await one('select id from public.companies where approved limit 1')
  const msg = await raises('select public.admin_update_company($1, $2::jsonb, $3)',
    [co.id, JSON.stringify({ name: 'محاولة' }), 'محاولة'])
  ok('عضو شركة لا يعدّل السجل', !!msg, msg || 'مرّ!')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])
}

// ---- duplicates and merging ------------------------------------------------
console.log('\n  التكرار والدمج\n')
{
  await c.query('set local role postgres')
  const a = await one(`insert into public.companies (name, cr_number, approved, sector, status)
    values ('شركة فحص التكرار', '9800000001', true, 'قطاع أ', 'active') returning id`)
  const b = await one(`insert into public.companies (name, cr_number, approved, city, status)
    values ('شركة فحص التكرار', '9800000002', true, 'مدينة ب', 'active') returning id`)
  const rep = await one(`insert into public.reports
      (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, delay_days)
    values ($1, $2, 'approved', now() - interval '30 days', 'late', 7) returning id`, [tenant.id, b.id])
  const doc = await one(`insert into public.company_documents (company_id, doc_type, status, file_url)
    values ($1, 'commercial_registration', 'pending', 'probe://فحص') returning id`, [b.id])
  await c.query('set local role authenticated')

  const pairs = await q('select * from public.company_duplicates(0.55, 100)')
  ok('الاسم المكرّر يُكتشف',
    pairs.some((p) => (p.a_id === a.id && p.b_id === b.id) || (p.a_id === b.id && p.b_id === a.id)),
    `${pairs.length} زوج`)
  ok('الزوج مُعلَّم كاسم مطابق',
    pairs.find((p) => [a.id, b.id].includes(p.a_id) && [a.id, b.id].includes(p.b_id))?.reason === 'same_name')

  const flagged = await one('select quality_issues from public.company_roster() where company_id = $1', [a.id])
  ok('السجلّ يرفع علم الاسم المكرّر', (flagged.quality_issues || []).includes('duplicate_name'),
     (flagged.quality_issues || []).join(', '))
  ok('والسجل التجاري غير النظامي يُعلَّم أيضاً',
     (await one("select quality_issues from public.company_roster() where cr_number !~ '^[0-9]{10}$' limit 1"))
       ?.quality_issues?.includes('cr_format') ?? false)

  const noReason = await raises('select public.merge_companies($1, $2, $3)', [a.id, b.id, ''])
  ok('دمج بلا سبب مرفوض', !!noReason, noReason || 'مرّ!')

  const self = await raises('select public.merge_companies($1, $1, $2)', [a.id, 'فحص'])
  ok('دمج السجل مع نفسه مرفوض', !!self, self || 'مرّ!')

  const res = await one('select public.merge_companies($1, $2, $3) as r', [a.id, b.id, 'فحص آلي'])
  ok('الدمج تمّ', res.r?.kept === a.id, JSON.stringify(res.r?.moved || {}))

  const movedRep = await one('select target_company_id from public.reports where id = $1', [rep.id])
  ok('التقرير نجا وانتقل', movedRep?.target_company_id === a.id,
     movedRep ? '' : 'اختفى مع السجل المحذوف')

  const movedDoc = await one('select company_id from public.company_documents where id = $1', [doc.id])
  ok('المستند نجا وانتقل', movedDoc?.company_id === a.id, movedDoc ? '' : 'اختفى')

  const gone = await one('select id from public.companies where id = $1', [b.id])
  ok('السجل المدموج حُذف', !gone)

  const kept = await one('select city, previous_names from public.companies where id = $1', [a.id])
  ok('الحقل الفارغ امتلأ من المدموج', kept.city === 'مدينة ب', kept.city || 'فارغ')
  ok('الاسم القديم بقي للبحث', (kept.previous_names || '').includes('شركة فحص التكرار'))

  const audit = await one(
    "select action, actor_id from public.company_audit_log where company_id = $1 and action = 'merged'", [a.id])
  ok('الدمج مُسجَّل باسم من نفّذه', audit?.actor_id === admin.id)

  // And the exception the merge opened is shut again.
  const other = await one('select id from public.companies where id <> $1 limit 1', [a.id])
  const repoint = await raises('update public.reports set target_company_id = $1 where id = $2',
    [other.id, rep.id])
  ok('تحويل تقرير خارج الدمج مرفوض', !!repoint, repoint || 'مرّ!')
}

// ---- asking a company that nobody owns -------------------------------------
// The request would be filed, the file frozen at awaiting_documents, and the
// notification skipped — because there is no tenant to send it to. 28 of 31
// companies are in that state, so this is the common case, not the edge.
console.log('\n  مطالبة سجل بلا مالك\n')
{
  const orphan = await one(`
    select c.id, c.review_status from public.companies c
     where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
     limit 1`)
  const owned = await one(`
    select c.id from public.companies c
     join public.tenants t on t.company_id = c.id where c.approved limit 1`)

  if (orphan) {
    const res = await one('select public.request_clarification($1,$2,null,$3,null,14) as r',
      [orphan.id, 'فحص آلي', 'documents'])
    ok('الطلب مرفوض', res.r?.ok === false, res.r?.reason || '')

    const after = await one('select review_status from public.companies where id = $1', [orphan.id])
    ok('الملف لم يُجمَّد رغم ذلك', after.review_status === orphan.review_status, after.review_status)

    const n = (await q('select 1 from public.clarification_requests where company_id = $1', [orphan.id])).length
    ok('ولم يُنشأ طلب معلّق', n === 0, `${n}`)
  } else {
    ok('الطلب مرفوض', false, 'لا يوجد سجل بلا مالك للفحص')
  }

  if (owned) {
    const res = await one('select public.request_clarification($1,$2,null,$3,null,7) as r',
      [owned.id, 'فحص آلي', 'documents'])
    ok('السجل المملوك ما زال يُطالَب', res.r?.ok === true, res.r?.reason || '')
    ok('ويعيد الجهة التي تُبلَّغ', !!res.r?.tenant_id)
  }

  // ---- the way out of that dead end ----------------------------------------
  if (orphan) {
    const bad = await one('select public.invite_company($1,$2,null) as r', [orphan.id, 'ليس-بريدا'])
    ok('دعوة ببريد غير صالح مرفوضة', bad.r?.ok === false, bad.r?.reason || 'مرّت!')

    const inv = await one('select public.invite_company($1,$2,$3) as r',
      [orphan.id, 'probe-invite@example.com', 'فحص آلي'])
    ok('الدعوة تُنشئ الجهة والدعوة', inv.r?.ok === true && !!inv.r?.tenant_id, inv.r?.reason || '')

    const row = await one('select claimed_by, invite_status, invited_email, quality_issues from public.company_roster() where company_id = $1', [orphan.id])
    ok('لا يُحسب مُستلَماً قبل القبول', row.claimed_by === null, row.claimed_by || 'فارغ')
    ok('يظهر كـ«مدعوّة»', row.invite_status === 'pending', row.invite_status)
    ok('ولم يعد بلا سبيل للتواصل', !(row.quality_issues || []).includes('unreachable'))

    // Still nobody to receive a document request until the invite is accepted.
    const clar = await one('select public.request_clarification($1,$2,null,$3,null,7) as r',
      [orphan.id, 'فحص آلي', 'documents'])
    ok('المطالبة تنتظر قبول الدعوة', clar.r?.ok === false, clar.r?.reason || 'مرّت!')

    // Accepting is what the sign-up path does: a user lands in that tenant.
    await c.query('set local role postgres')
    await c.query(`insert into public.users (id, email, role, status, tenant_id)
                   values ('probe_user_088', 'probe-invite@example.com', 'company_admin', 'active', $1)`,
                  [inv.r.tenant_id])
    await c.query('set local role authenticated')

    const after = await one('select claimed_by, invite_status from public.company_roster() where company_id = $1', [orphan.id])
    ok('بعد القبول يصير مُستلَماً', !!after.claimed_by, after.claimed_by || 'فارغ')
    ok('وحالة الدعوة تصير مقبولة', after.invite_status === 'accepted', after.invite_status)

    const nowClar = await one('select public.request_clarification($1,$2,null,$3,null,7) as r',
      [orphan.id, 'فحص آلي', 'documents'])
    ok('والآن تُطالَب بالمستندات', nowClar.r?.ok === true, nowClar.r?.reason || '')

    const dup = await one('select public.invite_company($1,$2,null) as r',
      [orphan.id, 'probe-invite2@example.com'])
    ok('لا تُدعى شركة استلمت سجلّها', dup.r?.ok === false, dup.r?.reason || 'مرّت!')
  }

  // ---- the path the browser cannot take ------------------------------------
  // /api/invite-user holds the Clerk secret, so it calls the function with the
  // service role key — a JWT with no subject. get_current_user_id() is null
  // there, so the function refused the very caller that had authenticated. It
  // now takes the administrator's id explicitly and verifies it here, which is
  // the check that does not depend on the endpoint being right.
  const orphan2 = await one(`
    select c.id from public.companies c
     where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
     limit 1`)
  if (orphan2) {
    const asService = async (actor) => {
      await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`)
      const r = await one('select public.invite_company($1,$2,$3,$4) as r',
        [orphan2.id, 'probe-svc@example.com', 'فحص', actor])
      await c.query('select set_config($1,$2,true)',
        ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])
      return r.r
    }

    ok('الخادم بلا مسؤول مذكور مرفوض', (await asService(null))?.ok === false)
    ok('مسؤول غير موجود مرفوض', (await asService('user_nope'))?.ok === false)
    if (member) ok('مستخدم عادي كمسؤول مرفوض', (await asService(member.id))?.ok === false)

    const good = await asService(admin.id)
    ok('الخادم بمسؤول حقيقي ينجح', good?.ok === true, good?.reason || '')

    const attributed = await one(
      `select actor_id from public.company_audit_log
        where company_id = $1 and action = 'claim_invited' order by created_at desc limit 1`,
      [orphan2.id])
    ok('والدعوة منسوبة لمن أذن بها', attributed?.actor_id === admin.id, attributed?.actor_id || 'لا أحد')

    // A browser session must not be able to name someone else.
    if (member) {
      await c.query('select set_config($1,$2,true)',
        ['request.jwt.claims', JSON.stringify({ sub: member.id, role: 'authenticated' })])
      const stolen = await one('select public.invite_company($1,$2,null,$3) as r',
        [orphan2.id, 'probe-steal@example.com', admin.id])
      ok('عضو شركة لا ينتحل مسؤولاً عبر المعامل', stolen.r?.ok === false, stolen.r?.reason || 'مرّ!')
      await c.query('select set_config($1,$2,true)',
        ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])
    }
  }
}

// ---- adding a company now needs its commercial registration -----------------
// 096 made the document mandatory for a subscribed company. Three callers write
// to this table and only one of them is that case; the other two must keep
// working, and nothing else guards them.
console.log('\n  إلزام السجل التجاري عند الإضافة\n')
{
  const cr = () => '99' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')

  if (member) {
    await c.query('select set_config($1,$2,true)',
      ['request.jwt.claims', JSON.stringify({ sub: member.id, role: 'authenticated' })])
    const refused = await raises(
      `insert into public.companies (name, cr_number, approved, source)
       values ('شركة فحص المستند', $1, false, 'community')`, [cr()])
    ok('شركة مشتركة بلا مستند: مرفوضة', !!refused, refused || 'مرّت!')

    const withDoc = await raises(
      `insert into public.companies (name, cr_number, approved, source, cr_file_url)
       values ('شركة فحص المستند', $1, false, 'community', 'data:application/pdf;base64,ZmFrZQ==')`,
      [cr()])
    ok('  ومع المستند: مقبولة', !withDoc, withDoc || '')
  }

  // Registration creates the company BEFORE the tenant exists, so the person has
  // no tenant at that moment. If this broke, nobody could sign up at all — and
  // it would break silently, at the one step that has no other route.
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: 'probe_no_tenant_user', role: 'authenticated' })])
  const onboarding = await raises(
    `insert into public.companies (name, cr_number, approved, source)
     values ('شركة فحص التسجيل', $1, false, 'community')`, [cr()])
  ok('مسار التسجيل (بلا كيان بعد): يعمل', !onboarding, onboarding || '')

  // Bulk import runs as Marsad and has no certificate per row.
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  const asAdmin = await raises(
    `insert into public.companies (name, cr_number, approved, source)
     values ('شركة فحص الاستيراد', $1, false, 'community')`, [cr()])
  ok('الاستيراد الجماعي كإدارة: يعمل', !asAdmin, asAdmin || '')
}

// ---- neither function answers without a session ----------------------------
console.log('')
await c.query("select set_config('request.jwt.claims', '', true)")
{
  const n = (await q('select * from public.company_duplicates(0.55, 10)')).length
  ok('التكرارات مغلقة بلا جلسة', n === 0, n > 0 ? `سرّبت ${n}` : '')
  const co = await one('select id from public.companies limit 1')
  const msg = await raises('select public.admin_update_company($1, $2::jsonb, $3)',
    [co.id, JSON.stringify({ name: 'x' }), 'x'])
  ok('التعديل مغلق بلا جلسة', !!msg, msg || 'مرّ!')
}

await c.query('rollback')
console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ التصحيح والدمج يعملان ولا يفقدان شيئاً\n')
await c.end()
process.exit(fail ? 1 : 0)
