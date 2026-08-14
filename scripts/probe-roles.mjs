#!/usr/bin/env node
/**
 * Seven roles, and what each one can actually do.
 *
 * The whole system asked two questions — «is this a platform admin» and «is
 * this a reviewer» — and both read a role name. That is how `reviewer` came to
 * exist in the constraint, be checked by every request function, and still be
 * unable to approve a single registration.
 *
 * Authority is a permission now. This checks that against the real functions
 * rather than against the table: a grant that no function reads is a grant that
 * does nothing, and a permission table that agrees with itself proves nothing.
 *
 * Both directions matter. A role gaining something it should not have is the
 * failure that does not announce itself.
 *
 *   node scripts/probe-roles.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { pad10 } from './lib/test-ids.mjs'

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

const as = (id) => db.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

async function run (actor, sql, params = []) {
  await db.query('begin'); await as(actor)
  try {
    const { rows } = await db.query(sql, params)
    await db.query('commit')
    return { ok: true, rows }
  } catch (e) {
    await db.query('rollback')
    return { ok: false, message: e.message }
  }
}

const ROLES = ['platform_admin', 'manager', 'reviewer', 'compliance',
  'data_operator', 'finance', 'support']

const made = { users: [], company: null, tenant: null, coUser: null, request: null, docs: [] }

try {
  const s = Date.now().toString().slice(-7)

  // One account per role, so every claim below is a real sign-in.
  const uid = {}
  for (const role of ROLES) {
    uid[role] = `user_role_${role}_${s}`
    await db.query(
      `insert into public.users (id, email, role, status) values ($1, $2, $3, 'active')`,
      [uid[role], `${role}.${s}@marsad.test`, role])
    made.users.push(uid[role])
  }

  // A submitted registration with documents, for them to act on.
  const NAME = `شركة فحص الأدوار ${s}`
  // عشرة أرقام لا تسعة — راجع pad10 في scripts/lib/test-ids.mjs. هذا السكربت
  // بالذات خلّف في ٢٠٢٦-٠٨-١١ شركةً برقم من تسعة أرقام حين مات قبل تنظيفه،
  // فظلّت في القاعدة صفّاً لا يقبل أي تعديل.
  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, city, sector, official_email)
     values ($1,$2,'community','pending','الرياض','تقنية',$3) returning id`,
    [NAME, pad10(`93${s}`), `roles.${s}@example.com`])
  made.company = co.id
  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1,$2,$3,$4,'active') returning id`, [NAME, `X${s}`, `roles.${s}@example.com`, co.id])
  made.tenant = tn.id
  made.coUser = `user_roleco_${s}`
  await db.query(
    `insert into public.users (id,email,role,tenant_id,status) values ($1,$2,'company_admin',$3,'active')`,
    [made.coUser, `roles.${s}@example.com`, tn.id])

  await db.query('begin'); await as(made.coUser)
  const { rows: [{ open_company_request: rq }] } = await db.query(
    'select public.open_company_request($1,$2)', [co.id, 'registration'])
  made.request = rq
  const { rows: types } = await db.query(
    'select doc_type,label from public.company_document_types() where required')
  for (const t of types) {
    const { rows: [d] } = await db.query(
      `insert into public.company_documents
        (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
       values ($1,$2,$3,$4,$5,$6,'pending',$7) returning id`,
      [co.id, tn.id, made.coUser, t.doc_type, `${co.id}/x.pdf`, `${t.label}.pdf`, rq])
    made.docs.push(d.id)
  }
  await db.query('select public.submit_company_request($1)', [rq])
  await db.query('commit')

  // ===== The permission map is readable, and matches the roles =====
  const mine = await run(uid.compliance, 'select * from public.my_permissions()')
  ok('كل دور يقرأ صلاحياته',
    mine.ok && mine.rows.some((r) => r.key === 'documents.verify'),
    mine.message?.slice(0, 70))

  // ===== documents.verify =====
  // The point of the whole change: compliance holds it and reviewer holds it;
  // finance and support do not, and neither does a company account.
  const canVerify = ['platform_admin', 'manager', 'reviewer', 'compliance']
  for (const role of ROLES) {
    const r = await run(uid[role], 'select public.review_document($1, true, null)',
      [made.docs[0]])
    const expected = canVerify.includes(role)
    ok(`${role.padEnd(15)} تدقيق مستند ${expected ? '✔' : '✘'}`,
      r.ok === expected, r.message?.slice(0, 70))
    if (r.ok) {
      // Put it back so the next role faces the same starting state.
      await db.query(`update public.company_documents
                         set status='pending', verified_by=null, verified_at=null where id=$1`,
        [made.docs[0]])
      await db.query(`delete from public.company_request_events
                       where request_id=$1 and event in ('document_verified','document_rejected')`,
        [made.request])
    }
  }

  const denied = await run(made.coUser, 'select public.review_document($1, true, null)', [made.docs[0]])
  ok('حساب شركة        تدقيق مستند ✘', denied.ok === false, denied.message?.slice(0, 60))

  // ===== work.assign_self =====
  const canTake = ['platform_admin', 'manager', 'reviewer']
  for (const role of ROLES) {
    const r = await run(uid[role], 'select public.assign_company_request($1)', [made.request])
    const expected = canTake.includes(role)
    ok(`${role.padEnd(15)} استلام طلب ${expected ? '✔' : '✘'}`,
      r.ok === expected, r.message?.slice(0, 70))
    if (r.ok) {
      await db.query(`update public.company_requests
                         set status='submitted', assigned_to=null, assigned_at=null where id=$1`,
        [made.request])
      await db.query(`delete from public.company_request_events
                       where request_id=$1 and event='assigned'`, [made.request])
    }
  }

  // ===== work.assign_others — what separates a reviewer from a manager =====
  await run(uid.reviewer, 'select public.assign_company_request($1)', [made.request])

  const revSteal = await run(uid.reviewer, 'select public.assign_company_request($1, $2)',
    [made.request, uid.manager])
  ok('reviewer        إسناد لغيره ✘', revSteal.ok === false, revSteal.message?.slice(0, 70))

  const mgrAssign = await run(uid.manager, 'select public.assign_company_request($1, $2)',
    [made.request, uid.reviewer])
  ok('manager         إسناد لغيره ✔', mgrAssign.ok === true, mgrAssign.message?.slice(0, 70))

  const revUnassign = await run(uid.reviewer, 'select public.unassign_company_request($1)', [made.request])
  ok('reviewer        فكّ الإسناد ✘', revUnassign.ok === false, revUnassign.message?.slice(0, 70))

  const mgrUnassign = await run(uid.manager, 'select public.unassign_company_request($1)', [made.request])
  ok('manager         فكّ الإسناد ✔', mgrUnassign.ok === true, mgrUnassign.message?.slice(0, 70))

  // ===== The registry, without the master key =====
  const canImport = ['platform_admin', 'data_operator']
  for (const role of ROLES) {
    const r = await run(uid[role],
      `select * from public.import_job_start('roles.csv', 10, 5, 'فحص', current_date)`)
    const expected = canImport.includes(role)
    ok(`${role.padEnd(15)} بدء استيراد ${expected ? '✔' : '✘'}`,
      r.ok === expected, r.message?.slice(0, 70))
    if (r.ok) {
      await run(uid.platform_admin, 'select public.import_job_cancel($1, $2)',
        [r.rows[0].job_id, 'فحص الأدوار'])
      await db.query('delete from public.import_jobs where id=$1', [r.rows[0].job_id])
    }
  }

  // ===== The decision =====
  const canDecide = ['platform_admin', 'manager', 'reviewer']
  for (const role of ROLES) {
    const r = await run(uid[role], 'select public.decide_company_request($1, false, $2)',
      [made.request, 'فحص الأدوار'])
    const expected = canDecide.includes(role)
    // Deciding needs no readiness, only a reason — so a permitted role gets
    // through and a forbidden one is stopped at the door, not at the checks.
    ok(`${role.padEnd(15)} البتّ في طلب ${expected ? '✔' : '✘'}`,
      r.ok === expected, r.message?.slice(0, 70))
    if (r.ok) {
      await db.query(`update public.company_requests set status='submitted',
                         reviewed_at=null, reviewed_by=null, decision_reason=null where id=$1`,
        [made.request])
      // Through an admin claim: `guard_company_status` refuses an anonymous
      // status change, and it is right to — the probe's own reset does not get
      // an exemption the product does not have.
      await run(uid.platform_admin,
        `update public.companies set status='pending' where id=$1`, [made.company])
      await db.query(`delete from public.company_request_events
                       where request_id=$1 and event in ('approved','rejected')`, [made.request])
    }
  }

  // ===== And the master key stayed where it was =====
  for (const role of ROLES.filter((r) => r !== 'platform_admin')) {
    const r = await run(uid[role], 'select public.is_platform_admin() b')
    ok(`${role.padEnd(15)} ليس مسؤول منصة`, r.rows?.[0]?.b === false, String(r.rows?.[0]?.b))
  }
  const admin = await run(uid.platform_admin, 'select public.is_platform_admin() b')
  ok('platform_admin  ما زال مسؤول المنصة', admin.rows?.[0]?.b === true)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})
  if (made.company) {
    await db.query(`delete from public.company_request_events where request_id in
      (select id from public.company_requests where company_id=$1)`, [made.company]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [made.company]).catch(() => {})
  }
  await db.query('delete from public.users where id = any($1)',
    [[...made.users, made.coUser].filter(Boolean)]).catch(() => {})
  await db.query('delete from public.tenants where id=$1', [made.tenant]).catch(() => {})
  await db.query('delete from public.companies where id=$1', [made.company]).catch(() => {})
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — الصلاحية تقرّر، لا الاسم\n`)
process.exit(fail ? 1 : 0)
