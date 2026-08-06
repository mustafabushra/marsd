#!/usr/bin/env node
/**
 * Do plan limits actually hold, or only in React?
 *
 * The free plan allows 3 watchlist entries and one tenant had 4, written within
 * three seconds of each other. Every check lived in the client: a courtesy to the
 * user, not a constraint on the data. It can be skipped by a second tab, by a
 * screen that writes the same table without asking — the watchlist is written
 * from two screens and only one of them checked — or by anyone talking to
 * PostgREST directly with their own session token.
 *
 * This one walks a real account up to its ceiling and one step past it, and reads
 * the count back each time. Everything happens inside a transaction that is rolled
 * back, so no tenant ends the run with a row it did not have.
 *
 * Usage: node scripts/probe-plan-limits.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failures = 0
const ok  = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { console.log(`  ❌ ${m}`); failures++ }

const { rows: [actor] } = await c.query(`
  select u.id, u.email, u.tenant_id, t.name as tenant
    from public.users u join public.tenants t on t.id = u.tenant_id
   where u.status = 'active' and u.role = 'company_admin'
   order by (select count(*) from public.watchlist_items w where w.tenant_id = t.id)
   limit 1`)

if (!actor) { console.error('\n  لا يوجد مدير شركة لفحصه.\n'); await c.end(); process.exit(1) }

const limit = (await c.query('select public.tenant_limit($1, $2) as v', [actor.tenant_id, 'watchlist_items'])).rows[0].v
const seats = (await c.query('select public.tenant_limit($1, $2) as v', [actor.tenant_id, 'users'])).rows[0].v

console.log(`\n  ${actor.tenant}  ·  ${actor.email}`)
console.log(`  حد قوائم المراقبة: ${limit}    حد المستخدمين: ${seats}\n`)

await c.query('begin')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: actor.id, role: 'authenticated' })])

// ── watchlist ───────────────────────────────────────────────────────────────
const { rows: companies } = await c.query(
  `select id, name from public.companies
    where id not in (select company_id from public.watchlist_items where tenant_id = $1)
    limit $2`, [actor.tenant_id, limit + 2])

const count = async () => Number((await c.query(
  'select count(*) from public.watchlist_items where tenant_id = $1', [actor.tenant_id])).rows[0].count)

let have = await count()
console.log(`  البداية: ${have} عنصراً`)

for (const co of companies) {
  const before = have
  let error = null
  await c.query('savepoint s')
  try {
    await c.query(
      'insert into public.watchlist_items (tenant_id, company_id, created_by) values ($1, $2, $3)',
      [actor.tenant_id, co.id, actor.id])
    await c.query('release savepoint s')
  } catch (e) {
    error = e.message.split('\n')[0]
    await c.query('rollback to savepoint s')
  }
  have = await count()

  // The count is the answer, not the presence of an error: an insert that RLS
  // filters out raises nothing either.
  if (before < limit) {
    have === before + 1
      ? ok(`إضافة ${before + 1}/${limit}: مرت`)
      : bad(`إضافة ${before + 1}/${limit}: لم تُكتب — ${error || 'بلا خطأ'}`)
  } else {
    have === before
      ? ok(`إضافة ${before + 1} فوق الحد ${limit}: مرفوضة — ${error || 'بلا خطأ!'}`)
      : bad(`إضافة ${before + 1} فوق الحد ${limit}: مرت! العدد الآن ${have}`)
    break
  }
}

// ── seats ───────────────────────────────────────────────────────────────────
console.log('')
const taken = Number((await c.query(
  `select (select count(*) from public.users where tenant_id = $1 and status <> 'inactive')
        + (select count(*) from public.pending_invites where tenant_id = $1
             and status = 'pending' and expires_at > now()) as n`, [actor.tenant_id])).rows[0].n)
console.log(`  المقاعد المشغولة: ${taken} من ${seats}`)

for (let i = taken; i <= seats; i++) {
  const email = `probe-${i}-${Date.now()}@example.test`
  await c.query('savepoint s')
  let error = null
  try {
    await c.query(
      `insert into public.pending_invites (tenant_id, email, role, invited_by, status, expires_at)
       values ($1, $2, 'company_member', $3, 'pending', now() + interval '7 days')`,
      [actor.tenant_id, email, actor.id])
  } catch (e) { error = e.message.split('\n')[0] }

  // A failed statement poisons the transaction, so unwind before asking anything
  // else — the count below is a query like any other and would be refused too.
  if (error) await c.query('rollback to savepoint s')

  const now = Number((await c.query(
    `select count(*) from public.pending_invites where tenant_id = $1
       and status = 'pending' and expires_at > now()`, [actor.tenant_id])).rows[0].count)

  if (i < seats) {
    if (error) bad(`دعوة عند ${i}/${seats}: رُفضت — ${error}`)
    else { ok(`دعوة عند ${i}/${seats}: مرت`); await c.query('release savepoint s') }
  } else {
    error ? ok(`دعوة فوق الحد ${seats}: مرفوضة`) : bad(`دعوة فوق الحد ${seats}: مرت! المعلّقة الآن ${now}`)
    if (!error) await c.query('rollback to savepoint s')
  }
}

// ── the operator's switch ───────────────────────────────────────────────────
// Raising a plan from the admin panel has to raise the ceiling with no deploy.
// If it does not, the panel is decoration and the number is in the code.
console.log('')
await c.query('set local role postgres')
await c.query(`update public.plans set limits = limits || '{"watchlist_items": 99}'::jsonb where is_default`)
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: actor.id, role: 'authenticated' })])

// Read the ceiling as the owner, not as the tenant.
//
// tenant_limit is a server-side helper — triggers and other SECURITY DEFINER
// functions call it, and 060 revoked the browser's grant because nothing in the
// application ever called it and an anonymous caller could read any tenant's
// plan ceiling with it. This probe was reading it while impersonating the
// tenant, which is not how the platform uses it and is exactly what was closed.
//
// The role is restored immediately after: the insert below must be attempted as
// the tenant, because the ceiling is enforced against that tenant.
await c.query('set local role postgres')
const raised = (await c.query('select public.tenant_limit($1, $2) as v', [actor.tenant_id, 'watchlist_items'])).rows[0].v
await c.query('set local role authenticated')
// A company this tenant has not already watch-listed — made here, not found.
//
// It was `companies[companies.length - 1]`, which the fill loop above had
// already added. The insert failed on a unique index and the probe reported that
// raising the limit «لم يسرِ», blaming the entitlement system for a duplicate
// row; the ceiling had been raised correctly the whole time. Looking for an
// unused company does not work either — the loop above watch-lists every one
// there is, so the check would skip itself and pass by testing nothing.
//
// Everything here is inside the transaction that is rolled back at the end.
// The claims go too, not just the role: adding a company as a signed-in tenant
// requires its commercial registration (096), and that guard reads the session
// rather than the role. This row is scaffolding for a limit check, not a
// company being registered.
await c.query('set local role postgres')
await c.query("select set_config('request.jwt.claims', '', true)")
const { rows: [spare] } = await c.query(`
  insert into public.companies (name, cr_number, approved, source)
  values ('شركة فحص الحد', $1, false, 'community') returning id`,
[`99${String(Date.now()).slice(-8)}`])
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: actor.id, role: 'authenticated' })])
let raisedOk = false
let why = ''
try {
  if (!spare) throw new Error('لا شركة خارج قائمة المراقبة')
  await c.query('insert into public.watchlist_items (tenant_id, company_id, created_by) values ($1, $2, $3)',
    [actor.tenant_id, spare.id, actor.id])
  const now = await count()
  raisedOk = now > have
  if (!raisedOk) why = `الإدخال مرّ لكن العدد لم يزد (${have} → ${now})`
} catch (e) {
  // Bare `catch {}` here reported «لم يسرِ» for any reason at all — including a
  // duplicate row, which is not a limit at work. A check that cannot say why it
  // failed sends the reader to the wrong place.
  why = e.message.split('\n')[0]
}

raisedOk
  ? ok(`رفع الحد من لوحة الإدارة إلى ${raised}: سرى فوراً بلا نشر`)
  : bad(`رفع الحد من لوحة الإدارة: لم يسرِ — ${why} · السقف المقروء=${raised}`)

// Everything above happened inside one transaction, including the plan change.
await c.query('rollback')

// Prove it: the tenant must end with exactly what it started with.
const final = Number((await c.query(
  'select count(*) from public.watchlist_items where tenant_id = $1', [actor.tenant_id])).rows[0].count)
const planNow = (await c.query("select limits ->> 'watchlist_items' as v from public.plans where is_default")).rows[0].v
console.log(`\n  بعد التراجع: ${final} عنصراً، وحد الباقة ${planNow} — كما كان`)

await c.end()

console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ الحدود تُطبَّق في القاعدة، ويتحكم بها المشغّل\n')
process.exit(failures ? 1 : 0)
