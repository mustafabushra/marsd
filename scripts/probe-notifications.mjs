#!/usr/bin/env node
/**
 * Does a notification written by the admin panel actually land, and can the
 * company read it?
 *
 * The notifications table held zero rows for the platform's entire life. Every
 * approval, rejection and information request wrote one, and every write failed:
 * some named columns the table does not have, some omitted user_id which is NOT
 * NULL, and all of them either swallowed the error or never read it. The code
 * looked right at every call site — which is why the only useful test is the one
 * that writes a row and then goes looking for it.
 *
 * This walks the real path: an admin writes to a company, and a member of that
 * company reads their own inbox under their own policies. Everything is rolled
 * back.
 *
 * Usage: node scripts/probe-notifications.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failures = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { console.log(`  ❌ ${m}`); failures++ }

const { rows: [admin] } = await c.query(
  "select id, email from public.users where role = 'platform_admin' and status = 'active' limit 1")
const { rows: [target] } = await c.query(`
  select t.id as tenant_id, t.name,
         (select count(*) from public.users u where u.tenant_id = t.id and u.status = 'active')::int as members
    from public.tenants t
   where t.status = 'active'
     and exists (select 1 from public.users u where u.tenant_id = t.id and u.status = 'active')
   order by members desc limit 1`)

if (!admin || !target) {
  console.error('\n  يلزم مدير منصة وكيان فيه أعضاء.\n'); await c.end(); process.exit(1)
}

console.log(`\n  المدير:  ${admin.email}`)
console.log(`  الشركة: ${target.name} — ${target.members} عضواً\n`)

const { rows: [{ count: before }] } = await c.query('select count(*) from public.notifications')
console.log(`  الإشعارات في القاعدة قبل: ${before}`)

await c.query('begin')

// ── the admin writes, exactly as notifyTenant does ──────────────────────────
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])

const { rows: members } = await c.query(
  "select id, notification_prefs from public.users where tenant_id = $1 and status = 'active'",
  [target.tenant_id])

members.length === target.members
  ? ok(`المدير يقرأ أعضاء الشركة (${members.length})`)
  : bad(`المدير يقرأ ${members.length} من ${target.members} عضواً — الإشعار لن يصل الجميع`)

let written = 0
try {
  const { rowCount } = await c.query(`
    insert into public.notifications (user_id, tenant_id, type, payload)
    select unnest($1::text[]), $2, 'report_approved',
           jsonb_build_object('title', 'فحص آلي', 'message', 'نص الفحص')`,
    [members.map((m) => m.id), target.tenant_id])
  written = rowCount
  ok(`كُتب ${written} إشعاراً`)
} catch (e) {
  bad(`فشلت الكتابة: ${e.message.split('\n')[0]}`)
}

// ── the company reads its own inbox ─────────────────────────────────────────
const reader = members[0]
await c.query('set local role postgres')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)',
  ['request.jwt.claims', JSON.stringify({ sub: reader.id, role: 'authenticated' })])

const { rows: inbox } = await c.query(
  "select id, type, payload, read_at from public.notifications where user_id = $1 and payload ->> 'title' = 'فحص آلي'",
  [reader.id])

inbox.length ? ok('العضو يرى الإشعار في صندوقه') : bad('العضو لا يرى الإشعار — سياسة القراءة تحجبه')

if (inbox.length) {
  const p = inbox[0].payload
  // The old call sites JSON.stringify'd the payload into a jsonb column, which
  // stores a JSON *string*. payload->>'message' on that is null, so the screen
  // would render an empty notification even when the row existed.
  typeof p === 'object' && p.message === 'نص الفحص'
    ? ok('النص يُقرأ من payload كـ jsonb — لا كنصّ مُسلسل')
    : bad(`payload بشكل خاطئ: ${JSON.stringify(p)}`)

  inbox[0].read_at === null ? ok('يصل غير مقروء') : bad('يصل مقروءاً')

  const { rowCount: marked } = await c.query(
    'update public.notifications set read_at = now() where id = $1', [inbox[0].id])
  marked > 0 ? ok('العضو يعلّمه مقروءاً') : bad('العضو لا يستطيع تعليمه مقروءاً')
}

// ── nobody else's inbox ─────────────────────────────────────────────────────
// Back to postgres to find them: asking while still impersonating the reader
// searches under the reader's own policy, which shows only their company — so
// the probe silently found nobody and skipped its own leak check.
await c.query('set local role postgres')
const { rows: [outsider] } = await c.query(`
  select id from public.users
   where tenant_id is not null and tenant_id <> $1
     and status = 'active' and role <> 'platform_admin'
   limit 1`, [target.tenant_id])

if (outsider) {
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: outsider.id, role: 'authenticated' })])
  const { rows: leaked } = await c.query(
    "select id from public.notifications where payload ->> 'title' = 'فحص آلي'")
  leaked.length ? bad(`طرف خارج الشركة يرى ${leaked.length} إشعاراً!`) : ok('طرف خارج الشركة لا يرى شيئاً')
}

await c.query('rollback')

const { rows: [{ count: after }] } = await c.query('select count(*) from public.notifications')
console.log(`\n  الإشعارات في القاعدة بعد التراجع: ${after} (كما كانت)`)

await c.end()
console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ الإشعارات تُكتب وتُقرأ ولا تتسرّب\n')
process.exit(failures ? 1 : 0)
