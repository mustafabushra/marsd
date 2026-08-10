#!/usr/bin/env node
/**
 * A registration nobody finished must not hold a registration number forever.
 *
 * `companies.cr_number` is unique and a half-finished registration creates the
 * company *and* the account — so whoever types a number first owns it, and the
 * real holder is refused with «رقم السجل مسجّل بالفعل لشركة أخرى» and has no
 * way through but a support ticket.
 *
 * Reclaim is a staff sweep, not a side effect of the newcomer's sign-up:
 * detaching somebody's account from a company is an administrative act, and the
 * tenant guard refuses it without an administrator. Registration's part is to
 * tell the blocked owner which of the two situations they are in.
 *
 * It has to be narrow or it becomes a way to take a live company, so this
 * checks what it refuses at least as hard as what it allows.
 *
 * Also covers the derived columns: `approved` and `review_status` follow
 * `status` now instead of defaulting to «yes».
 *
 *   node scripts/probe-cr-number-reclaim.mjs
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
const trash = { users: [], tenants: [], companies: [] }

/** Somebody starts a registration and walks away. */
async function abandon (cr, { ageDays = 30, submit = false } = {}) {
  const s = `${Date.now().toString().slice(-6)}${trash.users.length}`
  const uid = `user_aband_${s}`
  await db.query(
    `insert into public.users (id,email,role,status) values ($1,$2,'company_member','active')`,
    [uid, `aband.${s}@example.com`])
  trash.users.push(uid)

  await db.query('begin'); await as(uid)
  const { rows: [r] } = await db.query(
    'select * from public.register_company_for_current_user($1,$2,$3,null,$4,$5)',
    [`شركة مهجورة ${s}`, cr, `aband.${s}@example.com`, 'الرياض', 'تقنية'])
  await db.query('commit')
  trash.companies.push(r.company_id)
  trash.tenants.push(r.tenant_id)

  if (submit) {
    const { rows: types } = await db.query(
      'select doc_type,label from public.company_document_types() where required')
    await db.query('begin'); await as(uid)
    for (const t of types) {
      await db.query(`insert into public.company_documents
        (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
        values ($1,$2,$3,$4,$5,$6,'pending',$7)`,
        [r.company_id, r.tenant_id, uid, t.doc_type, `${r.company_id}/x.pdf`, `${t.label}.pdf`, r.request_id])
    }
    await db.query('select public.submit_company_request($1)', [r.request_id])
    await db.query('commit')
  }

  // Age it. The window is what makes reclaim safe, so it has to be real.
  await db.query(
    `update public.companies set created_at = now() - make_interval(days => $2) where id = $1`,
    [r.company_id, ageDays])
  return { ...r, user: uid }
}

/** The real holder of the number turns up. */
async function realOwner (cr) {
  const s = `${Date.now().toString().slice(-6)}${trash.users.length}`
  const uid = `user_owner_${s}`
  await db.query(
    `insert into public.users (id,email,role,status) values ($1,$2,'company_member','active')`,
    [uid, `owner.${s}@example.com`])
  trash.users.push(uid)

  await db.query('begin'); await as(uid)
  try {
    const { rows: [r] } = await db.query(
      'select * from public.register_company_for_current_user($1,$2,$3,null,$4,$5)',
      [`الشركة الحقيقية ${s}`, cr, `owner.${s}@example.com`, 'جدة', 'مقاولات'])
    await db.query('commit')
    if (r.tenant_id) trash.tenants.push(r.tenant_id)
    if (r.company_id) trash.companies.push(r.company_id)
    return { ok: true, ...r }
  } catch (e) {
    await db.query('rollback')
    return { ok: false, message: e.message }
  }
}

