#!/usr/bin/env node
/**
 * Marsad can file a report, and cannot file one in somebody else's name.
 *
 * Reports arrive from tenants. Marsad's own staff have no tenant, and
 * `reports_insert_policy` requires `reporter_tenant_id = get_current_tenant_id()`,
 * so an administrator could not record a report at all.
 *
 * The widening this could have been — letting platform admins insert directly —
 * would have let an administrator write any reporter they liked, including a
 * real company's, and the row would be indistinguishable from one that company
 * filed. A report is testimony; who gave it is the whole of its weight. So the
 * reporter is resolved by the function and is not a parameter, and this proves
 * both halves: that it works, and that it cannot be aimed elsewhere.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 *   node scripts/probe-admin-report.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
let mark = 0

const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Inside a savepoint: a failed statement poisons the whole transaction. */
const refuses = async (name, fn, expect) => {
  const sp = `p${(mark += 1)}`
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
    else { fail += 1; console.log(`  ❌ ${name} — رُفض لسبب آخر: ${e.message.slice(0, 70)}`) }
  }
}

const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

const call = (companyId, extra = {}) => c.query(
  `select public.admin_create_report(
     $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as id`,
  [companyId,
   extra.category ?? 'late_payment',
   extra.title ?? 'تأخّر عن السداد المتفق عليه',
   extra.description ?? 'أثبتت إدارة مرصد التأخّر بمستندات من طرفين مستقلّين.',
   extra.dealtAt ?? new Date().toISOString(),
   extra.payment ?? 'late',
   extra.delay ?? 45,
   extra.defaulted ?? false,
   extra.value ?? 120000,
   extra.relationship ?? null,
   extra.codes ?? null,
   extra.notes ?? 'مرجع داخلي 2026-08'])

try {
  await c.query('begin')

  // --- Fixtures ---------------------------------------------------------------
  const stamp = Date.now()
  const { rows: [co] } = await c.query(`
    insert into public.companies (name, cr_number, source, status, approved)
    values ('شركة هدف تقرير الإدارة', $1, 'community', 'active', true)
    returning id`, [`A${stamp}`])

  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)
  if (!admin) throw new Error('لا مدير منصة — تعذّر الإثبات')

  const { rows: [marsad] } = await c.query(
    `select id, name, company_id from public.tenants
      where cr_number = 'MARSAD-PLATFORM' and company_id is null limit 1`)
  // Found by its reserved registration number, not by name. There is already a
  // customer's account called «مرصد» — with a company_id and a real owner — and
  // resolving by name would have filed the platform's reports in their name.
  ok('مستأجر المنصّة موجود وليس حساب شركة', !!marsad?.id && marsad.company_id === null,
    'لا مستأجر برقم MARSAD-PLATFORM')
  if (!marsad) throw new Error('لا مستأجر للمنصّة — لا شيء بعده يعني شيئاً')

  // --- Who may call it ---------------------------------------------------------
  const { rows: [member] } = await c.query(
    `select id from public.users where role = 'company_admin' and tenant_id is not null limit 1`)

  if (member) {
    await asUser(member.id)
    await refuses('حساب شركة لا يستطيع استدعاءها', () => call(co.id), 'لإدارة مرصد فقط')
  }

  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await refuses('ولا يستطيع مجهول', () => call(co.id), 'لإدارة مرصد فقط')

  // --- The administrator --------------------------------------------------------
  await asUser(admin.id)
  const { rows: [{ id: reportId }] } = await call(co.id)
  ok('المدير يسجّل تقريراً', !!reportId)

  const { rows: [r] } = await c.query(
    `select reporter_tenant_id, target_company_id, status, category, delay_days,
            declaration_accepted, submitted_at
       from public.reports where id = $1`, [reportId])

  ok('المُبلِّغ هو مرصد', r.reporter_tenant_id === marsad.id)
  ok('على الشركة المقصودة', r.target_company_id === co.id)
  ok('ويدخل طابور المراجعة، لا معتمداً', r.status === 'pending_review',
    `جاء «${r.status}» — باب ثانٍ إلى التقارير المعتمدة`)
  ok('الحقول محفوظة كما أُرسلت', r.category === 'late_payment' && r.delay_days === 45)
  ok('والإقرار مسجَّل', r.declaration_accepted === true && !!r.submitted_at)

  // --- Who pressed the button ----------------------------------------------------
  const { rows: [log] } = await c.query(`
    select actor_id, action, tenant_id from public.audit_logs
     where entity = 'report' and entity_id = $1::text
     order by created_at desc limit 1`, [reportId])
  ok('التدقيق يسجّل الموظّف الذي أدخله',
    log?.actor_id === admin.id && log?.action === 'admin_report_created',
    JSON.stringify(log || null))

  // --- The rules that apply to everyone else apply here too -----------------------
  // BR-05 fires on this insert like any other: Marsad cannot report the same
  // company twice inside ninety days either.
  await refuses('BR-05 تسري على مرصد أيضاً', () => call(co.id), '90 يوم')

  await refuses('شركة غير موجودة مرفوضة',
    () => call('00000000-0000-0000-0000-000000000000'))

  await refuses('بلا شركة مرفوض', () => call(null), 'مطلوبة')

  // --- It cannot be aimed elsewhere ------------------------------------------------
  // There is no parameter for the reporter, so this is checked by signature
  // rather than by attempting it: a function that accepted one would be the
  // vulnerability, and the absence is the guarantee.
  const { rows: [sig] } = await c.query(`
    select pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_create_report'`)
  ok('لا معامل للمُبلِّغ — لا يمكن توجيهه لجهة أخرى',
    !!sig && !/reporter|tenant/i.test(sig.args), sig?.args?.slice(0, 90))

  // --- And the browser cannot reach past it ------------------------------------------
  const { rows: pol } = await c.query(`
    select with_check from pg_policies
     where tablename = 'reports' and cmd = 'INSERT'`)
  ok('سياسة الإدراج ما زالت تشترط مستأجر المتصل',
    pol.some((p) => /get_current_tenant_id/.test(p.with_check || '')),
    'لو وُسّعت لصار بإمكان المدير الكتابة باسم أي شركة')

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — مرصد تُبلّغ باسمها وحدها\n`)
process.exit(fail ? 1 : 0)
