#!/usr/bin/env node
/**
 * An ownership claim, decided in the company file.
 *
 * This is the moment a person becomes the company on Marsad: a tenant appears
 * if there was none, the claimant becomes company_admin of it, and the request
 * closes. It used to be three writes from the browser with no transaction
 * around them — a failure between the second and the third left a user who was
 * already company_admin and a claim still pending, so the next reviewer
 * approved it again and the whole thing ran twice.
 *
 * So what is checked is all three landing together, and the refusal path
 * leaving nothing behind.
 *
 * A company, a claimant and a claim are created and removed.
 *
 *   node scripts/probe-claim-decisions.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4399'

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

const ADMIN = 'claim_probe_admin'
const CLAIMANT = 'claim_probe_user'
const coId = randomUUID()
let claimA = null
let claimB = null
let tenantId = null

const browser = await chromium.launch()

try {
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'claim-admin@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [ADMIN])
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: ADMIN })])

  await db.query(
    `insert into public.companies (id, name, cr_number, status, source, created_at)
     values ($1, $2, $3, 'active', 'community', now())`,
    [coId, `شركة فحص الملكية ${Date.now().toString().slice(-6)}`, String(Date.now()).slice(-10)])

  await db.query(
    `insert into public.users (id, email, role, status, first_name, last_name)
     values ($1, 'claimant@marsad.test', 'company_member', 'active', 'مالك', 'مُفترض')
     on conflict (id) do update set role = 'company_member', tenant_id = null`, [CLAIMANT])

  const mkClaim = async () => {
    const id = randomUUID()
    await db.query(
      `insert into public.claim_requests (id, company_id, user_id, status, created_at, submitted_at)
       values ($1, $2, $3, 'pending', now(), now())`, [id, coId, CLAIMANT])
    return id
  }
  claimA = await mkClaim()

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })

  await signIn(page, BASE, { role: 'platform_admin' })
  const openAccount = async () => {
    await page.goto(`${BASE}/admin/company/${coId}`, { waitUntil: 'networkidle', timeout: 45000 })
    const tl = page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
    await tl.waitFor({ state: 'visible', timeout: 25000 })
    await tl.getByRole('tab', { name: 'الحساب والطلبات', exact: true }).click()
    await page.waitForTimeout(1800)
  }
  await openAccount()

  console.log('\n─── الطلب في الملفّ ───')
  const main = page.locator('#main')
  let body = await main.innerText()
  ok('قسم «طلبات الملكية» معروض', body.includes('طلبات الملكية'))
  ok('والطلب ظاهر باسم مقدّمه', body.includes('مالك'), body.slice(0, 110))
  ok('وحالته «بانتظار القرار»', body.includes('بانتظار القرار'))

  console.log('\n─── الرفض ───')
  await page.getByRole('button', { name: 'رفض', exact: true }).first().click()
  const dlg = page.getByRole('dialog', { name: 'سبب القرار' })
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  ok('الرفض يحتاج سبباً', await dlg.getByRole('button', { name: 'تأكيد' }).isDisabled())
  await dlg.locator('textarea').fill('لم تُرفق وثيقة تثبت الصفة النظامية.')
  await page.waitForTimeout(300)
  await dlg.getByRole('button', { name: 'تأكيد' }).click()
  await page.waitForTimeout(4000)

  const { rows: [rej] } = await db.query(
    'select status, rejection_reason, reviewed_by from public.claim_requests where id = $1', [claimA])
  ok('الرفض محفوظ', rej?.status === 'rejected', rej?.status)
  ok('ومعه السبب', (rej?.rejection_reason || '').includes('الصفة'), rej?.rejection_reason)
  ok('ومَن راجعه مسجّل', Boolean(rej?.reviewed_by))

  // Nothing was granted on the way to a refusal.
  const { rows: [u1] } = await db.query(
    'select tenant_id, role from public.users where id = $1', [CLAIMANT])
  ok('ولم يُمنح مقدّم الطلب شيئاً', u1?.tenant_id === null && u1?.role === 'company_member',
    `${u1?.role} / ${u1?.tenant_id}`)

  // ===== Approve =====
  console.log('\n─── القبول ───')
  claimB = await mkClaim()
  await openAccount()
  await page.getByRole('button', { name: 'قبول الملكية' }).first().click()
  await page.waitForTimeout(5000)

  const { rows: [app] } = await db.query(
    'select status, tenant_id, reviewed_by from public.claim_requests where id = $1', [claimB])
  ok('الطلب صار مقبولاً', app?.status === 'approved', app?.status)
  tenantId = app?.tenant_id
  ok('وأُنشئ كيان للشركة', Boolean(tenantId))

  const { rows: [t] } = await db.query(
    'select company_id, status from public.tenants where id = $1', [tenantId])
  ok('  ومربوط بالشركة نفسها', t?.company_id === coId)

  const { rows: [u2] } = await db.query(
    'select tenant_id, role, status from public.users where id = $1', [CLAIMANT])
  ok('ومقدّم الطلب صار مسؤول الشركة', u2?.role === 'company_admin', u2?.role)
  ok('  ومربوطاً بالكيان', u2?.tenant_id === tenantId, `${u2?.tenant_id}`)

  const { rows: [n] } = await db.query(
    `select count(*)::int c from public.notifications
      where user_id = $1 and type = 'claim_approved'`, [CLAIMANT])
  ok('وأُبلغ بالقبول', n.c > 0, `${n.c} إشعار`)

  const { rows: [a] } = await db.query(
    `select count(*)::int c from public.audit_logs
      where entity = 'claim_request' and entity_id = $1`, [claimB])
  ok('والقرار مسجّل في التدقيق', a.c > 0)

  // ===== Not twice =====
  console.log('\n─── لا يُقرَّر مرّتين ───')
  let second = ''
  try {
    await db.query('select public.decide_claim_request($1, true, null)', [claimB])
  } catch (e) { second = e.message }
  ok('طلب محسوم لا يقبل قراراً جديداً', /حالة|لا يقبل/.test(second), second.slice(0, 70) || 'قُبل مرّتين')

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 240)}`)
} finally {
  await browser.close()
  await db.query('delete from public.notifications where user_id = $1', [CLAIMANT]).catch(() => {})
  await db.query(`delete from public.audit_logs where entity = 'claim_request' and entity_id = any($1)`,
    [[claimA, claimB].filter(Boolean)]).catch(() => {})
  await db.query(`delete from public.audit_logs where entity = 'company' and entity_id = $1`, [coId]).catch(() => {})
  await db.query('delete from public.claim_requests where company_id = $1', [coId]).catch(() => {})
  await db.query('update public.users set tenant_id = null where id = $1', [CLAIMANT]).catch(() => {})
  if (tenantId) await db.query('delete from public.tenants where id = $1', [tenantId]).catch(() => {})
  await db.query('delete from public.companies where id = $1', [coId]).catch(() => {})
  await db.query('delete from public.users where id = any($1)', [[ADMIN, CLAIMANT]]).catch(() => {})
  const { rows: [left] } = await db.query(
    'select count(*)::int n from public.companies where id = $1', [coId])
  console.log(`\n  🧹 المتبقّي: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الملكية تُقرَّر في الملفّ، والثلاثة تحدث معاً\n`)
process.exit(fail ? 1 : 0)
