#!/usr/bin/env node
/**
 * A phone handoff does what it is allowed to, and nothing else.
 *
 * The point of this probe is not that the happy path works — that is the easy
 * half and it would pass even if every restriction were missing. It is that
 * each restriction *refuses*. A five-minute expiry that never rejects an old
 * token, or a single use that files two documents, is worse than no limit at
 * all: it is a limit somebody is relying on.
 *
 * Everything runs inside a transaction that is rolled back, so a run leaves the
 * database exactly as it found it. The fixtures are created here rather than
 * borrowed from live data — a probe that depends on a row somebody else can
 * change is a probe that fails for reasons that are not defects.
 *
 *   node scripts/probe-upload-handoff.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0

const ok = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * Run something that must be refused, and report the refusal.
 *
 * Inside a savepoint, because in Postgres a failed statement poisons the whole
 * transaction: every check after the first refusal reported «rejected for
 * another reason — current transaction is aborted», which is the probe
 * describing its own damage and calling it a finding.
 */
let mark = 0
const refuses = async (name, fn, expect) => {
  const sp = `probe_${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try {
    await fn()
    await c.query(`release savepoint ${sp}`)
    fail += 1
    console.log(`  ❌ ${name} — لم يُرفض`)
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const matched = !expect || e.message.includes(expect)
    if (matched) { pass += 1; console.log(`  ✅ ${name}`) }
    else { fail += 1; console.log(`  ❌ ${name} — رُفض لسبب آخر: ${e.message.slice(0, 60)}`) }
  }
}

/** Speak as a signed-in person, the way PostgREST does. */
const asUser = (id) => c.query(
  `select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

/** Speak as the server. */
const asServer = () => c.query(
  `select set_config('request.jwt.claims', '{"role":"service_role"}', true)`)

try {
  await c.query('begin')

  // --- Fixtures ------------------------------------------------------------
  const { rows: [co] } = await c.query(
    `insert into public.companies (name, cr_number) values ('شركة فحص التسليم', $1) returning id`,
    [`P${Date.now()}`])
  const { rows: [tn] } = await c.query(
    `insert into public.tenants (name, cr_number, email, company_id)
     values ('مستأجر فحص التسليم', $1, 'probe.handoff@example.com', $2) returning id`,
    [`T${Date.now()}`, co.id])
  const userId = 'user_probe_handoff'
  await c.query(
    `insert into public.users (id, email, role, tenant_id)
     values ($1, 'probe.handoff@example.com', 'company_admin', $2)`,
    [userId, tn.id])

  console.log('\n  الطريق الصحيح\n')

  await asUser(userId)
  const { rows: [h] } = await c.query(
    `select * from public.create_upload_handoff('commercial_registration')`)

  ok('يُصدر رمزاً', !!h?.token && h.token.length > 30)
  ok('الرمز آمن في رابط', /^[A-Za-z0-9_-]+$/.test(h?.token || ''),
    'يحتوي محارف تُكسر في العنوان')
  ok('صلاحية خمس دقائق', Math.abs((new Date(h.expires_at) - Date.now()) / 1000 - 300) < 20)

  // The token itself must not be recoverable from the row.
  const { rows: [stored] } = await c.query(
    `select token_hash from public.upload_handoffs order by created_at desc limit 1`)
  ok('الرمز نفسه غير مُخزَّن', !stored.token_hash.includes(h.token)
    && /^[0-9a-f]{64}$/.test(stored.token_hash))

  await asServer()
  const { rows: [opened] } = await c.query(
    `select * from public.open_upload_handoff($1)`, [h.token])
  ok('الجوال يفتح الرمز', opened?.doc_type === 'commercial_registration')
  ok('يعرض اسم الشركة', opened?.company_name === 'شركة فحص التسليم')
  ok('يعرض اسم المستند بالعربية', opened?.doc_label === 'السجل التجاري',
    `جاء «${opened?.doc_label}»`)

  const path = `${co.id}/commercial_registration-probe.pdf`
  const { rows: [{ finish_upload_handoff: docId }] } = await c.query(
    `select public.finish_upload_handoff($1, $2, $3)`, [h.token, path, 'سجل.pdf'])
  ok('يُنشئ مستنداً', !!docId)

  const { rows: [doc] } = await c.query(
    `select company_id, doc_type, status, file_url, uploaded_by_user_id
       from public.company_documents where id = $1`, [docId])
  ok('المستند للشركة الصحيحة', doc.company_id === co.id)
  ok('المستند بحالة «قيد المراجعة»', doc.status === 'pending',
    `جاء «${doc.status}» — الحماية الأخيرة هي مراجعة موظف`)
  ok('منسوب لمن أنشأ الرمز', doc.uploaded_by_user_id === userId)

  console.log('\n  ما يجب أن يُرفض\n')

  await refuses('رمز مستهلك لا يُفتح ثانية',
    () => c.query(`select * from public.open_upload_handoff($1)`, [h.token]),
    'استُخدم')

  await refuses('رمز مستهلك لا يرفع مستنداً ثانياً',
    () => c.query(`select public.finish_upload_handoff($1, $2, $3)`, [h.token, path, 'مرة أخرى.pdf']),
    'استُخدم')

  await refuses('رمز مخترَع لا يعمل',
    () => c.query(`select * from public.open_upload_handoff('لا-يوجد-رمز-كهذا')`),
    'غير صالح')

  // Expiry. Aged by hand rather than waited for: a probe that sleeps five
  // minutes is a probe nobody runs.
  await asUser(userId)
  const { rows: [old] } = await c.query(
    `select * from public.create_upload_handoff('vat_certificate')`)
  await asServer()
  await c.query(
    `update public.upload_handoffs set expires_at = now() - interval '1 minute'
      where token_hash = encode(digest($1, 'sha256'), 'hex')`, [old.token])
  await refuses('رمز منتهٍ لا يُفتح',
    () => c.query(`select * from public.open_upload_handoff($1)`, [old.token]), 'انتهت')
  await refuses('رمز منتهٍ لا يرفع',
    () => c.query(`select public.finish_upload_handoff($1, $2, $3)`,
      [old.token, `${co.id}/vat_certificate-x.pdf`, 'x.pdf']), 'انتهت')

  // A path belonging to another company. This is the check that stops a
  // handoff from filing a document against a company it was never issued for.
  await asUser(userId)
  const { rows: [stray] } = await c.query(
    `select * from public.create_upload_handoff('zakat_certificate')`)
  await asServer()
  await refuses('مسار شركة أخرى مرفوض',
    () => c.query(`select public.finish_upload_handoff($1, $2, $3)`,
      [stray.token, '00000000-0000-0000-0000-000000000000/zakat.pdf', 'z.pdf']),
    'لا يخص')

  // An unknown document type.
  await asUser(userId)
  await refuses('نوع مستند مخترَع مرفوض',
    () => c.query(`select * from public.create_upload_handoff('شيء_غير_موجود')`),
    'غير معروف')

  // Three signed URLs, not unlimited.
  await asUser(userId)
  const { rows: [lim] } = await c.query(
    `select * from public.create_upload_handoff('national_address')`)
  await asServer()
  for (let i = 0; i < 3; i += 1) {
    await c.query(`select * from public.open_upload_handoff($1)`, [lim.token])
  }
  await refuses('الفتح الرابع مرفوض',
    () => c.query(`select * from public.open_upload_handoff($1)`, [lim.token]),
    'محاولات كثيرة')

  // Nobody signed in can read the table.
  console.log('\n  ما لا يراه أحد\n')
  const { rows: grants } = await c.query(`
    select grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'upload_handoffs'
       and grantee in ('anon', 'authenticated', 'public')`)
  ok('جدول التسليم غير مقروء من المتصفح', grants.length === 0,
    grants.map((g) => `${g.grantee}:${g.privilege_type}`).join(', '))

  const { rows: fnGrants } = await c.query(`
    select p.proname, a.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) acl
      join pg_roles a on a.oid = acl.grantee
     where n.nspname = 'public'
       and p.proname in ('open_upload_handoff', 'finish_upload_handoff')
       and a.rolname in ('anon', 'authenticated')`)
  ok('دوال الجوال لا يستدعيها المتصفح', fnGrants.length === 0,
    fnGrants.map((g) => `${g.proname}→${g.rolname}`).join(', '))

  // The rate limit.
  await asUser(userId)
  await refuses('حدّ عشرة رموز في الساعة', async () => {
    for (let i = 0; i < 12; i += 1) {
      await c.query(`select * from public.create_upload_handoff('owner_id')`)
    }
  }, 'عدد كبير')

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — التسليم يفعل ما له ويرفض ما ليس له\n`)
process.exit(fail ? 1 : 0)
