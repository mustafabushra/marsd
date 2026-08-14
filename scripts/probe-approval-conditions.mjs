#!/usr/bin/env node
/**
 * «Approved» has to earn itself.
 *
 * `decide_company_request` checked nothing: four documents arriving is not four
 * documents being read, and the only completeness check ran at submit time —
 * so a document rejected after submission left the request approvable anyway.
 *
 * Five conditions now. This breaks each one on its own, with the other four
 * satisfied, and demands a refusal naming that one. A check that passes because
 * it happens to match nothing is the failure this file exists to prevent, so
 * every case here is built to fail before it is allowed to pass.
 *
 *   node scripts/probe-approval-conditions.mjs
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

const built = []
const as = (id) => db.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

const { rows: [staff] } = await db.query(
  `select id from public.users where role = 'platform_admin' order by created_at limit 1`)
const { rows: DOCS } = await db.query(
  'select doc_type, label from public.company_document_types() where required order by doc_type')

/** A company that has submitted a complete registration, ready to be broken. */
async function submitted (tag, { sector = 'مقاولات', email = null } = {}) {
  const s = `${Date.now().toString().slice(-6)}${built.length}`
  const NAME = `شركة ${tag} ${s}`
  const EMAIL = email === null ? `cond.${s}@example.com` : email

  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, approved, city, sector, official_email)
     values ($1,$2,'community','pending',false,'الرياض',$3,$4) returning id`,
    [NAME, pad10(`55${s}`), sector, EMAIL])
  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1,$2,$3,$4,'active') returning id`, [NAME, `C${s}`, `cond.${s}@example.com`, co.id])
  const user = `user_cond_${s}`
  await db.query(
    `insert into public.users (id,email,role,tenant_id,status) values ($1,$2,'company_admin',$3,'active')`,
    [user, `cond.${s}@example.com`, tn.id])

  await db.query('begin'); await as(user)
  const { rows: [{ open_company_request: rq }] } = await db.query(
    'select public.open_company_request($1,$2)', [co.id, 'registration'])
  const ids = {}
  for (const t of DOCS) {
    const { rows: [d] } = await db.query(
      `insert into public.company_documents
        (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
       values ($1,$2,$3,$4,$5,$6,'pending',$7) returning id`,
      [co.id, tn.id, user, t.doc_type, `${co.id}/${t.doc_type}.pdf`, `${t.label}.pdf`, rq])
    ids[t.doc_type] = d.id
  }
  await db.query('select public.submit_company_request($1)', [rq])
  await db.query('commit')

  built.push({ company: co.id, tenant: tn.id, user })
  return { company: co.id, tenant: tn.id, user, request: rq, docs: ids, name: NAME }
}

/** Verify every required document, as staff. */
async function verifyAll (f, { except = [] } = {}) {
  for (const [type, id] of Object.entries(f.docs)) {
    if (except.includes(type)) continue
    await db.query('begin'); await as(staff.id)
    await db.query('select public.review_document($1, true, null)', [id])
    await db.query('commit')
  }
}

/** Try to approve. Returns the refusal message, or null if it went through. */
async function tryApprove (f) {
  await db.query('begin'); await as(staff.id)
  try {
    await db.query('select public.decide_company_request($1, true, null)', [f.request])
    await db.query('commit')
    return null
  } catch (e) {
    await db.query('rollback')
    return e.message
  }
}

