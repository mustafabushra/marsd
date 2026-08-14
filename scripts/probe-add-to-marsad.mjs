#!/usr/bin/env node
/**
 * A company enters Marsad only when somebody asks, and only once.
 *
 * Searching the register must not populate `companies` — a million
 * registrations becoming a million rows nobody asked about is the failure this
 * whole separation exists to prevent. So the probe searches first and checks
 * that nothing was created, and only then presses the button.
 *
 * The second time matters as much as the first. Somebody pressing «add» on a
 * company Marsad already has wants to end up looking at it; an error telling
 * them it exists is a dead end where a destination was expected. And a second
 * row for the same registration would be the duplicate the unique index exists
 * to refuse.
 *
 *   node scripts/probe-add-to-marsad.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { pad10 } from './lib/test-ids.mjs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
let mark = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}
const refuses = async (n, fn, expect) => {
  const sp = `m${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try { await fn(); await c.query(`release savepoint ${sp}`); fail += 1; console.log(`  ❌ ${n} — لم يُرفض`) }
  catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const m = !expect || e.message.includes(expect)
    if (m) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n} — ${e.message.slice(0, 60)}`) }
  }
}
const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

try {
  await c.query('begin')
  const { rows: [me] } = await c.query(
    `select id from public.users where tenant_id is not null limit 1`)
  if (!me) throw new Error('لا مستخدم — تعذّر الإثبات')

  const stamp = Date.now().toString().slice(-7)
  const CR = pad10(`88${stamp}`)
  const { rows: [g] } = await c.query(`
    insert into public.government_company_registry
      (dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       legal_entity, legal_entity_2, capital, region, city)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'الربع الثاني 2026', '2026-06-30',
            $1, 'مؤسسة فحص الإضافة', $2, 'شركة',
            'شركة ذات مسؤولية محدودة', 250000, 'منطقة الرياض', 'الرياض')
    returning id`, [CR, pad10(`70${stamp}`)])

  await asUser(me.id)

  // --- Searching creates nothing -------------------------------------------
  const before = (await c.query('select count(*)::int n from public.companies')).rows[0].n
  const found = await c.query(
    `select origin, in_marsad from public.search_companies_unified('مؤسسة فحص الإضافة', 10)`)
  const after = (await c.query('select count(*)::int n from public.companies')).rows[0].n

  ok('البحث يجدها في السجل الحكومي',
    found.rows.some((r) => r.origin === 'government' && r.in_marsad === false))
  ok('والبحث لا يُنشئ شركة', before === after, `${before} → ${after}`)

  // --- Signing in ------------------------------------------------------------
  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await refuses('الإضافة تلزمها هوية',
    () => c.query('select public.add_registry_company_to_marsad($1)', [g.id]), 'تسجيل الدخول')
  await asUser(me.id)

  // --- The one thing that creates a company ----------------------------------
  const { rows: [{ add_registry_company_to_marsad: id1 }] } = await c.query(
    'select public.add_registry_company_to_marsad($1)', [g.id])
  ok('الإضافة تُنشئ شركة', !!id1)

  const { rows: [co] } = await c.query(`
    select name, cr_number, unified_number, entity_type, capital, city,
           source, approved, government_company_id
      from public.companies where id = $1`, [id1])

  ok('بالبيانات الحكومية', co.name === 'مؤسسة فحص الإضافة' && co.cr_number === CR)
  ok('وبالكيان القانوني التفصيلي', co.entity_type === 'شركة ذات مسؤولية محدودة',
    `جاء «${co.entity_type}»`)
  ok('ورأس المال والمدينة', Number(co.capital) === 250000 && co.city === 'الرياض')
  ok('مصدرها رسمي ومعتمدة', co.source === 'official' && co.approved === true)
  ok('ومربوطة بسجلّها الحكومي', co.government_company_id === g.id)

  // --- And the score says so ---------------------------------------------------
  //
  // Marking `verified` is not the point; the point is the twenty points the
  // official layer gives for it. A flag nobody reads would pass a check on the
  // flag and change nothing about the company.
  const { rows: [ver] } = await c.query(
    'select verified, verification_source from public.companies where id = $1', [id1])
  ok('موثّقة', ver.verified === true)
  ok('ومصدر التوثيق مسمّى', /وزارة التجارة/.test(ver.verification_source || ''),
    `جاء «${ver.verification_source}»`)

  const { rows: [{ trust_layer_official: withV }] } = await c.query(
    'select public.trust_layer_official($1)', [id1])

  // Un-verified as an administrator, which is the only role allowed to.
  //
  // `company_profile_guard_trigger` refuses a change to `verified` from anyone
  // who is not a platform admin — a company must not be able to declare itself
  // verified, and an anonymous caller must not either. Two versions of this
  // probe were refused by it before the comparison was possible, which is the
  // guard working rather than the flow failing.
  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)
  await c.query('savepoint unverify')
  await asUser(admin.id)
  await c.query('update public.companies set verified = false where id = $1', [id1])
  const { rows: [{ trust_layer_official: without }] } = await c.query(
    'select public.trust_layer_official($1)', [id1])
  await c.query('rollback to savepoint unverify')
  await asUser(me.id)

  ok('والطبقة الرسمية أعلى بسببه', Number(withV) > Number(without),
    `${without} → ${withV} — التوثيق لا يُحتسب`)
  console.log(`     الطبقة الرسمية: ${without} بلا توثيق · ${withV} بتوثيق الوزارة`)

  // --- Pressing it twice -------------------------------------------------------
  const { rows: [{ add_registry_company_to_marsad: id2 }] } = await c.query(
    'select public.add_registry_company_to_marsad($1)', [g.id])
  ok('الضغط مرة ثانية يُرجع نفس الشركة', id2 === id1, 'أنشأ شركة ثانية')

  const { rows: [dupes] } = await c.query(
    'select count(*)::int n from public.companies where cr_number = $1', [CR])
  ok('ولا صفّ مكرّر', dupes.n === 1, `${dupes.n} صف`)

  // --- And it stops offering itself ---------------------------------------------
  const again = await c.query(
    `select origin, in_marsad from public.search_companies_unified('مؤسسة فحص الإضافة', 10)`)
  ok('البحث يعرضها الآن كشركة مرصد',
    again.rows.some((r) => r.origin === 'marsad' && r.in_marsad === true))
  ok('ولا يعرضها مرتين',
    again.rows.filter((r) => r.origin === 'government').length === 0,
    'ما زالت تظهر كحكومية أيضاً')

  // --- The audit -------------------------------------------------------------------
  const { rows: [log] } = await c.query(`
    select actor_id, action from public.audit_logs
     where entity = 'company' and entity_id = $1::text
     order by created_at desc limit 1`, [id1])
  ok('التدقيق يسجّل من أضافها',
    log?.actor_id === me.id && log?.action === 'company_added_from_registry',
    JSON.stringify(log || null))

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — لا شركة تُنشأ إلا بطلب، ولا مرتين\n`)
process.exit(fail ? 1 : 0)