try {
  const { rows: [admin] } = await db.query(
    `select id from public.users where role = 'platform_admin' limit 1`)

  // ===== The derived columns =====
  const s0 = Date.now().toString().slice(-7)
  const { rows: [d0] } = await db.query(
    `insert into public.companies (name, cr_number, city) values ($1,$2,'الرياض')
     returning id, status, approved, review_status`, [`شركة افتراضيات ${s0}`, `12${s0}`])
  trash.companies.push(d0.id)
  ok('صفّ بالافتراضيات يولد pending', d0.status === 'pending', d0.status)
  ok('وapproved = false', d0.approved === false, String(d0.approved))
  ok('وreview_status = under_review', d0.review_status === 'under_review', d0.review_status)

  await db.query('begin'); await as(admin.id)
  await db.query(`update public.companies set status='active' where id=$1`, [d0.id])
  await db.query('commit')
  const { rows: [d1] } = await db.query(
    'select approved, review_status from public.companies where id=$1', [d0.id])
  ok('وحين تصير active يتبعها العمودان',
    d1.approved === true && d1.review_status === 'approved',
    `approved=${d1.approved} review=${d1.review_status}`)

  // ===== The blocked owner is told which situation they are in =====
  const CR1 = `71${Date.now().toString().slice(-7)}`
  const a1 = await abandon(CR1, { ageDays: 30 })

  const blocked = await realOwner(CR1)
  ok('المالك يُمنع أولاً — لكن برسالة قابلة للتصرّف',
    blocked.ok === false && /لم يكتمل/.test(blocked.message || ''),
    blocked.message?.slice(0, 100))

  // ===== A company account cannot sweep =====
  const { rows: [coUser] } = await db.query(
    `select id from public.users where role = 'company_admin' limit 1`)

  await db.query('begin'); await as(coUser.id)
  let refusedSweep = false
  try { await db.query('select * from public.expire_abandoned_registrations(7)') }
  catch (e) { refusedSweep = /مسؤول المنصة/.test(e.message) }
  await db.query('rollback')
  ok('وحساب شركة لا يستطيع الكنس', refusedSweep)

  await db.query('begin'); await as(coUser.id)
  let refusedOne = false
  try { await db.query('select public.reclaim_abandoned_registration($1)', [a1.company_id]) }
  catch (e) { refusedOne = /مسؤول المنصة/.test(e.message) }
  await db.query('rollback')
  ok('ولا استرداد صفّ بعينه', refusedOne)

  // ===== The sweep, by staff =====
  await db.query('begin'); await as(admin.id)
  const { rows: swept } = await db.query('select * from public.expire_abandoned_registrations(7)')
  await db.query('commit')
  ok('الكنس يحرّر الرقم المهجور', swept.some((x) => x.company_id === a1.company_id),
    `حرّر ${swept.length}`)

  const { rows: [old1] } = await db.query(
    'select status, withdraw_reason from public.company_requests where id=$1', [a1.request_id])
  ok('وطلب المهجور يُغلق مسحوباً',
    old1.status === 'withdrawn' && /مهجور/.test(old1.withdraw_reason || ''),
    `${old1.status} / ${old1.withdraw_reason}`)

  const { rows: [oldT] } = await db.query(
    'select company_id, status from public.tenants where id=$1', [a1.tenant_id])
  ok('والحساب المهجور يُفصل ولا يُحذف',
    oldT && oldT.company_id === null && oldT.status === 'inactive', JSON.stringify(oldT))

  const { rows: [oldU] } = await db.query('select id from public.users where id=$1', [a1.user])
  ok('ومستخدمه ما زال قادراً على الدخول', !!oldU)

  const o1 = await realOwner(CR1)
  ok('والمالك الحقيقي يسجّل بعد الكنس', o1.ok === true, o1.message?.slice(0, 90))
  ok('ويأخذ نفس صفّ الشركة', o1.company_id === a1.company_id)

  // ===== And what it refuses =====
  const CR2 = `72${Date.now().toString().slice(-7)}`
  await abandon(CR2, { ageDays: 2 })
  const o2 = await realOwner(CR2)
  ok('محاولة عمرها يومان لا تُسترد',
    o2.ok === false && /مسجّل بالفعل/.test(o2.message || ''), o2.message?.slice(0, 80))

  const CR3 = `73${Date.now().toString().slice(-7)}`
  await abandon(CR3, { ageDays: 60, submit: true })
  const o3 = await realOwner(CR3)
  ok('ومحاولة أُرسلت لا تُسترد مهما طالت',
    o3.ok === false && /مسجّل بالفعل/.test(o3.message || ''), o3.message?.slice(0, 80))

  const CR4 = `74${Date.now().toString().slice(-7)}`
  const a4 = await abandon(CR4, { ageDays: 90 })
  await db.query('begin'); await as(admin.id)
  await db.query(`update public.companies set status='active' where id=$1`, [a4.company_id])
  await db.query('commit')
  const o4 = await realOwner(CR4)
  ok('وشركة نشطة لا تُسترد أبداً',
    o4.ok === false && /مسجّل بالفعل/.test(o4.message || ''), o4.message?.slice(0, 80))

  await db.query('begin'); await as(admin.id)
  const { rows: swept2 } = await db.query('select * from public.expire_abandoned_registrations(7)')
  await db.query('commit')
  ok('والكنس لا يمسّ الشركة النشطة',
    !swept2.some((x) => x.company_id === a4.company_id), `حرّر ${swept2.length}`)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})
  for (const id of trash.companies) {
    await db.query(`delete from public.company_request_events where request_id in
      (select id from public.company_requests where company_id=$1)`, [id]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [id]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [id]).catch(() => {})
  }
  await db.query('delete from public.users where id = any($1)', [trash.users]).catch(() => {})
  await db.query('delete from public.tenants where id = any($1)', [trash.tenants]).catch(() => {})
  for (const id of trash.companies) {
    await db.query('delete from public.companies where id=$1', [id]).catch(() => {})
  }
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — رقم السجل يعود لصاحبه، ولا يُنتزع من أحد\n`)
process.exit(fail ? 1 : 0)