try {
  // ===== 1. A required document is gone =====
  // Not «never sent» — submit already refuses that. This is the one that was
  // uncatchable: a document superseded after the submission passed its check.
  const f1 = await submitted('نقص')
  await verifyAll(f1)
  await db.query('update public.company_documents set superseded_at = now() where id = $1',
    [f1.docs[DOCS[0].doc_type]])
  const m1 = await tryApprove(f1)
  ok('مستند اختفى بعد الإرسال يمنع القبول', m1 && /سُلّمت|مستندات مطلوبة/.test(m1), m1?.slice(0, 110))

  // ===== 2. Documents present, nobody read them =====
  const f2 = await submitted('بلا تدقيق')
  const m2 = await tryApprove(f2)
  ok('٤/٤ سُلّمت بلا تدقيق تمنع القبول', m2 && /دُقّقت/.test(m2), m2?.slice(0, 110))

  // ===== 3. One required document rejected =====
  const f3 = await submitted('مرفوض')
  await verifyAll(f3, { except: [DOCS[1].doc_type] })
  await db.query('begin'); await as(staff.id)
  await db.query('select public.review_document($1, false, $2)', [f3.docs[DOCS[1].doc_type], 'غير مقروء'])
  await db.query('commit')
  const m3 = await tryApprove(f3)
  ok('مستند مطلوب مرفوض يمنع القبول', m3 && /مرفوض/.test(m3), m3?.slice(0, 110))

  // ===== 4. A clarification nobody answered =====
  const f4 = await submitted('توضيح')
  await verifyAll(f4)
  await db.query(
    `insert into public.clarification_requests (company_id, reason, status, requested_by)
     values ($1, 'يلزم توضيح العنوان', 'open', $2)`, [f4.company, staff.id])
  const m4 = await tryApprove(f4)
  ok('توضيح مفتوح يمنع القبول', m4 && /توضيح/.test(m4), m4?.slice(0, 110))
  await db.query('update public.clarification_requests set status = $1 where company_id = $2',
    ['closed', f4.company])

  // ===== 5. A core field is empty =====
  const f5 = await submitted('بيانات', { sector: null })
  await verifyAll(f5)
  const m5 = await tryApprove(f5)
  ok('حقل أساسي ناقص يمنع القبول', m5 && /القطاع/.test(m5), m5?.slice(0, 110))

  // ===== And when all five hold =====
  const f6 = await submitted('مكتملة')
  await verifyAll(f6)

  // Inside a transaction: `set_config(..., true)` is transaction-local, and
  // outside one the claim is discarded before the next statement runs — so the
  // function sees an anonymous caller and refuses.
  await db.query('begin'); await as(staff.id)
  const { rows: [{ company_request_readiness: rd }] } = await db.query(
    'select public.company_request_readiness($1)', [f6.request])
  await db.query('commit')
  ok('الـchecklist يقول جاهز', rd.ready === true, JSON.stringify(rd.checks))
  ok('ويعدّ ٤/٤ مُدقَّقة', rd.documents_verified === DOCS.length, `${rd.documents_verified}/${DOCS.length}`)

  const m6 = await tryApprove(f6)
  ok('القبول ينجح عند استيفاء الخمسة', m6 === null, m6?.slice(0, 110))

  const { rows: [co6] } = await db.query(
    'select status, approved, review_status from public.companies where id=$1', [f6.company])
  ok('والشركة تصبح active', co6.status === 'active' && co6.approved === true, co6.status)
  ok('وreview_status يتبعها', co6.review_status === 'approved', co6.review_status)

  const { rows: [rq6] } = await db.query(
    'select status, reviewed_at, reviewed_by from public.company_requests where id=$1', [f6.request])
  ok('والطلب يُغلق مقبولاً', rq6.status === 'approved' && !!rq6.reviewed_at)

  const { rows: ev6 } = await db.query(
    `select event from public.company_request_events where request_id=$1 and event='approved'`, [f6.request])
  ok('والحدث مسجّل بالمفردة الصحيحة', ev6.length === 1)

  // ===== Rejection needs no readiness, only a reason =====
  const f7 = await submitted('مرفوضة')
  await db.query('begin'); await as(staff.id)
  let noReason = false
  try { await db.query('select public.decide_company_request($1, false, null)', [f7.request]) }
  catch (e) { noReason = /سبب الرفض/.test(e.message) }
  await db.query('rollback')
  ok('الرفض بلا سبب يُرفض', noReason)

  await db.query('begin'); await as(staff.id)
  await db.query('select public.decide_company_request($1, false, $2)', [f7.request, 'السجل منتهٍ'])
  await db.query('commit')
  const { rows: [co7] } = await db.query(
    'select status, approved, review_reason from public.companies where id=$1', [f7.company])
  ok('والرفض بسبب يمرّ رغم عدم التدقيق', co7.status === 'rejected' && co7.approved === false, co7.status)
  // Not `status_reason`: `guard_company_status` nulls that for any status other
  // than 'suspended' — it is the suspension notice, not a rejection reason.
  const { rows: [rq7] } = await db.query(
    'select decision_reason from public.company_requests where id=$1', [f7.request])
  ok('والسبب محفوظ على الطلب وعلى الشركة',
    rq7.decision_reason === 'السجل منتهٍ' && co7.review_reason === 'السجل منتهٍ',
    `طلب=${rq7.decision_reason} شركة=${co7.review_reason}`)

  // ===== A request under review belongs to its reviewer =====
  const f8 = await submitted('مُسنَدة')
  await verifyAll(f8)
  const { rows: [other] } = await db.query(
    `select id from public.users where role in ('platform_admin','reviewer') and id <> $1 limit 1`, [staff.id])
  await db.query('begin'); await as(staff.id)
  await db.query('select public.assign_company_request($1)', [f8.request])
  await db.query('commit')

  if (other) {
    await db.query('begin'); await as(other.id)
    let locked = false
    try { await db.query('select public.decide_company_request($1, true, null)', [f8.request]) }
    catch (e) { locked = /مُسنَد إلى موظّف آخر/.test(e.message) }
    await db.query('rollback')
    // Only meaningful if the other account is not a platform admin, who may override.
    const { rows: [o] } = await db.query('select role from public.users where id=$1', [other.id])
    if (o.role === 'reviewer') ok('موظّف آخر لا يقرّر طلباً مُسنَداً لغيره', locked)
    else ok('مسؤول المنصة يتجاوز قفل الإسناد', !locked)
  }

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})
  for (const b of built) {
    await db.query('delete from public.clarification_requests where company_id=$1', [b.company]).catch(() => {})
    await db.query(`delete from public.company_request_events where request_id in
      (select id from public.company_requests where company_id=$1)`, [b.company]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [b.company]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [b.company]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [b.company]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [b.company]).catch(() => {})
    await db.query('delete from public.users where id=$1', [b.user]).catch(() => {})
    await db.query('delete from public.tenants where id=$1', [b.tenant]).catch(() => {})
    await db.query('delete from public.companies where id=$1', [b.company]).catch(() => {})
  }
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — «مقبول» تعني أن أحداً نظر\n`)
process.exit(fail ? 1 : 0)
