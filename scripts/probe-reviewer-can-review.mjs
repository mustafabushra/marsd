#!/usr/bin/env node
/**
 * The `reviewer` role could not approve a single registration.
 *
 * Both guards on `companies` recognised `is_platform_admin()` and nothing else,
 * so `decide_company_request` running as a reviewer was refused by its own
 * database. True since the request work landed, and invisible because there is
 * no reviewer account in the data — every test signed in as a platform admin.
 *
 * Widening authority is the kind of fix that quietly grants too much, so this
 * checks the ceiling as hard as the floor: a reviewer decides requests, and a
 * reviewer does not rename companies or take them off the platform.
 *
 *   node scripts/probe-reviewer-can-review.mjs
 */

import pg from 'pg'
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

const as = (id) => db.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

/** Run one statement under an identity, returning the error message or null. */
async function attempt (actor, sql, params = []) {
  await db.query('begin')
  await as(actor)
  try {
    await db.query(sql, params)
    await db.query('commit')
    return null
  } catch (e) {
    await db.query('rollback')
    return e.message
  }
}

const made = {}

try {
  const s = Date.now().toString().slice(-7)
  const { rows: [admin] } = await db.query(
    `select id from public.users where role = 'platform_admin' order by created_at limit 1`)

  // A reviewer, which this database has never had.
  made.reviewer = `user_reviewer_${s}`
  await db.query(
    `insert into public.users (id, email, role, status) values ($1, $2, 'reviewer', 'active')`,
    [made.reviewer, `reviewer.${s}@marsad.test`])

  const NAME = `شركة فحص المراجع ${s}`
  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, approved, city, sector, official_email)
     values ($1,$2,'community','pending',false,'الدمام','تقنية',$3) returning id`,
    [NAME, `91${s}`, `rev.${s}@example.com`])
  made.company = co.id
  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1,$2,$3,$4,'active') returning id`, [NAME, `V${s}`, `rev.${s}@example.com`, co.id])
  made.tenant = tn.id
  made.user = `user_revco_${s}`
  await db.query(
    `insert into public.users (id,email,role,tenant_id,status) values ($1,$2,'company_admin',$3,'active')`,
    [made.user, `rev.${s}@example.com`, tn.id])

  await db.query('begin'); await as(made.user)
  const { rows: [{ open_company_request: rq }] } = await db.query(
    'select public.open_company_request($1,$2)', [co.id, 'registration'])
  made.request = rq
  const { rows: types } = await db.query(
    'select doc_type, label from public.company_document_types() where required')
  const docIds = []
  for (const t of types) {
    const { rows: [d] } = await db.query(
      `insert into public.company_documents
        (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
       values ($1,$2,$3,$4,$5,$6,'pending',$7) returning id`,
      [co.id, tn.id, made.user, t.doc_type, `${co.id}/${t.doc_type}.pdf`, `${t.label}.pdf`, rq])
    docIds.push(d.id)
  }
  await db.query('select public.submit_company_request($1)', [rq])
  await db.query('commit')

  // --- The floor: a reviewer can do the job ----------------------------------
  const takeIt = await attempt(made.reviewer, 'select public.assign_company_request($1)', [rq])
  ok('المراجع يستلم الطلب', takeIt === null, takeIt?.slice(0, 90))

  let verifyErr = null
  for (const id of docIds) {
    verifyErr = verifyErr || await attempt(made.reviewer,
      'select public.review_document($1, true, null)', [id])
  }
  ok('ويدقّق المستندات', verifyErr === null, verifyErr?.slice(0, 90))

  const approve = await attempt(made.reviewer,
    'select public.decide_company_request($1, true, null)', [rq])
  ok('ويقبل الطلب', approve === null, approve?.slice(0, 110))

  const { rows: [after] } = await db.query(
    'select status, approved from public.companies where id=$1', [co.id])
  ok('والشركة تصبح active فعلاً', after.status === 'active' && after.approved === true,
    `status=${after.status} approved=${after.approved}`)

  // --- The ceiling: and no further -------------------------------------------
  const rename = await attempt(made.reviewer,
    'update public.companies set name = $1 where id = $2', [`${NAME} معدّل`, co.id])
  ok('ولا يعيد تسمية شركة', rename !== null && /هوية الشركة/.test(rename), rename?.slice(0, 90))

  const recr = await attempt(made.reviewer,
    'update public.companies set cr_number = $1 where id = $2', [`92${s}`, co.id])
  ok('ولا يغيّر رقم السجل', recr !== null, recr?.slice(0, 90))

  const suspend = await attempt(made.reviewer,
    `update public.companies set status = 'suspended', status_reason = 'اختبار' where id = $1`, [co.id])
  ok('ولا يعلّق شركة', suspend !== null && /مسؤول المنصة/.test(suspend), suspend?.slice(0, 90))

  // --- The supervisor still can ----------------------------------------------
  const adminSuspend = await attempt(admin.id,
    `update public.companies set status = 'suspended', status_reason = 'اختبار الصلاحية' where id = $1`, [co.id])
  ok('ومسؤول المنصة يعلّق', adminSuspend === null, adminSuspend?.slice(0, 90))

  // Back to active first. `guard_company_status` returns early when the status
  // does not change, so re-suspending an already-suspended company never
  // reaches the reason check — and the probe would pass by testing nothing.
  await attempt(admin.id, `update public.companies set status = 'active' where id = $1`, [co.id])
  const noReason = await attempt(admin.id,
    `update public.companies set status = 'suspended', status_reason = '' where id = $1`, [co.id])
  ok('والتعليق بلا سبب يُرفض', noReason !== null && /سبباً/.test(noReason), noReason?.slice(0, 90))

  // --- And the company itself still cannot ------------------------------------
  const selfName = await attempt(made.user,
    'update public.companies set name = $1 where id = $2', [`${NAME} مُختطف`, co.id])
  ok('وحساب الشركة لا يعيد تسمية نفسه', selfName !== null, selfName?.slice(0, 90))

  // Put it back to pending first, so «approve yourself» is an actual change.
  // Both guards return early when nothing differs, and asserting against a
  // no-op update is a check that cannot fail.
  await attempt(admin.id,
    `update public.companies set status = 'pending', approved = false where id = $1`, [co.id])
  const { rows: [before] } = await db.query(
    'select status, approved from public.companies where id=$1', [co.id])
  ok('التمهيد صحيح — الشركة pending وغير معتمدة',
    before.status === 'pending' && before.approved === false,
    `status=${before.status} approved=${before.approved}`)

  const selfStatus = await attempt(made.user,
    `update public.companies set status = 'active', approved = true where id = $1`, [co.id])
  ok('ولا يعتمد نفسه', selfStatus !== null, selfStatus?.slice(0, 90))

  const { rows: [stillPending] } = await db.query(
    'select status, approved from public.companies where id=$1', [co.id])
  ok('والقيمة لم تتغيّر فعلاً',
    stillPending.status === 'pending' && stillPending.approved === false,
    `status=${stillPending.status} approved=${stillPending.approved}`)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 180)}`)
} finally {
  await db.query('rollback').catch(() => {})
  if (made.company) {
    await db.query('delete from public.company_request_events where request_id in (select id from public.company_requests where company_id=$1)', [made.company]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.credits_ledger where tenant_id=$1', [made.tenant]).catch(() => {})
  }
  await db.query('delete from public.users where id = any($1)', [[made.user, made.reviewer].filter(Boolean)]).catch(() => {})
  await db.query('delete from public.tenants where id=$1', [made.tenant]).catch(() => {})
  await db.query('delete from public.companies where id=$1', [made.company]).catch(() => {})
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — المراجع يراجع، ولا يتجاوز\n`)
process.exit(fail ? 1 : 0)
