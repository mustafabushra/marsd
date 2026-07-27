#!/usr/bin/env node
/**
 * The objection path, run as real accounts.
 *
 * This is the one part of Marsad with a legal shape to it: the platform
 * publishes an adverse claim about a named business, and the business must be
 * able to answer it. Every rule about who may object to what is therefore worth
 * more than a comment — so each is attempted here and each must be refused or
 * allowed exactly as written.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 * Usage: node scripts/probe-disputes.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failures = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { console.log(`  ❌ ${m}`); failures++ }

const REASON = 'هذا التقرير لا يعبّر عن الواقع، وقد سُدّدت المستحقات كاملةً بموجب سند قبض مرفق.'

// The probe builds its own situation rather than hunting for one. No registered
// company currently has a report against it — the seed only reports on
// unclaimed companies — and a check that skips itself when the data happens not
// to suit it is a check that will quietly stop running.
const { rows: [subject] } = await c.query(`
  select t.id as tenant_id, t.name as tenant, t.company_id, co.name as company,
         (select u.id from public.users u
           where u.tenant_id = t.id and u.role = 'company_admin' and u.status = 'active' limit 1) as admin_id,
         (select u.id from public.users u
           where u.tenant_id = t.id and u.role = 'company_member' and u.status = 'active' limit 1) as member_id
    from public.tenants t
    join public.companies co on co.id = t.company_id
   where t.company_id is not null and t.status = 'active'
     and exists (select 1 from public.users u
                  where u.tenant_id = t.id and u.role = 'company_admin' and u.status = 'active')
   limit 1`)

if (!subject?.admin_id) {
  console.error('\n  يلزم كيان له شركة ومدير.\n')
  await c.end(); process.exit(1)
}

const { rows: [reporterTenant] } = await c.query(
  'select id from public.tenants where id <> $1 and status = $2 limit 1', [subject.tenant_id, 'active'])

const { rows: [admin] } = await c.query(
  "select id, email from public.users where role = 'platform_admin' and status = 'active' limit 1")

console.log(`\n  الشركة المُشتكى عليها: ${subject.company}  (كيان: ${subject.tenant})`)
console.log(`  إدارة مرصد: ${admin?.email || '—'}`)

const as = async (id) => {
  await c.query('set local role postgres')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: id, role: 'authenticated' })])
}

/**
 * Back to being nobody.
 *
 * `set local role postgres` changes the role and leaves request.jwt.claims
 * exactly where it was, so get_current_user_id() keeps returning whoever was
 * last impersonated and every SECURITY DEFINER guard keeps applying to them.
 * The probe hit that twice: reading a second tenant returned nothing because
 * the tenants policy still saw the first company, and re-opening a dispute as
 * "postgres" was refused by the guard that stops a company resolving its own.
 * Both looked like the product misbehaving. The claim has to be cleared too.
 */
const asService = async () => {
  await c.query('set local role postgres')
  await c.query("select set_config('request.jwt.claims', '', true)")
}

const attempt = async (label, sql, params, expect) => {
  await c.query('savepoint s')
  let outcome, detail = ''
  try {
    const { rowCount } = await c.query(sql, params)
    outcome = rowCount > 0 ? 'allowed' : 'blocked'
  } catch (e) {
    outcome = 'blocked'
    detail = ' — ' + e.message.split('\n')[0]
  }
  if (outcome !== expect) await c.query('rollback to savepoint s')
  else if (expect === 'blocked') await c.query('rollback to savepoint s')
  else await c.query('release savepoint s')

  outcome === expect
    ? ok(`${label}: ${expect === 'allowed' ? 'مسموح' : 'مرفوض'}${expect === 'blocked' ? detail : ''}`)
    : bad(`${label}: ${outcome === 'allowed' ? 'مسموح' : 'مرفوض'} — والمتوقّع ${expect === 'allowed' ? 'مسموح' : 'مرفوض'}${detail}`)
  return outcome === expect
}

await c.query('begin')

// The report being objected to: approved, filed by someone else, about this
// company. Created here so it dies with the rollback.
const { rows: [fixture] } = await c.query(`
  insert into public.reports (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, approved_at)
  values ($1, $2, 'approved', now() - interval '40 days', 'default', now())
  returning id`, [reporterTenant.id, subject.company_id])
subject.report_id = fixture.id
subject.reporter_tenant_id = reporterTenant.id
await c.query('select public.compute_trust_score($1)', [subject.company_id])
console.log(`  التقرير المُنشأ للفحص: ${subject.report_id}\n`)

const insert = `insert into public.disputes (report_id, company_id, raised_by_tenant_id, raised_by_user_id, reason)
                values ($1, $2, $3, $4, $5)`

// ── who may object ──────────────────────────────────────────────────────────
await as(subject.member_id || subject.admin_id)
if (subject.member_id) {
  await attempt('عضو (غير مدير) يعترض', insert,
    [subject.report_id, subject.company_id, subject.tenant_id, subject.member_id, REASON], 'blocked')
}

await as(subject.admin_id)
await attempt('سبب قصير', insert,
  [subject.report_id, subject.company_id, subject.tenant_id, subject.admin_id, 'غير صحيح'], 'blocked')

await asService()
const { rows: [other] } = await c.query(`
  select t.id, t.company_id,
         (select u.id from public.users u where u.tenant_id = t.id and u.role = 'company_admin' limit 1) as admin_id
    from public.tenants t where t.id <> $1 and t.company_id is not null limit 1`, [subject.tenant_id])
