#!/usr/bin/env node
/**
 * The upgrade path, end to end, as real accounts.
 *
 * This one touches money, so the things that must not happen matter more than
 * the thing that must: a company activating its own paid plan, a company
 * receiving a plan it has no invoice for, an invoice for a plan nobody was moved
 * to, or a company reading another company's billing.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 * Usage: node scripts/probe-upgrade.mjs
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

const as = async (id) => {
  await c.query('set local role postgres')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: id, role: 'authenticated' })])
}
const asService = async () => {
  await c.query('set local role postgres')
  await c.query("select set_config('request.jwt.claims', '', true)")
}

const refused = async (label, sql, params) => {
  await c.query('savepoint s')
  let allowed = false, detail = ''
  try {
    const { rowCount } = await c.query(sql, params)
    allowed = rowCount > 0
  } catch (e) { detail = ' — ' + e.message.split('\n')[0] }
  await c.query('rollback to savepoint s')
  allowed ? bad(`${label}: مسموح!`) : ok(`${label}: مرفوض${detail}`)
}

const { rows: [buyer] } = await c.query(`
  select t.id as tenant_id, t.name,
         (select u.id from public.users u where u.tenant_id = t.id and u.role = 'company_admin' and u.status = 'active' limit 1) as admin_id,
         (select u.id from public.users u where u.tenant_id = t.id and u.role = 'company_member' and u.status = 'active' limit 1) as member_id
    from public.tenants t
   where t.status = 'active'
     and exists (select 1 from public.users u where u.tenant_id = t.id and u.role = 'company_admin' and u.status = 'active')
   limit 1`)

const { rows: [admin] } = await c.query(
  "select id, email from public.users where role = 'platform_admin' and status = 'active' limit 1")
// The plan being bought is whichever priced plan is actually on sale, not 'pro'
// by name. The paid tiers were switched off when payment was deferred, and a
// probe that hardcodes one of them reports the purchase path as broken when it
// is merely closed.
const { rows: [pro] } = await c.query(`
  select id, name, price_monthly from public.plans
   where active and price_monthly > 0 and not is_default
   order by price_monthly asc limit 1`)

// Something switched off, to prove the guard refuses it. Any inactive plan does.
const { rows: [ent] } = await c.query(
  'select id, name from public.plans where not active order by price_monthly desc limit 1')
const { rows: [free] } = await c.query('select id from public.plans where is_default limit 1')

if (!buyer?.admin_id || !admin) {
  console.error('\n  يلزم كيان بمدير، ومدير منصة.\n')
  await c.end(); process.exit(1)
}

if (!pro) {
  // Not a pass and not a failure: there is nothing to buy, so the purchase path
  // cannot be exercised. Said out loud rather than reported as green, because a
  // check that passes by matching nothing is worse than no check.
  console.log('\n  ⏭  لا توجد باقة مدفوعة مفعّلة — مسار الشراء غير قابل للفحص الآن.')
  console.log('     (الباقات المدفوعة موقوفة حتى تتوفّر بوابة الدفع)\n')
  await c.end(); process.exit(0)
}

console.log(`\n  الشركة: ${buyer.name}`)
console.log(`  الباقة المطلوبة: ${pro.name} — ${pro.price_monthly} ر.س/شهر\n`)

await c.query('begin')

const REQ = `insert into public.plan_change_requests (tenant_id, requested_by, requested_plan_id, note)
             values ($1, $2, $3, 'فحص آلي')`

// ── who may ask ─────────────────────────────────────────────────────────────
if (buyer.member_id) {
  await as(buyer.member_id)
  await refused('عضو (غير مدير) يطلب ترقية', REQ, [buyer.tenant_id, buyer.member_id, pro.id])
}

await as(buyer.admin_id)
if (ent) await refused(`طلب باقة معطّلة (${ent.name})`, REQ, [buyer.tenant_id, buyer.admin_id, ent.id])
if (free) await refused('طلب الباقة الحالية نفسها', REQ, [buyer.tenant_id, buyer.admin_id, free.id])

// ── the request ─────────────────────────────────────────────────────────────
console.log('')
const { rows: [req] } = await c.query(REQ + ' returning id, status, current_plan_id', [buyer.tenant_id, buyer.admin_id, pro.id])
req?.status === 'pending' ? ok('مدير الشركة يطلب الترقية') : bad('الطلب لم يُسجَّل')

await refused('طلب ثانٍ مفتوح', REQ, [buyer.tenant_id, buyer.admin_id, pro.id])
await refused('الشركة تفعّل باقتها بنفسها',
  "update public.plan_change_requests set status = 'approved' where id = $1", [req.id])
await refused('الشركة تغيّر الباقة المطلوبة بعد الإرسال',
  'update public.plan_change_requests set requested_plan_id = $1 where id = $2', [free?.id, req.id])

// ── activation ──────────────────────────────────────────────────────────────
console.log('')
await as(buyer.admin_id)
await refused('الشركة تنادي دالة التفعيل مباشرة',
  'select public.approve_plan_change($1, 1, null)', [req.id])

await as(admin.id)
const { rows: [{ approve_plan_change: result }] } = await c.query(
  'select public.approve_plan_change($1, $2, $3)', [req.id, 3, 'حُوّل المبلغ — فحص آلي'])
ok(`إدارة مرصد تفعّل: ${result.plan_name} · ${result.months} أشهر · ${result.total} ر.س شاملة الضريبة`)

await asService()

const { rows: [sub] } = await c.query(
  "select plan_id, status, current_period_end from public.subscriptions where tenant_id = $1 and status = 'active' order by created_at desc limit 1",
  [buyer.tenant_id])
sub?.plan_id === pro.id ? ok('الاشتراك انتقل للباقة المطلوبة') : bad('الاشتراك لم ينتقل')

const { rows: [inv] } = await c.query(
  'select amount, vat, status from public.invoices where id = $1', [result.invoice_id])
const expectedAmount = Number(pro.price_monthly) * 3
Number(inv?.amount) === expectedAmount
  ? ok(`الفاتورة بالمبلغ الصحيح: ${inv.amount} + ${inv.vat} ضريبة`)
  : bad(`الفاتورة ${inv?.amount} والمتوقّع ${expectedAmount}`)

// The limit the company is measured against must move with the plan, or the
// upgrade is a receipt and nothing else.
const { rows: [{ v: newLimit }] } = await c.query(
  "select public.tenant_limit($1, 'watchlist_items') as v", [buyer.tenant_id])
const { rows: [{ v: planLimit }] } = await c.query(
  "select (limits ->> 'watchlist_items')::int as v from public.plans where id = $1", [pro.id])
newLimit === planLimit
  ? ok(`الحدود انتقلت فوراً: قوائم المراقبة ${newLimit}`)
  : bad(`الحد ${newLimit} وباقة pro تعطي ${planLimit}`)

await as(admin.id)
await refused('التفعيل مرتين لنفس الطلب',
  'select public.approve_plan_change($1, 1, null)', [req.id])

// ── who may read the invoice ────────────────────────────────────────────────
console.log('')
await as(buyer.admin_id)
const { rows: mine } = await c.query('select id from public.tenant_invoices()')
mine.length ? ok(`الشركة ترى فواتيرها (${mine.length})`) : bad('الشركة لا ترى فواتيرها')

await asService()
const { rows: [outsider] } = await c.query(`
  select u.id from public.users u
   where u.tenant_id is not null and u.tenant_id <> $1
     and u.role <> 'platform_admin' and u.status = 'active' limit 1`, [buyer.tenant_id])
if (outsider) {
  await as(outsider.id)
  const { rows: theirs } = await c.query('select id from public.tenant_invoices($1)', [buyer.tenant_id])
  theirs.some((x) => x.id === result.invoice_id)
    ? bad('شركة أخرى ترى فاتورة ليست لها!')
    : ok('شركة أخرى لا ترى فواتير غيرها')
}

await c.query('rollback')

await asService()
const { rows: [{ count: reqs }] } = await c.query('select count(*) from public.plan_change_requests')
const { rows: [p] } = await c.query(
  "select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = $1 and s.status = 'active'",
  [buyer.tenant_id])
console.log(`\n  بعد التراجع: ${reqs} طلباً، و${buyer.name} على باقة ${p?.code} — كما كانت`)

await c.end()
console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ مسار الترقية يعمل كما هو مكتوب\n')
process.exit(failures ? 1 : 0)
