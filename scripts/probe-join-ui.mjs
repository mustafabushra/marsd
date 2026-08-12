#!/usr/bin/env node
/**
 * The join request, from the gate to the admin's screen and back.
 *
 * The backend passed 20/20 before any of this existed, which is exactly the
 * failure mode worth guarding: a complete feature nobody can reach. So this
 * drives the two screens — the gate offers it, /users answers it — and checks
 * the membership afterwards in the database.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

/**
 * Setup writes run with no claim at all.
 *
 * guard_user_privileges returns early when it cannot see a caller — migrations
 * and jobs have to be able to move accounts. With a claim set, this probe's own
 * fixture work is refused by the very guard it exists to verify: detaching the
 * test account trips «لا يمكن نقل الحساب بين الشركات», which is the guard being
 * right about a request that is not a real one.
 */
const asSystem = async (db) =>
  db.query(`select set_config('request.jwt.claims', '', false)`)

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4410'
const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

const browser = await chromium.launch()
const stamp = Date.now().toString().slice(-6)
const coId = randomUUID(); const tenId = randomUUID()
const OWNER = `join_ui_owner_${stamp}`
let asker = null

try {
  await asSystem(db)
  const cr = `8${stamp}000`.slice(0, 10)
  await db.query(`insert into public.companies (id,name,cr_number,status,source)
                  values ($1,$2,$3,'active','community')`, [coId, `شركة فحص الانضمام ${stamp}`, cr])
  await db.query(`insert into public.tenants (id,name,cr_number,email,phone,company_id,status)
                  values ($1,$2,$3,$4,'',$5,'active')`,
    [tenId, `شركة فحص الانضمام ${stamp}`, cr, `join-ui-${stamp}@marsad.test`, coId])
  await db.query(`insert into public.users (id,email,role,tenant_id,status)
                  values ($1,$2,'company_admin',$3,'active')
                  on conflict (id) do update set role='company_admin', tenant_id=excluded.tenant_id`,
    [OWNER, `${OWNER}@marsad.test`, tenId])

  // ===== The asker =====
  console.log('\n─── من البوابة ───')
  const c1 = await browser.newContext({ viewport: { width: 1400, height: 1100 } })
  const p1 = await c1.newPage()
  const errs = []
  p1.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
  asker = await signIn(p1, BASE, { role: 'company_member' })
  await asSystem(db)
  await db.query('update public.users set tenant_id = null where id = $1', [asker])

  await p1.goto(`${BASE}/company-onboarding`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await p1.waitForFunction(() => /ابدأ برقم السجل/.test(document.body.innerText || ''), { timeout: 20000 })
  await p1.locator('#identify-cr').fill(cr)
  await p1.getByRole('button', { name: 'متابعة' }).click()
  await p1.waitForTimeout(4500)

  let t = await p1.locator('body').innerText()
  ok('البوابة تعرض الشركة المسجّلة', /مسجّلة في مرصد بالفعل/.test(t), t.slice(0, 80))
  const joinBtn = p1.getByRole('button', { name: /طلب الانضمام إلى هذه الشركة/ })
  ok('وتعرض طلب الانضمام', await joinBtn.count() === 1)
  ok('  وطلب الملكية كذلك', await p1.getByRole('button', { name: /تقديم طلب ملكية/ }).count() === 1)

  await p1.locator('#join-note').fill('أعمل في قسم المشتريات')
  await joinBtn.click()
  await p1.waitForTimeout(4000)
  ok('الإرسال يُؤكَّد على الشاشة', /أُرسل طلب الانضمام/.test(await p1.locator('body').innerText()))

  const { rows: [req] } = await db.query(
    `select id, message, status from public.join_requests where tenant_id=$1 and user_id=$2`,
    [tenId, asker])
  ok('والطلب في القاعدة', req?.status === 'pending', req?.status)
  ok('  ومعه تعريفه', /المشتريات/.test(req?.message || ''), req?.message)
  await c1.close()

  // ===== The admin =====
  console.log('\n─── عند مسؤول الشركة ───')
  const c2 = await browser.newContext({ viewport: { width: 1400, height: 1100 } })
  const p2 = await c2.newPage()
  p2.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
  // Sign in as the owner by borrowing the probe account into that tenant.
  const ownerId = await signIn(p2, BASE, { role: 'company_admin' })
  await asSystem(db)
  await db.query('update public.users set tenant_id=$1, role=$2 where id=$3',
    [tenId, 'company_admin', ownerId])

  // A second, synthetic asker.
  //
  // signIn shares one Clerk account across the whole suite, so signing in «as
  // the admin» returns the same user that just asked — and the membership this
  // then detected was the probe's own setup rather than the decision under
  // test. The request the admin answers is made by an account that is not the
  // one driving the browser.
  await asSystem(db)
  await db.query('delete from public.join_requests where tenant_id = $1', [tenId])
  // No detach here: `asker` and `ownerId` are the same shared account, and the
  // line above this block just attached it as the admin. Clearing it again
  // signs the admin out of the company and /users redirects to onboarding.
  const OTHER = `join_ui_asker_${stamp}`
  await db.query(`insert into public.users (id,email,role,tenant_id,status,first_name,last_name)
                  values ($1,$2,'company_member',null,'active','طالب','الانضمام')
                  on conflict (id) do update set tenant_id = null`,
    [OTHER, `${OTHER}@marsad.test`])
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: OTHER })])
  const { rows: [mk] } = await db.query(
    'select public.request_to_join_company($1, $2) id', [coId, 'أعمل في قسم المشتريات'])
  await db.query('commit')
  const reqId = mk.id

  await p2.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await p2.waitForFunction(() => (document.body.innerText || '').length > 400, { timeout: 20000 }).catch(() => {})
  await p2.waitForTimeout(2500)
  t = await p2.locator('body').innerText()
  ok('الطلب ظاهر في إدارة المستخدمين', /طلبات انضمام/.test(t), t.slice(0, 100))
  ok('  ومعه نصّ مقدّمه', /المشتريات/.test(t))

  await p2.getByRole('button', { name: 'قبول كعضو' }).first().click()
  await p2.waitForTimeout(4500)

  const { rows: [after] } = await db.query('select tenant_id, role from public.users where id=$1', [OTHER])
  ok('القبول يُنشئ العضوية', after?.tenant_id === tenId, String(after?.tenant_id))
  ok('  بالدور المختار', after?.role === 'company_member', after?.role)
  const { rows: [st] } = await db.query('select status from public.join_requests where id=$1', [reqId])
  ok('  والطلب يُغلق', st?.status === 'approved', st?.status)
  ok('console نظيف', errs.length === 0, errs[0])
  await c2.close()
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally {
  await browser.close()
  await asSystem(db).catch(()=>{})
  await db.query('delete from public.notifications where tenant_id=$1', [tenId]).catch(()=>{})
  await db.query(`delete from public.audit_logs where entity='join_request'`).catch(()=>{})
  await db.query('delete from public.join_requests where tenant_id=$1', [tenId]).catch(()=>{})
  await db.query('update public.users set tenant_id=null where tenant_id=$1', [tenId]).catch(()=>{})
  await db.query(`delete from public.users where id like 'join_ui_%'`).catch(()=>{})
  await db.query('delete from public.tenants where id=$1', [tenId]).catch(()=>{})
  await db.query('delete from public.companies where id=$1', [coId]).catch(()=>{})
  const { rows: [l] } = await db.query('select count(*)::int n from public.tenants where id=$1', [tenId])
  console.log(`\n  🧹 المتبقّي: ${l.n}`)
  await db.end()
}
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الطلب يُرسَل ويُرى ويُقبَل\n`)
process.exit(fail ? 1 : 0)
