#!/usr/bin/env node
/**
 * Does a company's earned balance actually add to what it may look up?
 *
 * The dashboard showed "💎 43 نقاط متراكمة" and the subscription page showed
 * "بقي 99 من 100", with no stated relationship and no hint that on that plan the
 * 43 did nothing at all. remaining() has always been (ceiling - used) + credits,
 * but the credits half was gated on plans.give_to_get_enabled, true only on the
 * free plan. 095 turned it on everywhere.
 *
 * The arithmetic below is the same expression src/lib/entitlements.js evaluates,
 * fed from my_entitlements — so this checks what a subscriber is actually told,
 * not what a column says.
 *
 * Usage: node scripts/probe-allowance.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}
const q = async (sql, args) => (await c.query(sql, args)).rows
const one = async (sql, args) => (await q(sql, args))[0]

// What the browser computes, transcribed. If these ever disagree the meter is
// lying to somebody.
const UNLIMITED = -1
const remaining = (ceiling, used, credits, giveToGet) =>
  ceiling === UNLIMITED ? Infinity : Math.max(0, ceiling - used) + (giveToGet ? credits : 0)

await c.query('begin')

// The setup below reads system_settings and credits_ledger, both of which RLS
// closes to a session with no claims. Read them as the owner; the per-subscriber
// calls further down switch to `authenticated` with that subscriber's claims,
// which is the only part that must run under RLS.
await c.query('set local role postgres')

console.log('')

// ---- no plan withholds an earned balance ------------------------------------
{
  const off = await q('select code from public.plans where not give_to_get_enabled')
  ok('لا باقة تحجب النقاط', off.length === 0, off.map((p) => p.code).join('، ') || 'لا استثناء')

  const cap = await one(
    "select (value->>'monthly_earn_cap')::int as cap from public.system_settings where key = 'give_to_get_rules'")
  ok('وسقف الكسب الشهري يحدّ ذلك', cap?.cap > 0, `${cap?.cap} نقطة/شهر`)

  const cost = await one(
    "select (value#>>'{spend,search_unlock,points}')::int as p from public.system_settings where key = 'give_to_get_rules'")
  ok('وسعر العملية الإضافية معرّف', cost?.p > 0, `${cost?.p} نقطة`)
}

// ---- a real subscriber, through the resolver the browser uses ---------------
const subs = await q(`
  select u.id as user_id, t.id as tenant_id, t.name,
         coalesce(sum(cl.amount), 0)::int as credits
    from public.users u
    join public.tenants t on t.id = u.tenant_id
    left join public.credits_ledger cl on cl.tenant_id = t.id
   where u.role <> 'platform_admin' and u.status = 'active'
   group by u.id, t.id, t.name`)

let proved = false
for (const s of subs) {
  // As that subscriber's browser sees it.
  await c.query('set local role authenticated')
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: s.user_id, role: 'authenticated' })])
  const { e } = await one('select public.my_entitlements() as e')
  await c.query('set local role postgres')
  if (e?.degraded) continue

  const ceiling = Number(e.limits?.searches_per_month)
  const used = Number(e.usage?.searches_per_month || 0)
  const g2g = !!e.giveToGetEnabled
  const credits = Number(e.credits || 0)

  ok(`${s.name} · باقة ${e.planCode}`, g2g, g2g ? `${credits} نقطة` : 'النقاط محجوبة')

  if (ceiling === UNLIMITED) {
    console.log('     (بلا حد — لا شيء تُضاف إليه)')
    continue
  }

  const total = remaining(ceiling, used, credits, g2g)
  console.log(`     ${ceiling} من الباقة − ${used} مستخدم + ${credits} نقطة = ${total} متاح`)

  // The point of the whole change: with a balance, the total must exceed what
  // the plan alone gives. A tenant with no balance proves nothing either way.
  if (credits > 0) {
    ok('  الرصيد يوسّع المتاح فعلاً', total > Math.max(0, ceiling - used),
       `${Math.max(0, ceiling - used)} → ${total}`)
    proved = true
  }

  // And the balance must never shrink it.
  ok('  ولا يقلّصه أبداً', total >= Math.max(0, ceiling - used))
}

if (!proved) {
  console.log('\n  ⏭  لا مشترك برصيد نقاط — أثر الجمع غير قابل للإثبات على البيانات الحالية')
}

// ---- and the balance is still earned, not conjured ---------------------------
{
  const bad = await q(`
    select reason, count(*)::int as n from public.credits_ledger
     where amount > 0
       and reason not in ('report_approved', 'company_added', 'company_completed',
                          'documents_uploaded', 'admin_adjustment')
     group by reason`)
  ok('كل النقاط الموجبة من مصدر معروف', bad.length === 0,
     bad.map((b) => `${b.reason}×${b.n}`).join('، ') || 'لا شيء')
}

await c.query('rollback')
console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ النقاط تُضاف إلى الحصة على كل الباقات\n')
await c.end()
process.exit(fail ? 1 : 0)
