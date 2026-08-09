#!/usr/bin/env node
/**
 * Signing out and back in does not send you to the form again.
 *
 * Reported: register a company, see «تحت المراجعة», sign out, sign in — and land
 * back on `/company-onboarding`.
 *
 * The database explained it. The account had no tenant, and there was exactly
 * one orphaned company in the whole table: created, pending, with no tenant
 * pointing at it. Onboarding wrote four rows from the browser as four separate
 * requests; the first landed and a later one did not, and nothing spans four
 * HTTP calls.
 *
 * That left the worse half of a failure. The account resolved to «no company»
 * on every sign-in, and the person's own half-finished attempt held their
 * registration number — so filling the form again was refused as a duplicate.
 * Locked out by their own failure, with nothing on screen to say so.
 *
 * What is proven here: registration is one transaction, the state survives a
 * session because it is read from the database, and a wrecked attempt does not
 * lock its owner out.
 *
 *   node scripts/probe-onboarding-resumes.mjs
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

const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const refuses = async (n, fn, expect) => {
  const sp = `o${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try {
    await fn()
    await c.query(`release savepoint ${sp}`)
    fail += 1
    console.log(`  ❌ ${n} — لم يُرفض`)
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const m = !expect || e.message.includes(expect)
    if (m) { pass += 1; console.log(`  ✅ ${n}`) }
    else { fail += 1; console.log(`  ❌ ${n} — ${e.message.slice(0, 60)}`) }
  }
}

const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

const state = async () => (await c.query('select * from public.my_registration_state()')).rows[0]

// The commercial registration scan is passed, because `guard_company_requires_cr_doc`
// requires one for a community entry and is right to: a person registering a
// company is making a claim, and a reviewer needs something to check it
// against. The first version of this probe sent null and was refused by it.
const register = (cr, name = 'شركة فحص الاستئناف', email = 'probe.onb@example.com') => c.query(
  'select * from public.register_company_for_current_user($1,$2,$3,$4,$5,$6,$7,$8,$9)',
  [name, cr, email, '0500000000', 'الرياض', 'تجارة', null,
   'data:application/pdf;base64,JVBERi0xLjQK', 2020])

try {
  await c.query('begin')

  const stamp = Date.now().toString().slice(-7)
  const uid = `user_probe_onb_${stamp}`
  await c.query(
    `insert into public.users (id, email, role, status)
     values ($1, 'probe.onb@example.com', 'company_member', 'active')`, [uid])

  await asUser(uid)

  // --- Before registering ----------------------------------------------------
  ok('قبل التسجيل: الحالة «لا شيء»', (await state()).state === 'none')

  // --- Registering -----------------------------------------------------------
  const CR = `55${stamp}`
  const { rows: [made] } = await register(CR)
  ok('التسجيل يُنشئ شركة ومستأجراً', !!made.company_id && !!made.tenant_id)

  const after = await state()
  ok('والحالة صارت «قيد المراجعة»', after.state === 'pending_review', `جاءت «${after.state}»`)
  ok('وتحمل اسم الشركة', after.company_name === 'شركة فحص الاستئناف')

  // --- The reported scenario -------------------------------------------------
  //
  // A new session is a fresh `request.jwt.claims` and nothing else — no browser
  // state survives it. If the answer is unchanged, the answer came from the
  // database rather than from anything the page was holding.
  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  ok('بلا جلسة: مجهول', (await state()).state === 'anonymous')

  await asUser(uid)
  const back = await state()
  ok('بعد الدخول ثانية: ما زالت «قيد المراجعة»', back.state === 'pending_review',
    `جاءت «${back.state}» — سيُرسَل للنموذج من جديد`)
  ok('ونفس الشركة', back.company_id === made.company_id)

  // --- Approved, and rejected ------------------------------------------------
  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)

  await asUser(admin.id)
  await c.query(`update public.companies set approved = true, status = 'active' where id = $1`,
    [made.company_id])
  await asUser(uid)
  ok('بعد الموافقة: «معتمدة»', (await state()).state === 'approved')

  await asUser(admin.id)
  await c.query(`update public.companies set approved = false, status = 'rejected' where id = $1`,
    [made.company_id])
  await asUser(uid)
  ok('وبعد الرفض: «مرفوضة»', (await state()).state === 'rejected')

  // --- Submitting twice ------------------------------------------------------
  const { rows: [again] } = await register(CR)
  ok('إرسال ثانٍ يُرجع نفس الحساب', again.tenant_id === made.tenant_id, 'أنشأ حساباً ثانياً')

  // --- The wreckage of a failed attempt --------------------------------------
  //
  // A company with no tenant is exactly what the reported account was stuck
  // behind: its own registration number, held by its own half-finished attempt.
  const uid2 = `user_probe_onb2_${stamp}`
  await c.query(
    `insert into public.users (id, email, role, status)
     values ($1, 'probe.onb2@example.com', 'company_member', 'active')`, [uid2])

  // Created without an identity. `guard_company_requires_cr_doc` applies to a
  // caller who has a tenant, and the claims at this point still belonged to the
  // first user — who by now has one. The fixture was being refused for a rule
  // that has nothing to do with what it is testing.
  const ORPHAN = `56${stamp}`
  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await c.query(
    `insert into public.companies (name, cr_number, source, status, approved)
     values ('محاولة فاشلة', $1, 'community', 'pending', false)`, [ORPHAN])

  await asUser(uid2)
  const { rows: [rescued] } = await register(ORPHAN, 'محاولة ثانية', 'probe.onb2@example.com')
  ok('محاولة فاشلة سابقة لا تحبس صاحبها', !!rescued.tenant_id,
    'رقم سجله محجوز بمحاولته هو')
  ok('وتُستعمل نفس الشركة لا شركة ثانية',
    (await c.query('select count(*)::int n from public.companies where cr_number = $1', [ORPHAN]))
      .rows[0].n === 1)

  // --- Somebody else's company ------------------------------------------------
  const uid3 = `user_probe_onb3_${stamp}`
  await c.query(
    `insert into public.users (id, email, role, status)
     values ($1, 'probe.onb3@example.com', 'company_member', 'active')`, [uid3])

  await asUser(uid3)
  await refuses('لكن شركة لها حساب لا تُؤخذ',
    () => register(CR, 'محاولة ثالثة', 'probe.onb3@example.com'), 'لشركة أخرى')

  // --- Nothing left behind on failure -----------------------------------------
  const before = (await c.query('select count(*)::int n from public.companies')).rows[0].n
  await refuses('تسجيل بلا اسم مرفوض', () => c.query(
    `select * from public.register_company_for_current_user('', '9990001', 'x@y.com')`),
  'اسم الشركة')
  const afterCount = (await c.query('select count(*)::int n from public.companies')).rows[0].n
  ok('والفشل لا يترك شركة يتيمة', before === afterCount, `${before} → ${afterCount}`)

  // --- Staff pass through -------------------------------------------------------
  await asUser(admin.id)
  ok('موظّف مرصد ليس «بلا شركة»', (await state()).state === 'staff',
    'المدير سيُرسَل لنموذج تسجيل شركة')

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — الحالة في القاعدة، وتنجو من الجلسة\n`)
process.exit(fail ? 1 : 0)
