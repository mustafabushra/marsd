#!/usr/bin/env node
/**
 * Does the partner programme exist, or does the page still just say it does?
 *
 * /partners advertised entry requirements, six benefits and four partner
 * companies. The companies were a hardcoded array of invented names, and the
 * application form wrote nothing anywhere — a company could read the terms,
 * apply, be thanked, and leave no trace.
 *
 * A partner is a company on a granted plan: an active subscription on a
 * zero-price plan with a real end date. So this checks the thing that matters
 * about that design — that the benefits actually arrive, and that they actually
 * stop.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 * Usage: node scripts/probe-partners.mjs
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
const claims = (o) => c.query('select set_config($1,$2,true)',
  ['request.jwt.claims', JSON.stringify(o)])

const [admin] = await q("select id from public.users where role = 'platform_admin' limit 1")
// A company admin whose tenant is not already a partner.
//
// The probe walks one tenant through the whole life of a partnership — apply,
// appoint, revoke — so it needs a tenant with none. It took whichever company
// admin came back first, and on 1 August an administrator appointed that very
// tenant a partner, with a reason on the record. Every step then reported a
// defect while saying exactly what it should: «أنتم شركاء بالفعل».
//
// That appointment is production data and stays. The probe states the condition
// it always depended on instead of hoping the first row still meets it.
const [tadmin] = await q(`select u.id, u.tenant_id from public.users u
                           where u.role = 'company_admin' and u.tenant_id is not null
                             and not exists (select 1 from public.partner_applications pa
                                              where pa.tenant_id = u.tenant_id)
                             -- Not enough on its own. A tenant can sit on the
                             -- partner plan with no application row at all —
                             -- two do — and the probe then walked one through
                             -- «apply» and was told «أنتم شركاء بالفعل» at every
                             -- step. Being a partner is the subscription, not
                             -- the paperwork, so both are asked.
                             and not exists (select 1 from public.subscriptions s
                                               join public.plans p on p.id = s.plan_id
                                              where s.tenant_id = u.tenant_id
                                                and p.code = 'partner')
                           limit 1`)
const [member] = await q(`select id, tenant_id from public.users
                           where role = 'company_member' and tenant_id is not null limit 1`)

await c.query('begin')
await c.query('set local role authenticated')

console.log('')

// ---- the plan matches what the public page promises -------------------------
{
  const p = await one("select limits, features, price_monthly, active from public.plans where code = 'partner'")
  ok('باقة الشريك موجودة', !!p)
  if (p) {
    ok('  مجانية', Number(p.price_monthly) === 0)
    ok('  ١٠٠ بحث شهرياً كما تعد الصفحة', p.limits.searches_per_month === 100, `${p.limits.searches_per_month}`)
    ok('  تقارير بلا حد', p.limits.reports_per_month === -1)
    ok('  التقرير الكامل مفعّل', (p.features || []).includes('full_trust_report'), (p.features || []).join('، '))
  }
}

// ---- applying ---------------------------------------------------------------
let appId
if (tadmin) {
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const r = await one('select public.apply_for_partnership($1,$2,$3,$4) as r',
    ['فحص آلي', 'فحص', 'probe-partner@example.com', null])
  ok('مدير الشركة يقدّم', r.r?.ok === true, r.r?.reason || '')
  appId = r.r?.application_id

  const snap = r.r?.snapshot || {}
  ok('  الطلب يحفظ صورة الإسهام لحظة التقديم',
     snap.reports_approved !== undefined && snap.companies_added !== undefined,
     JSON.stringify(snap))

  const again = await one('select public.apply_for_partnership($1) as r', ['مرة ثانية'])
  ok('  لا طلبان مفتوحان', again.r?.ok === false, again.r?.reason || 'مرّ!')
}

if (member) {
  await claims({ sub: member.id, role: 'authenticated' })
  const r = await one('select public.apply_for_partnership($1) as r', ['محاولة'])
  ok('عضو عادي لا يقدّم نيابة عن شركته', r.r?.ok === false, r.r?.reason || 'مرّ!')
}

// ---- deciding ---------------------------------------------------------------
if (appId) {
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const notAdmin = await one('select public.decide_partnership($1,true,$2,12) as r', [appId, 'محاولة'])
  ok('الشركة لا تعتمد نفسها', notAdmin.r?.ok === false, notAdmin.r?.reason || 'مرّ!')

  await claims({ sub: admin.id, role: 'authenticated' })
  const noReason = await one('select public.decide_partnership($1,true,$2,12) as r', [appId, ''])
  ok('قرار بلا سبب مرفوض', noReason.r?.ok === false, noReason.r?.reason || 'مرّ!')

  const done = await one('select public.decide_partnership($1,true,$2,12) as r', [appId, 'فحص آلي'])
  ok('الاعتماد ينجح', done.r?.ok === true, done.r?.reason || '')

  const twice = await one('select public.decide_partnership($1,false,$2) as r', [appId, 'مرة ثانية'])
  ok('  الطلب المحسوم لا يُحسم مرتين', twice.r?.ok === false, twice.r?.reason || 'مرّ!')

  // The point of the whole design: the benefits arrive through the normal plan
  // machinery, with no special case at read time.
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const ent = await one('select public.my_entitlements() as e')
  ok('الشركة تقرأ نفسها شريكاً', ent.e?.planCode === 'partner', ent.e?.planCode)
  ok('  وتحصل على ١٠٠ بحث', ent.e?.limits?.searches_per_month === 100)
  ok('  وعلى التقرير الكامل', (ent.e?.features || []).includes('full_trust_report'))

  // And it is on the public list, without a session.
  await c.query("select set_config('request.jwt.claims','',true)")
  const pub = await q('select * from public.public_partners()')
  ok('يظهر في القائمة العامة', pub.some((p) => !!p.name), `${pub.length} شريك`)
  ok('  ولا تنشر القائمة أكثر من الاسم والقطاع والعدد والتاريخ',
     pub.every((p) => Object.keys(p).length === 4), Object.keys(pub[0] || {}).join('، '))

  // ---- the term is real ------------------------------------------------------
  await claims({ sub: admin.id, role: 'authenticated' })
  const row = await one(`select tenant_id, state, days_left from public.partner_overview()
                          where tenant_id = $1`, [tadmin.tenant_id])
  ok('اللوحة تعرضه شريكاً حالياً', row?.state === 'partner', row?.state)
  ok('  ومدة الشراكة محسوبة', row?.days_left > 300, `${row?.days_left} يوماً`)

  // An expired subscription must stop granting. Without this the twelve months
  // are decoration.
  await c.query('set local role postgres')
  await c.query(`update public.subscriptions set current_period_end = now() - interval '1 day'
                  where tenant_id = $1`, [tadmin.tenant_id])
  await c.query('set local role authenticated')
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const expired = await one('select public.my_entitlements() as e')
  ok('الاشتراك المنتهي لا يمنح شيئاً', expired.e?.planCode !== 'partner', expired.e?.planCode)

  await c.query('set local role postgres')
  await c.query(`update public.subscriptions set current_period_end = now() + interval '300 days'
                  where tenant_id = $1`, [tadmin.tenant_id])
  await c.query('set local role authenticated')

  // ---- ending it early -------------------------------------------------------
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const notYours = await one('select public.revoke_partnership($1,$2) as r', [tadmin.tenant_id, 'محاولة'])
  ok('الشركة لا تسحب شراكتها بنفسها', notYours.r?.ok === false, notYours.r?.reason || 'مرّ!')

  await claims({ sub: admin.id, role: 'authenticated' })
  const noWhy = await one('select public.revoke_partnership($1,$2) as r', [tadmin.tenant_id, ''])
  ok('سحب بلا سبب مرفوض', noWhy.r?.ok === false, noWhy.r?.reason || 'مرّ!')

  const rev = await one('select public.revoke_partnership($1,$2) as r', [tadmin.tenant_id, 'فحص آلي'])
  ok('السحب ينجح', rev.r?.ok === true, rev.r?.reason || '')

  await claims({ sub: tadmin.id, role: 'authenticated' })
  const after = await one('select public.my_entitlements() as e')
  ok('  والمزايا تتوقف فوراً', after.e?.planCode !== 'partner', after.e?.planCode)

  await c.query("select set_config('request.jwt.claims','',true)")
  const pubAfter = await q('select * from public.public_partners()')
  ok('  ويختفي من القائمة العامة', pubAfter.length < pub.length, `${pubAfter.length}`)
}

// ---- appointing, which is the main way in -----------------------------------
// Marsad chooses partners after they register; the application form is the
// second path. A company with no contribution at all can still be appointed —
// the thresholds say who may claim partnership, not who Marsad may grant it to.
if (tadmin) {
  await claims({ sub: tadmin.id, role: 'authenticated' })
  const self = await one('select public.grant_partnership($1,$2) as r', [tadmin.tenant_id, 'محاولة'])
  ok('الشركة لا تعيّن نفسها', self.r?.ok === false, self.r?.reason || 'مرّ!')

  await claims({ sub: admin.id, role: 'authenticated' })
  const noWhy = await one('select public.grant_partnership($1,$2) as r', [tadmin.tenant_id, '  '])
  ok('تعيين بلا سبب مرفوض', noWhy.r?.ok === false, noWhy.r?.reason || 'مرّ!')

  const g = await one('select public.grant_partnership($1,$2,$3) as r',
    [tadmin.tenant_id, 'فحص آلي', 6])
  ok('التعيين المباشر ينجح', g.r?.ok === true, g.r?.reason || '')
  ok('  ويحفظ صورة الإسهام لحظة التعيين', g.r?.snapshot?.reports_approved !== undefined)

  await claims({ sub: tadmin.id, role: 'authenticated' })
  const ent = await one('select public.my_entitlements() as e')
  ok('  والمزايا تصل كأي شراكة', ent.e?.planCode === 'partner', ent.e?.planCode)

  await claims({ sub: admin.id, role: 'authenticated' })
  const row = await one('select state, origin, days_left from public.partner_overview() where tenant_id = $1',
    [tadmin.tenant_id])
  ok('  واللوحة تقول إنها بتعيين', row?.origin === 'appointed', row?.origin || 'لا شيء')
  ok('  والمدة المطلوبة محترمة', row?.days_left > 150 && row?.days_left < 200, `${row?.days_left} يوماً`)

  const twice = await one('select public.grant_partnership($1,$2) as r', [tadmin.tenant_id, 'مرة ثانية'])
  ok('  ولا يُعيَّن شريك قائم مرتين', twice.r?.ok === false, twice.r?.reason || 'مرّ!')

  const rev = await one('select public.revoke_partnership($1,$2) as r', [tadmin.tenant_id, 'فحص آلي'])
  ok('  والسحب يعمل على شراكة معيَّنة', rev.r?.ok === true, rev.r?.reason || '')
}

// ---- the last two promises on the page --------------------------------------
if (tadmin) {
  await claims({ sub: admin.id, role: 'authenticated' })
  const co = await one('select company_id from public.tenants where id = $1', [tadmin.tenant_id])

  const before = co?.company_id
    ? await one('select public.company_partner_status($1) as b', [co.company_id]) : null
  if (before) ok('لا شارة قبل الشراكة', before.b?.is_partner === false)

  // The score must be produced the same way on both sides, or the comparison
  // measures "no row became a row" instead of the effect of partnership.
  let scoreBefore = null
  if (co?.company_id) {
    await c.query('select public.compute_trust_score($1)', [co.company_id])
    scoreBefore = (await one('select score from public.trust_scores where company_id = $1', [co.company_id]))?.score
  }

  await one('select public.grant_partnership($1,$2,12) as r', [tadmin.tenant_id, 'فحص آلي'])

  const inQueue = await one('select is_partner from public.contributors_overview() where tenant_id = $1',
    [tadmin.tenant_id])
  ok('طابور المراجعة يعرف الشريك', inQueue?.is_partner === true, `${inQueue?.is_partner}`)

  if (co?.company_id) {
    const badge = await one('select public.company_partner_status($1) as b', [co.company_id])
    ok('الشارة تظهر', badge.b?.is_partner === true)
    ok('  ومعها التوضيح أنها لا تؤثر على المؤشر', !!badge.b?.note, badge.b?.note || 'بلا توضيح')

    // The disclaimer has to be true, not just present.
    await c.query('select public.compute_trust_score($1)', [co.company_id])
    const scoreAfter = (await one('select score from public.trust_scores where company_id = $1', [co.company_id]))?.score

    // 0 → 0 proves nothing: a company under the minimum report count is pinned
    // at zero and would compare equal whatever partnership did. Say that instead
    // of showing a green tick for a comparison that could not have failed.
    if (!scoreBefore) {
      console.log(`  ⏭  شركة هذا الكيان بلا مؤشر محسوب (${scoreBefore} → ${scoreAfter}) — المقارنة لا تُثبت شيئاً`)
    } else {
      ok('  والمؤشر لم يتغيّر بالشراكة', scoreAfter === scoreBefore, `${scoreBefore} → ${scoreAfter}`)
    }

    // Independent of any one company: partnership lives on the subscription, and
    // the score is computed from companies, reports and documents. If the word
    // "partner" ever appears inside the scoring functions, the disclaimer on the
    // badge has stopped being true and this fails wherever the data happens to sit.
    const leaks = await q(`
      select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('compute_trust_score', 'trust_layer_official',
                           'trust_layer_platform', 'trust_layer_community')
         and (pg_get_functiondef(p.oid) ilike '%partner%'
              or pg_get_functiondef(p.oid) ilike '%subscription%')`)
    ok('  ولا تقرأ دوال المؤشر الشراكة أصلاً', leaks.length === 0,
       leaks.map((l) => l.proname).join('، ') || 'لا شيء')
  }

  await one('select public.revoke_partnership($1,$2) as r', [tadmin.tenant_id, 'فحص آلي'])
  if (co?.company_id) {
    const gone = await one('select public.company_partner_status($1) as b', [co.company_id])
    ok('  والشارة تختفي بالسحب', gone.b?.is_partner === false)
  }
}

// ---- the admin view is admin-only -------------------------------------------
if (member) {
  await claims({ sub: member.id, role: 'authenticated' })
  const n = (await q('select * from public.partner_overview()')).length
  ok('لوحة الشركاء مغلقة على غير الإدارة', n === 0, n > 0 ? `سرّبت ${n}` : '')
}
await c.query("select set_config('request.jwt.claims','',true)")
{
  const n = (await q('select * from public.partner_overview()')).length
  ok('ومغلقة بلا جلسة', n === 0, n > 0 ? `سرّبت ${n}` : '')
}

await c.query('rollback')
console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ برنامج الشركاء حقيقي من الطلب حتى انتهاء المدة\n')
await c.end()
process.exit(fail ? 1 : 0)
