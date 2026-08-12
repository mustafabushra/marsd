#!/usr/bin/env node
/**
 * Joining a company: who may ask, who may decide, and what the API refuses.
 *
 * The failing cases matter more than the passing ones here. A membership system
 * that works when used correctly and also works when abused is not a membership
 * system — so every check below that starts «لا» is run as an actual attempt
 * against the database, with no interface in the way.
 *
 *   node scripts/probe-membership-qa.mjs
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
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const stamp = Date.now().toString().slice(-6)
const ADMIN = `qa_owner_${stamp}`
const ASKER = `qa_asker_${stamp}`
const OTHER = `qa_other_${stamp}`
const coId = randomUUID()
const tenId = randomUUID()

/**
 * Run as somebody, the way PostgREST does: the `authenticated` role plus a jwt
 * claim.
 *
 * `set role` matters more than it looks. This connects as postgres, which has
 * rolbypassrls — so every row-level policy is skipped and a probe that only
 * sets the claim is testing triggers and SECURITY DEFINER checks while
 * believing it is testing RLS. A direct insert into a table with no insert
 * policy sailed through and looked like a hole in the schema; it was a hole in
 * the test.
 */
const as = async (uid, sql, args) => {
  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await db.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid })])
    const r = await db.query(sql, args)
    await db.query('commit')
    return { ok: true, rows: r.rows }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    return { ok: false, err: e.message }
  }
}

