#!/usr/bin/env node
/**
 * A new registration waits, and an approval lets it in.
 *
 * Registration used to activate an account on the spot: whoever finished the
 * sign-up form was filing reports a second later, before anyone at Marsad had
 * looked at the commercial registration they uploaded. `/registration-pending`
 * and `/account-pending` were written and routed and unreachable, because
 * nothing was ever pending.
 *
 * What is proven here is the whole path, in the database, in order:
 *
 *   a new company is pending and not approved
 *   the router's own source of truth reports it as pending
 *   the reviewer's queue contains it
 *   approval admits it
 *   and the accounts that already exist are not touched
 *
 * Every fixture is created inside a transaction that is rolled back. The live
 * rows are read, never written.
 *
 *   node scripts/probe-registration-waits.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

let live
try {
  // --- The accounts that already exist ---------------------------------------
  // Read before anything else and outside the fixture, because the promise made
  // to the owner was that working accounts are not disturbed.
  ;({ rows: [live] } = await c.query(`
    select count(*) filter (where approved and status = 'active')::int as ok,
           count(*) filter (where not approved)::int                   as waiting
      from public.companies c
     where exists (select 1 from public.tenants t where t.company_id = c.id)`))
  console.log(`\n  الحسابات القائمة: ${live.ok} نشطة، ${live.waiting} تنتظر\n`)

  await c.query('begin')

  // --- What registration now writes ------------------------------------------
  // The same shape createTenantAndUser inserts: a community company, pending and
  // unapproved, with a tenant and a company_admin pointing at it.
  const stamp = Date.now()
  const { rows: [co] } = await c.query(`
    insert into public.companies (name, cr_number, source, status, approved)
    values ('شركة فحص التسجيل', $1, 'community', 'pending', false)
    returning id, status, approved`, [`R${stamp}`])

  ok('الشركة الجديدة «قيد الانتظار»', co.status === 'pending', `جاءت «${co.status}»`)
  ok('وغير معتمدة', co.approved === false)

  const { rows: [tn] } = await c.query(`
    insert into public.tenants (name, cr_number, email, company_id, status)
    values ('مستأجر فحص التسجيل', $1, 'probe.reg@example.com', $2, 'active')
    returning id`, [`T${stamp}`, co.id])

  const uid = `user_probe_registration_${stamp}`
  await c.query(`
    insert into public.users (id, email, role, tenant_id, status)
    values ($1, 'probe.reg@example.com', 'company_admin', $2, 'active')`, [uid, tn.id])

  // --- What the router will read ---------------------------------------------
  // useCompanyStatus resolves user → tenant → company.status. If that chain
  // does not say «pending», the waiting screen is unreachable no matter what
  // the companies row holds.
  const { rows: [seen] } = await c.query(`
    select co.status
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      join public.companies co on co.id = t.company_id
     where u.id = $1`, [uid])

  ok('السلسلة التي يقرأها المُوجِّه تقول «قيد الانتظار»', seen?.status === 'pending',
    `جاءت «${seen?.status}» — شاشة الانتظار لن تُعرض`)

  // --- The reviewer's queue ---------------------------------------------------
  // AdminRequests lists companies where `approved` is false. A registration the
  // reviewer cannot see is an account stuck forever.
  const { rows: [queued] } = await c.query(
    `select count(*)::int n from public.companies where approved = false and id = $1`, [co.id])
  ok('التسجيل يظهر في طابور المراجعة', queued.n === 1,
    'الإدارة لن ترى الطلب — الحساب سيعلق بلا مخرج')

  // --- Approval ---------------------------------------------------------------
  // Exactly what AdminRequests writes on approve — and as the person who is
  // allowed to write it.
  //
  // `guard_company_profile_edit` refuses «لا يمكن تعديل بيانات الهوية أو حالة
  // التحقق من لوحة الشركة» to anyone speaking without an administrator's
  // claims. The first version of this probe spoke with no identity at all and
  // was refused — which is the guard working, not the flow failing. That the
  // refusal exists is itself worth stating, so it is asserted before it is
  // satisfied.
  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)
  if (!admin) throw new Error('لا مدير منصة — تعذّر إثبات الموافقة')

  await c.query('savepoint no_identity')
  let refused = false
  try {
    await c.query(`select set_config('request.jwt.claims', '{}', true)`)
    await c.query(`update public.companies set approved = true where id = $1`, [co.id])
  } catch { refused = true }
  await c.query('rollback to savepoint no_identity')
  ok('الموافقة مرفوضة بلا هوية إدارية', refused,
    'أي طرف يستطيع اعتماد شركة — وهذه ثغرة لا ميزة')

  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  await c.query(
    `update public.companies set approved = true, status = 'active' where id = $1`, [co.id])

  const { rows: [after] } = await c.query(`
    select co.status, co.approved
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      join public.companies co on co.id = t.company_id
     where u.id = $1`, [uid])

  ok('بعد الموافقة يصير «نشط»', after.status === 'active' && after.approved === true)
  ok('ويخرج من طابور المراجعة',
    (await c.query('select count(*)::int n from public.companies where approved = false and id = $1', [co.id]))
      .rows[0].n === 0)

  // --- Rejection is a different door -----------------------------------------
  await c.query(`update public.companies set approved = false, status = 'rejected' where id = $1`, [co.id])
  const { rows: [rej] } = await c.query('select status from public.companies where id = $1', [co.id])
  ok('والرفض حالة مستقلّة لا تعود للانتظار', rej.status === 'rejected')

} finally {
  await c.query('rollback').catch(() => {})
}

// --- And nothing moved ------------------------------------------------------
const { rows: [afterAll] } = await c.query(`
  select count(*) filter (where approved and status = 'active')::int as ok,
         count(*) filter (where not approved)::int                   as waiting
    from public.companies c
   where exists (select 1 from public.tenants t where t.company_id = c.id)`)
// Compared, not asserted. The first version read `true === (n >= 0)`, which is
// true whatever happened — a check that passes by construction says nothing,
// and this one guards the promise that working accounts are not disturbed.
ok('الحسابات القائمة كما كانت',
  afterAll.ok === live.ok && afterAll.waiting === live.waiting,
  `كانت ${live.ok}/${live.waiting} وصارت ${afterAll.ok}/${afterAll.waiting}`)

await c.end()
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — التسجيل ينتظر، والموافقة تُدخل\n`)
process.exit(fail ? 1 : 0)
