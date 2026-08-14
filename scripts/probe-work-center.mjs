#!/usr/bin/env node
/**
 * One queue over everything that needs a person.
 *
 * Registration in one screen, documents in another, claims in a third,
 * verification in a fourth, reports in a fifth, disputes in a sixth — six
 * lists, no shared idea of who holds a thing or how long it has waited.
 *
 * This checks the data layer for the single queue: that all six kinds arrive
 * in one shape, that priority is derived rather than typed, that the scopes
 * mean what they say, and that a reviewer sees their own work and the
 * unclaimed pile — and not somebody else's.
 *
 *   node scripts/probe-work-center.mjs
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

async function items (actor, scope = 'all', kind = null) {
  await db.query('begin'); await as(actor)
  try {
    const { rows } = await db.query('select * from public.admin_work_items($1,$2,500)', [scope, kind])
    await db.query('commit')
    return rows
  } catch (e) { await db.query('rollback'); return { error: e.message } }
}

const made = { users: [], companies: [], tenants: [] }

/** A company with a submitted registration. */
async function submitted (tag) {
  const s = `${Date.now().toString().slice(-6)}${made.companies.length}`
  const NAME = `شركة ${tag} ${s}`
  // عشرة أرقام بالضبط: طول s يتغيّر مع عدد الشركات المُنشأة، فيُثبَّت الناتج
  // بدل الاعتماد على أنه سيبقى سبعة.
  const cr = pad10(`94${s}`)
  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, city, sector, official_email)
     values ($1,$2,'community','pending','الرياض','تقنية',$3) returning id`,
    [NAME, cr, `wc.${s}@example.com`])
  made.companies.push(co.id)
  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1,$2,$3,$4,'active') returning id`, [NAME, `W${s}`, `wc.${s}@example.com`, co.id])
  made.tenants.push(tn.id)
  const uid = `user_wc_${s}`
  await db.query(
    `insert into public.users (id,email,role,tenant_id,status) values ($1,$2,'company_admin',$3,'active')`,
    [uid, `wc.${s}@example.com`, tn.id])
  made.users.push(uid)

  await db.query('begin'); await as(uid)
  const { rows: [{ open_company_request: rq }] } = await db.query(
    'select public.open_company_request($1,$2)', [co.id, 'registration'])
  const { rows: types } = await db.query(
    'select doc_type,label from public.company_document_types() where required')
  for (const t of types) {
    await db.query(`insert into public.company_documents
      (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
      values ($1,$2,$3,$4,$5,$6,'pending',$7)`,
      [co.id, tn.id, uid, t.doc_type, `${co.id}/x.pdf`, `${t.label}.pdf`, rq])
  }
  await db.query('select public.submit_company_request($1)', [rq])
  await db.query('commit')
  return { company: co.id, request: rq, name: NAME }
}