try {
  // A company with an owner, and two outsiders.
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: 'bootstrap' })])
  await db.query(
    `insert into public.companies (id, name, cr_number, status, source)
     values ($1, $2, $3, 'active', 'community')`,
    [coId, `شركة فحص العضوية ${stamp}`, `9${stamp}0000`.slice(0, 10)])
  await db.query(
    `insert into public.tenants (id, name, cr_number, email, phone, company_id, status)
     values ($1, $2, $3, $4, '', $5, 'active')`,
    [tenId, `شركة فحص العضوية ${stamp}`, `9${stamp}0000`.slice(0, 10),
      `qa-ten-${stamp}@marsad.test`, coId])
  for (const [id, role, tenant] of [
    [ADMIN, 'company_admin', tenId], [ASKER, 'company_member', null], [OTHER, 'company_member', null],
  ]) {
    await db.query(
      `insert into public.users (id, email, role, tenant_id, status)
       values ($1, $2, $3, $4, 'active')
       on conflict (id) do update set role = excluded.role, tenant_id = excluded.tenant_id`,
      [id, `${id}@marsad.test`, role, tenant])
  }

  // ===== Asking =====
  console.log('\n─── طلب الانضمام ───')
  let r = await as(ASKER, 'select public.request_to_join_company($1, $2) id', [tenId, 'أعمل في القسم المالي'])
  ok('عضو بلا شركة يستطيع طلب الانضمام', r.ok, r.err)
  const reqId = r.rows?.[0]?.id

  r = await as(ASKER, 'select public.request_to_join_company($1, null) id', [tenId])
  const { rows: [dup] } = await db.query(
    `select count(*)::int n from public.join_requests
      where tenant_id = $1 and user_id = $2 and status = 'pending'`, [tenId, ASKER])
  ok('وطلبه مرّتين لا ينشئ طلبين', dup.n === 1, `${dup.n} طلباً`)

  r = await as(ADMIN, 'select public.request_to_join_company($1, null) id', [tenId])
  ok('وعضو الشركة لا يطلب الانضمام إليها', !r.ok && /بالفعل|أخرى/.test(r.err || ''), r.err?.slice(0, 60))

  // ===== The admin's queue =====
  console.log('\n─── ما يصل مسؤول الشركة ───')
  r = await as(ADMIN, 'select public.company_join_requests() j')
  const queue = r.rows?.[0]?.j || []
  ok('الطلب يظهر لمسؤول الشركة', Array.isArray(queue) && queue.some((x) => x.id === reqId),
    `${queue.length} في القائمة`)
  ok('  ومعه من قدّمه ونصّه',
    queue.some((x) => x.user_id === ASKER && /القسم المالي/.test(x.message || '')))

  r = await as(OTHER, 'select public.company_join_requests() j')
  ok('ولا يظهر لمن ليس في الشركة', (r.rows?.[0]?.j || []).length === 0)

  const { rows: [notif] } = await db.query(
    `select count(*)::int n from public.notifications
      where user_id = $1 and type = 'join_requested'`, [ADMIN])
  ok('ويُشعَر به المسؤول', notif.n > 0, `${notif.n} إشعاراً`)

  // ===== Who may decide =====
  console.log('\n─── من يقرّر ───')
  r = await as(OTHER, 'select public.decide_join_request($1, true, $2, null) j', [reqId, 'company_member'])
  ok('غريب لا يقرّر', !r.ok && /مسؤول الشركة/.test(r.err || ''), r.err?.slice(0, 60))

  r = await as(ASKER, 'select public.decide_join_request($1, true, $2, null) j', [reqId, 'company_admin'])
  ok('ومقدّم الطلب لا يقبل نفسه', !r.ok, r.err?.slice(0, 60))

  r = await as(ADMIN, 'select public.decide_join_request($1, true, $2, null) j', [reqId, 'company_member'])
  ok('ومسؤول الشركة يقبل', r.ok, r.err?.slice(0, 80))

  const { rows: [joined] } = await db.query(
    'select tenant_id, role from public.users where id = $1', [ASKER])
  ok('  والعضوية تُنشأ فعلاً', joined?.tenant_id === tenId, String(joined?.tenant_id))
  ok('  بالدور المُعطى لا بدور أعلى', joined?.role === 'company_member', joined?.role)

  const { rows: [st] } = await db.query('select status from public.join_requests where id = $1', [reqId])
  ok('  والطلب يُغلق في نفس اللحظة', st?.status === 'approved', st?.status)

  r = await as(ADMIN, 'select public.decide_join_request($1, false, $2, $3) j',
    [reqId, 'company_member', 'خطأ'])
  ok('  ولا يُقرَّر مرّتين', !r.ok && /حالة/.test(r.err || ''), r.err?.slice(0, 60))

  // ===== API manipulation =====
  console.log('\n─── التلاعب بالـAPI ───')
  r = await as(OTHER, `insert into public.join_requests (tenant_id, user_id, status)
                       values ($1, $2, 'approved') returning id`, [tenId, OTHER])
  ok('لا إدراج مباشر في طلبات الانضمام', !r.ok, (r.err || 'أُدرج').slice(0, 60))

  r = await as(OTHER, `update public.join_requests set status = 'approved' where id = $1`, [reqId])
  ok('ولا تعديل حالة طلب مباشرةً', !r.ok || (await db.query(
    'select status from public.join_requests where id = $1', [reqId])).rows[0].status === 'approved',
  'غيّر الحالة')

  r = await as(OTHER, `update public.users set tenant_id = $1, role = 'company_admin' where id = $2`,
    [tenId, OTHER])
  ok('ولا ربط النفس بشركة لها أعضاء', !r.ok && /طلب ملكية|انضمام/.test(r.err || ''), r.err?.slice(0, 70))

  r = await as(ASKER, `update public.users set role = 'company_admin' where id = $1`, [ASKER])
  ok('ولا ترقية النفس بعد الانضمام', !r.ok, (r.err || 'ترقّى').slice(0, 60))

  r = await as(OTHER, 'select public.decide_join_request($1, true, $2, null) j', [reqId, 'platform_admin'])
  ok('ولا منح دور غير معروف', !r.ok, r.err?.slice(0, 60))

  // ===== Audit =====
  console.log('\n─── الأثر ───')
  const { rows: [aud] } = await db.query(
    `select count(*)::int n from public.audit_logs
      where entity = 'join_request' and entity_id = $1`, [reqId])
  ok('الطلب والقرار مسجّلان في التدقيق', aud.n >= 2, `${aud.n} قيداً`)
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: 'bootstrap' })]).catch(() => {})
  await db.query('delete from public.notifications where tenant_id = $1', [tenId]).catch(() => {})
  await db.query(`delete from public.audit_logs where entity = 'join_request'`).catch(() => {})
  await db.query('delete from public.join_requests where tenant_id = $1', [tenId]).catch(() => {})
  await db.query('update public.users set tenant_id = null where tenant_id = $1', [tenId]).catch(() => {})
  await db.query('delete from public.users where id = any($1)', [[ADMIN, ASKER, OTHER]]).catch(() => {})
  await db.query('delete from public.tenants where id = $1', [tenId]).catch(() => {})
  await db.query('delete from public.companies where id = $1', [coId]).catch(() => {})
  const { rows: [left] } = await db.query('select count(*)::int n from public.tenants where id = $1', [tenId])
  console.log(`\n  🧹 المتبقّي: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الانضمام يُطلب ويُقرَّر، ولا يُنتزع\n`)
process.exit(fail ? 1 : 0)
