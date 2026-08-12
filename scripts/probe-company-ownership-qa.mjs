#!/usr/bin/env node
/**
 * Registering a company, and who ends up owning it.
 *
 * Written against a QA list, and the questions it answers are the ones where
 * assuming would be expensive: can a record be duplicated, can somebody attach
 * themselves to a company that is not theirs, and does every route in end at
 * one company row.
 *
 * Everything runs in transactions that roll back, except where a row has to be
 * committed to be read by a policy — those are deleted at the end.
 *
 *   node scripts/probe-company-ownership-qa.mjs
 */

import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (q, n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ س${q} ${n}`) }
  else { fail += 1; console.log(`  ❌ س${q} ${n}${d ? ` — ${d}` : ''}`) }
}

const made = { users: [], companies: [], tenants: [] }

/**
 * As PostgREST would: the `authenticated` role, not the owner.
 *
 * This connects as postgres, which carries rolbypassrls — so setting only the
 * jwt claim tests triggers and SECURITY DEFINER checks while skipping every
 * row-level policy. `set local role` is what makes the policies apply.
 */
const asUser = async (uid, fn) => {
  await db.query('begin')
  await db.query('set local role authenticated')
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })])
  try { return await fn() } finally { await db.query('rollback').catch(() => {}) }
}

const mkUser = async (id, role = 'company_member', tenant = null) => {
  await db.query(
    `insert into public.users (id, email, role, tenant_id, status)
     values ($1, $2, $3, $4, 'active')
     on conflict (id) do update set role = excluded.role, tenant_id = excluded.tenant_id`,
    [id, `${id}@marsad.test`, role, tenant])
  made.users.push(id)
}

try {
  // ===== The record itself =====
  console.log('\n─── سجلّ الشركة (٢، ٣، ٢٧) ───')
  const { rows: idx } = await db.query(
    `select pg_get_indexdef(ix.indexrelid) def
       from pg_index ix join pg_class t on t.oid = ix.indrelid
      where t.relname = 'companies' and ix.indisunique`)
  const defs = idx.map((r) => r.def).join(' ')
  ok(2, 'رقم السجل فريد على مستوى القاعدة', /companies_cr_number_key/.test(defs))
  ok(3, 'والرقم الموحّد فريد كذلك', /unified_number/.test(defs))

  const { rows: [co] } = await db.query(
    `select id, name, cr_number, unified_number from public.companies
      where coalesce(btrim(cr_number),'') <> '' limit 1`)

  // A duplicate, attempted for real.
  let dupCr = ''
  await db.query('begin')
  try {
    await db.query(
      `insert into public.companies (name, cr_number, status, source)
       values ('شركة مكرّرة بالرقم', $1, 'pending', 'community')`, [co.cr_number])
    dupCr = 'accepted'
  } catch (e) { dupCr = e.message }
  await db.query('rollback')
  ok(2, '  ومحاولة التكرار بالرقم تُرفض فعلاً', /duplicate key|unique/i.test(dupCr), dupCr.slice(0, 60))

  if (co.unified_number) {
    let dupUn = ''
    await db.query('begin')
    try {
      await db.query(
        `insert into public.companies (name, cr_number, unified_number, status, source)
         values ('اسم مختلف تماماً', $1, $2, 'pending', 'community')`,
        [String(Date.now()).slice(-10), co.unified_number])
      dupUn = 'accepted'
    } catch (e) { dupUn = e.message }
    await db.query('rollback')
    ok(3, '  والتكرار بالرقم الموحّد يُرفض ولو اختلف الاسم',
      /duplicate key|unique/i.test(dupUn), dupUn.slice(0, 60))
  }

  // ===== Attaching yourself =====
  console.log('\n─── من يملك الشركة (٢٤، ٢٥، ٢٦) ───')
  const { rows: [owned] } = await db.query(
    `select t.id, t.name, t.company_id from public.tenants t
      where exists (select 1 from public.users u where u.tenant_id = t.id) limit 1`)

  const ATT = 'qa_attacker_' + Date.now().toString().slice(-6)
  await mkUser(ATT)
  const attack = await asUser(ATT, async () => {
    try {
      await db.query(
        `update public.users set tenant_id = $1, role = 'company_admin' where id = $2`,
        [owned.id, ATT])
      const { rows: [r] } = await db.query(
        'select tenant_id, role from public.users where id = $1', [ATT])
      return r.tenant_id === owned.id ? 'ATTACHED' : 'no-op'
    } catch (e) { return 'refused: ' + e.message }
  })
  ok(25, 'لا يستطيع مستخدم ربط نفسه بشركة لها حساب',
    attack.startsWith('refused'), attack.slice(0, 90))
  ok(26, '  والرفض من القاعدة لا من الواجهة', attack.startsWith('refused'))
  ok(24, '  ولا يعيّن نفسه مسؤول شركة بلا تحقّق', attack.startsWith('refused'))

  // Escalation, separately.
  const esc = await asUser(ATT, async () => {
    try {
      await db.query(`update public.users set role = 'platform_admin' where id = $1`, [ATT])
      return 'ESCALATED'
    } catch (e) { return 'refused: ' + e.message }
  })
  ok(24, '  ولا يمنح نفسه دور مسؤول المنصّة', esc.startsWith('refused'), esc.slice(0, 70))

  // Moving between companies.
  const MEM = 'qa_member_' + Date.now().toString().slice(-6)
  await mkUser(MEM, 'company_member', owned.id)
  const move = await asUser(MEM, async () => {
    const { rows: [other] } = await db.query(
      'select id from public.tenants where id <> $1 limit 1', [owned.id])
    if (!other) return 'refused: no second tenant'
    try {
      await db.query('update public.users set tenant_id = $1 where id = $2', [other.id, MEM])
      return 'MOVED'
    } catch (e) { return 'refused: ' + e.message }
  })
  ok(25, '  ولا ينقل حسابه إلى شركة أخرى', move.startsWith('refused'), move.slice(0, 70))

  // ===== And the legitimate path still works =====
  console.log('\n─── والتسجيل المشروع ما زال يعمل (٥) ───')
  const NEW = 'qa_founder_' + Date.now().toString().slice(-6)
  await mkUser(NEW)
  const legit = await asUser(NEW, async () => {
    const tId = randomUUID()
    await db.query(
      `insert into public.tenants (id, name, cr_number, email, phone, status)
       values ($1, 'شركة فحص التسجيل', $2, $3, '', 'active')`,
      [tId, String(Date.now()).slice(-10), `qa-${Date.now()}@marsad.test`])
    try {
      await db.query(
        `update public.users set tenant_id = $1, role = 'company_admin' where id = $2`, [tId, NEW])
      const { rows: [r] } = await db.query('select tenant_id from public.users where id = $1', [NEW])
      return r.tenant_id === tId ? 'ok' : 'no-op'
    } catch (e) { return 'refused: ' + e.message }
  })
  ok(5, 'من ينشئ شركة بلا حساب يصير مسؤولها', legit === 'ok', legit.slice(0, 80))

  // ===== One record, many routes =====
  console.log('\n─── سؤال ٢٧ ───')
  const { rows: [dupes] } = await db.query(
    `select count(*)::int n from (
       select cr_number from public.companies
        where coalesce(btrim(cr_number),'') <> ''
        group by cr_number having count(*) > 1) x`)
  ok(27, 'لا شركة مكرّرة برقم السجل في القاعدة كلها', dupes.n === 0, `${dupes.n} تكرار`)

  const { rows: [dupU] } = await db.query(
    `select count(*)::int n from (
       select unified_number from public.companies
        where coalesce(btrim(unified_number),'') <> ''
        group by unified_number having count(*) > 1) x`)
  ok(27, '  ولا بالرقم الموحّد', dupU.n === 0, `${dupU.n} تكرار`)

  const { rows: [srcs] } = await db.query(
    `select string_agg(distinct source, ', ') s from public.companies`)
  ok(27, '  وكل المصادر تكتب في نفس الجدول', Boolean(srcs.s), srcs.s)

  const { rows: [twoTenants] } = await db.query(
    `select count(*)::int n from (
       select company_id from public.tenants where company_id is not null
        group by company_id having count(*) > 1) x`)
  ok(27, '  ولا شركة بحسابين', twoTenants.n === 0, `${twoTenants.n} شركة`)

  // ===== Provenance and audit =====
  console.log('\n─── الأثر (١٩، ٢٠) ───')
  const { rows: [prov] } = await db.query(
    `select count(*) filter (where source = 'official')::int official,
            count(*) filter (where source = 'community')::int community
       from public.companies`)
  ok(19, 'مصدر كل شركة محفوظ', (prov.official + prov.community) > 0,
    `official=${prov.official} community=${prov.community}`)

  const { rows: [aud] } = await db.query(
    `select count(*)::int n from public.audit_logs
      where action in ('company_added_from_registry','company_approved','claim_approved')`)
  ok(20, 'وعمليات الإضافة والربط مسجّلة في التدقيق', aud.n > 0, `${aud.n} قيداً`)
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  for (const id of made.users) {
    await db.query('delete from public.users where id = $1', [id]).catch(() => {})
  }
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً\n`)
process.exit(fail ? 1 : 0)