if (other?.admin_id) {
  await as(other.admin_id)
  await attempt('شركة أخرى تعترض على تقرير ليس عنها', insert,
    [subject.report_id, other.company_id, other.id, other.admin_id, REASON], 'blocked')
}

// ── the real one ────────────────────────────────────────────────────────────
console.log('')
await as(subject.admin_id)
const raised = await attempt('الشركة المذكورة تعترض', insert,
  [subject.report_id, subject.company_id, subject.tenant_id, subject.admin_id, REASON], 'allowed')

if (raised) {
  await attempt('اعتراض ثانٍ مفتوح على نفس التقرير', insert,
    [subject.report_id, subject.company_id, subject.tenant_id, subject.admin_id, REASON], 'blocked')

  await attempt('الشركة تفصل في اعتراضها بنفسها',
    "update public.disputes set status = 'upheld' where report_id = $1", [subject.report_id], 'blocked')

  await attempt('الشركة تعدّل سبب اعتراضها',
    "update public.disputes set reason = 'نص آخر' where report_id = $1", [subject.report_id], 'blocked')

  await attempt('الشركة تسحب اعتراضها',
    "update public.disputes set status = 'withdrawn' where report_id = $1 and status = 'open'",
    [subject.report_id], 'allowed')
}

// ── the other side can see it ───────────────────────────────────────────────
console.log('')
await asService()
const { rows: [reporter] } = await c.query(`
  select u.id from public.users u
   where u.tenant_id = $1 and u.status = 'active' limit 1`, [subject.reporter_tenant_id])

// Re-open one to test visibility and resolution.
await asService()
await c.query(`update public.disputes set status = 'open' where report_id = $1`, [subject.report_id])

if (reporter) {
  await as(reporter.id)
  const { rows } = await c.query('select id from public.disputes where report_id = $1', [subject.report_id])
  rows.length
    ? ok('الشركة صاحبة التقرير ترى الاعتراض عليه')
    : bad('الشركة صاحبة التقرير لا ترى الاعتراض — الفصل بلا علمها')
}

await asService()
const { rows: [outsider] } = await c.query(`
  select u.id from public.users u
   where u.tenant_id is not null and u.tenant_id <> $1 and u.tenant_id <> $2
     and u.role <> 'platform_admin' and u.status = 'active' limit 1`,
  [subject.tenant_id, subject.reporter_tenant_id])
if (outsider) {
  await as(outsider.id)
  const { rows } = await c.query('select id from public.disputes where report_id = $1', [subject.report_id])
  rows.length ? bad('طرف لا علاقة له يرى الاعتراض!') : ok('طرف لا علاقة له لا يراه')
}

// ── upholding takes the report down and moves the score ─────────────────────
console.log('')
if (admin) {
  await asService()
  const { rows: [{ score: scoreBefore }] } = await c.query(
    'select coalesce(max(score), -1) as score from public.trust_scores where company_id = $1', [subject.company_id])
  let scoreAfter = scoreBefore
  const { rows: [{ id: disputeId }] } = await c.query(
    "select id from public.disputes where report_id = $1 and status = 'open' limit 1", [subject.report_id])

  await as(admin.id)
  try {
    await c.query('select public.resolve_dispute($1, true, $2)', [disputeId, 'قُبل الاعتراض — فحص آلي'])
    ok('إدارة مرصد تقبل الاعتراض')
  } catch (e) { bad(`الفصل فشل: ${e.message.split('\n')[0]}`) }

  await asService()
  const { rows: [rep] } = await c.query('select status from public.reports where id = $1', [subject.report_id])
  rep.status === 'rejected' ? ok('التقرير سُحب مع قبول الاعتراض') : bad(`التقرير ما زال ${rep.status}`)

  ;({ rows: [{ score: scoreAfter }] } = await c.query(
    'select coalesce(max(score), -1) as score from public.trust_scores where company_id = $1', [subject.company_id]))

  // The invariant is that the withdrawn report stops counting — not that the
  // score moves. A company below the evidence threshold scores 0 before and 0
  // after, correctly, and asserting on the number called that a failure.
  const { rows: [{ n: countedAfter }] } = await c.query(
    'select coalesce(max(approved_reports), -1) as n from public.trust_scores where company_id = $1',
    [subject.company_id])
  const { rows: [{ n: actuallyApproved }] } = await c.query(
    "select count(*)::int as n from public.reports where target_company_id = $1 and status = 'approved'",
    [subject.company_id])

  countedAfter === actuallyApproved
    ? ok(`الدرجة أُعيد احتسابها في نفس اللحظة: تُحصي ${countedAfter} تقريراً معتمداً (${scoreBefore} ← ${scoreAfter})`)
    : bad(`الدرجة تُحصي ${countedAfter} تقريراً والمعتمد فعلاً ${actuallyApproved} — تقرير مسحوب ما زال محسوباً`)

  await as(admin.id)
  await attempt('الفصل مرتين في نفس الاعتراض',
    'select public.resolve_dispute($1, false, null)', [disputeId], 'blocked')
}

await c.query('rollback')

const { rows: [{ count }] } = await c.query('select count(*) from public.disputes')
console.log(`\n  الاعتراضات في القاعدة بعد التراجع: ${count}`)

await c.end()
console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ مسار الاعتراض يعمل كما هو مكتوب\n')
process.exit(failures ? 1 : 0)
