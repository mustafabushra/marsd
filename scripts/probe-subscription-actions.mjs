#!/usr/bin/env node
/**
 * Does /admin/subscriptions actually control anything?
 *
 * Since migration 110 a company cannot set its own plan, so this screen is where
 * every subscription in the product changes. Everything it can do is checked
 * here, as a real platform admin, under real JWT claims, inside a transaction
 * that is rolled back.
 *
 * What was wrong before, and is asserted against now:
 *   - «إلغاء» wrote `canceled`; the CHECK accepts `cancelled`. Every click
 *     failed with a raw Postgres error, on the only screen that offers it.
 *   - the badge said «نشط» for a row whose period had run out, while
 *     my_entitlements — which decides what the company may do — treats exactly
 *     that row as granting nothing.
 *   - nothing recorded why a subscription changed.
 *   - a term could be set to any year at all; two rows end in 2126.
 *   - a tenant with no subscription row was invisible and, after 110, stuck.
 *
 *   node scripts/probe-subscription-actions.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const ok = (good, name, detail = '') => {
  console.log(`  ${good ? '✅' : '❌'} ${name}${detail ? ` · ${detail}` : ''}`)
  if (!good) failed++
}
const one = async (sql, p = []) => (await c.query(sql, p)).rows[0]
const claims = (id) => c.query('select set_config($1,$2,true)',
  ['request.jwt.claims', JSON.stringify({ sub: id, role: 'authenticated' })])
// Six arguments since 113: the sixth says «no expiry» explicitly, which is what
// replaced migration 011's invented century.
const call = async (args) =>
  (await one('select public.admin_set_subscription($1,$2,$3,$4,$5,$6) as r',
    [...args, args[5] ?? false].slice(0, 6))).r

const admin = await one("select id from public.users where role = 'platform_admin' limit 1")
const member = await one(`select id, tenant_id from public.users
  where role in ('company_admin','company_member') and tenant_id is not null limit 1`)
const sub = await one('select id, tenant_id, plan_id from public.subscriptions limit 1')
// A plan that is not the one already on this subscription. Taking the first
// active plan gave the same one, and the "changing the plan" check below then
// skipped itself and said nothing — a check that passes by not running.
const otherPlan = await one(
  'select id, name from public.plans where active and id <> $1 order by sort_order limit 1',
  [sub?.plan_id ?? '00000000-0000-0000-0000-000000000000'])

if (!admin || !sub) { console.log('  ⚠️  لا مسؤول أو لا اشتراك — لا يمكن الفحص'); process.exit(0) }
console.log(`\n  المسؤول: ${admin.id}\n  الاشتراك: ${sub.id}\n`)

await c.query('begin')
try {
  await c.query('set local role authenticated')

  // ---- an ordinary company is nowhere near any of this ---------------------
  if (member) {
    await claims(member.id)
    const seen = await one('select count(*)::int n from public.admin_subscription_overview()')
    ok(seen.n === 0, 'شركة عادية لا ترى لوحة الاشتراكات', `${seen.n} صف`)
    const r = await call([sub.id, 'محاولة', null, 'cancelled', null])
    ok(r?.ok === false, 'ولا تغيّر اشتراكاً', r?.reason || '⛔ نجحت')
  }

  await claims(admin.id)

  // ---- the overview answers, and includes tenants with no subscription -----
  const all = await one('select count(*)::int n from public.admin_subscription_overview()')
  const tenants = await one('select count(*)::int n from public.tenants')
  ok(all.n === tenants.n, 'اللوحة تعرض كل كيان، حتى الذي بلا اشتراك',
    `${all.n} من ${tenants.n}`)

  // ---- a reason is not optional -------------------------------------------
  ok((await call([sub.id, '  ', null, 'active', null]))?.ok === false,
    'لا تغيير بلا سبب')
  ok((await call([sub.id, 'ok', null, 'active', null]))?.ok === false,
    'ولا بسبب من حرفين')

  // ---- the 2126 guard ------------------------------------------------------
  const far = await call([sub.id, 'فحص', null, null,
    new Date(Date.now() + 100 * 365 * 86400000).toISOString()])
  ok(far?.ok === false, 'تاريخ بعد مئة سنة مرفوض', far?.reason)

  const back = await call([sub.id, 'فحص', null, null,
    new Date(Date.now() - 86400000).toISOString()])
  ok(back?.ok === false, 'وتاريخ في الماضي مرفوض', back?.reason)

  // ---- an unknown status is refused ---------------------------------------
  ok((await call([sub.id, 'فحص', null, 'past_due', null]))?.ok === false,
    'وحالة لا يقبلها العمود مرفوضة')

  // ---- renewing works, and is recorded with its reason --------------------
  const end = new Date(); end.setMonth(end.getMonth() + 6)
  const renewed = await call([sub.id, 'تجديد بعد سداد', null, 'active', end.toISOString()])
  ok(renewed?.ok === true && renewed?.isLive === true, 'التجديد لمدة مختارة يعمل',
    renewed?.reason || `حتى ${String(renewed?.periodEnd).slice(0, 10)}`)

  const logged = await one(`select meta ->> 'reason' as why from public.audit_logs
     where entity_id = $1 and action = 'subscription_changed'
     order by created_at desc limit 1`, [sub.id])
  ok(logged?.why === 'تجديد بعد سداد', 'والسبب محفوظ في السجل', logged?.why)

  // ---- cancelling, with the spelling the screen uses ----------------------
  const spelling = /const CANCELLED = '([a-z_]+)'/
    .exec(readFileSync('src/pages/AdminSubscriptions.jsx', 'utf8'))?.[1]
  ok(!!spelling, 'قيمة الإلغاء مقروءة من الشاشة نفسها', spelling)
  const cancelled = await call([sub.id, 'طلبت الشركة الإيقاف', null, spelling, null])
  ok(cancelled?.ok === true, 'زر الإلغاء يكتب قيمة يقبلها العمود', cancelled?.reason || '')

  if (member && member.tenant_id === sub.tenant_id) {
    await claims(member.id)
    const ent = await one('select public.my_entitlements() as e')
    const def = await one('select code from public.plans where is_default limit 1')
    ok(ent.e?.planCode === def.code || ent.e?.degraded,
      'والإلغاء يوقف المزايا فوراً', `صار: ${ent.e?.planCode}`)
    await claims(admin.id)
  }

  // ---- no expiry is sayable, and is an absence -----------------------------
  // Migration 011 wrote `now() + interval '100 years'` because the column was
  // NOT NULL, and the renew button then added thirty days to it — which is the
  // whole story behind «24/08/2126 ⚠️ تاريخ غير معقول». 113 made the column
  // nullable and deleted the invented dates.
  const forever = await call([sub.id, 'باقة مجانية دائمة', null, 'active', null, true])
  ok(forever?.ok === true && forever?.periodEnd === null && forever?.isLive === true,
    'يمكن ضبط اشتراك بلا تاريخ انتهاء', JSON.stringify(forever?.periodEnd))

  ok((await call([sub.id, 'فحص', null, null, new Date(Date.now() + 30 * 86400000).toISOString(), true]))?.ok === false,
    'ولا يُقبل «بلا انتهاء» مع تاريخ معاً')

  const far2 = await one(`select count(*)::int n from public.subscriptions
     where current_period_end > now() + interval '50 years'`)
  ok(far2.n === 0, 'ولا بقي تاريخ بعد خمسين سنة في القاعدة', `${far2.n}`)

  // ---- changing the plan ---------------------------------------------------
  if (otherPlan && otherPlan.id !== sub.plan_id) {
    const moved = await call([sub.id, 'ترقية معتمدة', otherPlan.id, 'active', null])
    ok(moved?.ok === true && moved?.planId === otherPlan.id,
      'وتغيير الباقة يعمل', otherPlan.name)
  }

  // ---- a tenant with no subscription can be given one ---------------------
  // Made here: every real tenant has one, so looking for a candidate would skip
  // the check and pass without testing it.
  await c.query('reset role')
  const stamp = Date.now()
  const fresh = await one(`insert into public.tenants (name, cr_number, email)
     values ('كيان فحص الاشتراك', $1, $2) returning id`,
  [`99${String(stamp).slice(-8)}`, `probe.${stamp}@example.test`])
  await c.query('set local role authenticated')
  await claims(admin.id)

  const seen = await one(
    'select count(*)::int n from public.admin_subscription_overview() where tenant_id = $1',
    [fresh.id])
  ok(seen.n === 1, 'الكيان بلا اشتراك يظهر في اللوحة')

  const def = await one('select id from public.plans where is_default limit 1')
  const bad = await one('select public.admin_create_subscription($1,$2,$3,$4) as r',
    [fresh.id, def.id, 1, ' '])
  ok(bad.r?.ok === false, 'وإنشاؤه يحتاج سبباً')

  const made = await one('select public.admin_create_subscription($1,$2,$3,$4) as r',
    [fresh.id, def.id, 1, 'كيان بلا اشتراك بعد الترحيل'])
  ok(made.r?.ok === true, 'ثم يُنشأ من اللوحة', made.r?.reason || '')

  const twice = await one('select public.admin_create_subscription($1,$2,$3,$4) as r',
    [fresh.id, def.id, 1, 'مرة ثانية'])
  ok(twice.r?.ok === false, 'ولا يُنشأ مرتين', twice.r?.reason)
} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