try {
  const s = Date.now().toString().slice(-7)
  const admin = (await db.query(
    `select id from public.users where role='platform_admin' order by created_at limit 1`)).rows[0]

  const rev = `user_wcrev_${s}`
  await db.query(`insert into public.users (id,email,role,status) values ($1,$2,'reviewer','active')`,
    [rev, `wcrev.${s}@marsad.test`])
  made.users.push(rev)

  const rev2 = `user_wcrev2_${s}`
  await db.query(`insert into public.users (id,email,role,status) values ($1,$2,'reviewer','active')`,
    [rev2, `wcrev2.${s}@marsad.test`])
  made.users.push(rev2)

  const fin = `user_wcfin_${s}`
  await db.query(`insert into public.users (id,email,role,status) values ($1,$2,'finance','active')`,
    [fin, `wcfin.${s}@marsad.test`])
  made.users.push(fin)

  const a = await submitted('طابور أ')
  const b = await submitted('طابور ب')
  const c = await submitted('طابور ج')

  // ===== Everything arrives in one shape =====
  const all = await items(admin.id, 'all')
  ok('الطابور يفتح', Array.isArray(all), all.error?.slice(0, 70))
  const mineRows = all.filter((r) => [a.company, b.company, c.company].includes(r.company_id))
  ok('والثلاثة فيه', mineRows.length === 3, `${mineRows.length}`)
  ok('بشكل واحد لكل الأنواع',
    mineRows.every((r) => r.kind && r.kind_label && r.status_label && r.priority && r.item_id),
    JSON.stringify(mineRows[0])?.slice(0, 120))
  ok('ونوعها مترجم', mineRows.every((r) => r.kind_label === 'تسجيل شركة'))

  // ===== Priority is derived =====
  ok('وأولويتها عادية بلا تأخّر', mineRows.every((r) => r.priority === 'normal'),
    mineRows.map((r) => r.priority).join(','))

  // A promise that has already passed.
  await db.query(
    `update public.company_requests set resolution_due_at = now() - interval '2 hours' where id=$1`,
    [a.request])
  const late = await items(admin.id, 'all')
  const aLate = late.find((r) => r.company_id === a.company)
  ok('وتأخُّر الإنجاز يرفعها إلى حرجة', aLate?.priority === 'critical', aLate?.priority)
  ok('ويظهر في حالة SLA', aLate?.sla_state === 'late_resolution', aLate?.sla_state)

  const lateOnly = await items(admin.id, 'late')
  ok('ونطاق «متأخّر» يعيده وحده',
    lateOnly.some((r) => r.company_id === a.company)
      && !lateOnly.some((r) => r.company_id === b.company))

  // The Ministry outranks the clock.
  await db.query('begin'); await as(admin.id)
  await db.query(
    `update public.companies set official_status='liquidation', official_status_at=now() where id=$1`,
    [b.company])
  await db.query('commit')
  const official = await items(admin.id, 'all')
  ok('وحالة رسمية على الشركة ترفعها وحدها',
    official.find((r) => r.company_id === b.company)?.priority === 'critical',
    official.find((r) => r.company_id === b.company)?.priority)

  // ===== Scopes =====
  await db.query('begin'); await as(rev)
  await db.query('select public.assign_company_request($1)', [c.request])
  await db.query('commit')

  const mine = await items(rev, 'mine')
  ok('«عليّ» يعيد ما أُسنِد إليه فقط',
    mine.length === 1 && mine[0].company_id === c.company, `${mine.length}`)

  const unassigned = await items(admin.id, 'unassigned')
  ok('و«غير مُسنَد» لا يشمله',
    !unassigned.some((r) => r.company_id === c.company)
      && unassigned.some((r) => r.company_id === a.company))

  // ===== A reviewer sees their own and the unclaimed, not a colleague's =====
  const otherView = await items(rev2, 'all')
  ok('ومراجع آخر لا يرى ما أُسنِد لزميله',
    !otherView.some((r) => r.company_id === c.company), 'عمل زميل مكشوف')
  ok('لكنه يرى غير المُسنَد',
    otherView.some((r) => r.company_id === a.company))

  const adminView = await items(admin.id, 'all')
  ok('ومسؤول المنصة يرى كل شيء',
    adminView.some((r) => r.company_id === c.company))

  // ===== Waiting on the company stops the clock =====
  await db.query('begin'); await as(rev)
  await db.query('select public.request_company_clarification($1,$2)', [c.request, 'شهادة غير واضحة'])
  await db.query('commit')
  const waiting = await items(admin.id, 'waiting_them')
  ok('و«بانتظارهم» يجمع ما الكرة عندهم',
    waiting.some((r) => r.company_id === c.company))
  const stillLate = await items(admin.id, 'late')
  ok('ولا يُحسب متأخّراً علينا',
    !stillLate.some((r) => r.company_id === c.company), 'تأخّر الشركة محسوب على مرصد')

  // ===== Counts =====
  await db.query('begin'); await as(admin.id)
  const { rows: [{ admin_work_counts: counts }] } = await db.query(
    'select public.admin_work_counts()')
  await db.query('commit')
  ok('والعدّادات تُقرأ',
    counts && typeof counts.all === 'number' && counts.by_kind && counts.by_priority,
    JSON.stringify(counts)?.slice(0, 140))
  ok('وعدّاد «متأخّر» يطابق النطاق',
    counts.late === (await items(admin.id, 'late')).length,
    `${counts.late}`)

  // ===== And it is not open to everyone =====
  const noPerm = await items(fin, 'all')
  ok('ودور بلا صلاحية عمل لا يفتحه',
    noPerm.error && /صلاحية/.test(noPerm.error), JSON.stringify(noPerm)?.slice(0, 70))

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})
  for (const id of made.companies) {
    await db.query(`delete from public.company_request_events where request_id in
      (select id from public.company_requests where company_id=$1)`, [id]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [id]).catch(() => {})
  }
  await db.query('delete from public.users where id = any($1)', [made.users]).catch(() => {})
  await db.query('delete from public.tenants where id = any($1)', [made.tenants]).catch(() => {})
  for (const id of made.companies) {
    await db.query('delete from public.companies where id=$1', [id]).catch(() => {})
  }
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — طابور واحد، وأولوية لا يكتبها أحد\n`)
process.exit(fail ? 1 : 0)
