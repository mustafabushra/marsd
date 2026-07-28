#!/usr/bin/env node
/**
 * Can anyone still mint credits?
 *
 * POST /api/award-credits granted points from `body.action` alone and never
 * checked that the action had happened. Three of the four earn actions had no
 * dedupe index either, so a signed-in user could loop the endpoint and reach the
 * monthly cap having done nothing — and on the free plan, the only plan that
 * earns, credits buy the searches other customers pay for. The endpoint is gone;
 * granting lives in triggers on the three transitions that ARE the events.
 *
 * This exercises the arrangement rather than reading it:
 *
 *   1. an unauthenticated browser cannot write to the ledger
 *   2. a signed-in company cannot write to its own ledger
 *   3. approving a report grants exactly the settings rate, once
 *   4. approving the same thing again grants nothing
 *   5. the monthly ceiling holds
 *   6. spending cannot be raced into an overdraft
 *   7. the granting function is not reachable from a browser
 *
 * Checks 2–7 run inside a transaction that is rolled back, so this is safe
 * against production. Check 1 goes over HTTP and cleans up after itself.
 *
 * Usage: node scripts/probe-credits.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l ? l.slice(l.indexOf('=') + 1).trim() : null
}

const ENV = ['.env.production', '.env'].find((f) => { try { return !!envFrom(f, 'VITE_SUPABASE_URL') } catch { return false } })
const supabase = createClient(envFrom(ENV, 'VITE_SUPABASE_URL'), envFrom(ENV, 'VITE_SUPABASE_ANON_KEY'))
const c = new pg.Client({ connectionString: envFrom('.env.migrations', 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`)
  ok ? pass++ : fail++
}

const asUser = async (userId) => {
  await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)`, [userId])
  await c.query('set local role authenticated')
}
// `set local role postgres` alone does NOT clear request.jwt.claims — they are a
// separate setting, and a SECURITY DEFINER function calling
// get_current_user_id() would still see the last user set. Reset both.
const asOwner = async () => {
  await c.query('set local role postgres')
  await c.query(`select set_config('request.jwt.claims', '', true)`)
}

// ── 1) The anon key, over HTTP ───────────────────────────────────────────────
// No .select(): a returning select is itself subject to RLS and would make a
// row that landed look like one that was refused.
{
  const { rows: [t] } = await c.query('select id from public.tenants limit 1')
  const MARKER = 7777
  const before = await c.query('select count(*)::int n from credits_ledger where amount = $1', [MARKER])
  await supabase.from('credits_ledger').insert([{ tenant_id: t.id, amount: MARKER, reason: 'admin_adjustment' }])
  const after = await c.query('select count(*)::int n from credits_ledger where amount = $1', [MARKER])
  const landed = after.rows[0].n - before.rows[0].n
  check('مجهول لا يستطيع الكتابة في سجلّ النقاط', landed === 0,
    landed ? `${landed} صفّاً وصل فعلاً!` : 'لم يصل شيء')
  if (landed) await c.query('delete from credits_ledger where amount = $1', [MARKER])
}

await c.query('begin')

try {
  await asOwner()

  const { rows: [tenant] } = await c.query(`
    select t.id, t.name
      from tenants t
      join subscriptions s on s.tenant_id = t.id
      join plans pl on pl.id = s.plan_id
     where pl.give_to_get_enabled
     limit 1`)

  if (!tenant) {
    console.log('\n  ⚠ لا كيان على باقة تكسب — لا يمكن اختبار الاقتصاد\n')
    await c.query('rollback'); await c.end()
    process.exit(2)
  }

  const { rows: [member] } = await c.query(
    `select id from users where tenant_id = $1 and status = 'active' limit 1`, [tenant.id])
  const { rows: [admin] } = await c.query(
    `select id from users where role = 'platform_admin' and status = 'active' limit 1`)
  const { rows: [rules] } = await c.query(
    `select value from system_settings where key = 'give_to_get_rules'`)

  const rate = Number(rules.value?.earn?.report_approved?.points) || 0
  const cap = Number(rules.value?.monthly_earn_cap) || 0
  const cost = Number(rules.value?.spend?.search_unlock?.points) || 1

  console.log(`\n  الكيان: ${tenant.name} · اعتماد التقرير ${rate} · سقف الشهر ${cap} · البحث ${cost}\n`)

  const balance = async () => {
    const { rows: [r] } = await c.query(
      'select coalesce(sum(amount),0)::int n from credits_ledger where tenant_id = $1', [tenant.id])
    return r.n
  }

  // ── 2) A signed-in company writing its own ledger ──────────────────────────
  await asUser(member.id)
  let refused = false
  await c.query('savepoint s1')
  try {
    await c.query(
      `insert into credits_ledger (tenant_id, user_id, amount, reason) values ($1,$2,999,'report_approved')`,
      [tenant.id, member.id])
    await c.query('release savepoint s1')
  } catch {
    refused = true
    await c.query('rollback to savepoint s1')
  }
  check('الشركة لا تكتب في سجلّ نقاطها', refused, refused ? 'مرفوضة' : 'كتبت 999 نقطة لنفسها!')

  // ── 3) A real approval ─────────────────────────────────────────────────────
  await asOwner()
  const before = await balance()

  const { rows: [report] } = await c.query(`
    insert into reports (reporter_tenant_id, target_company_id, status, category,
                         payment_commitment, dealt_at)
    select $1, c.id, 'pending_review',
           (select category from reports where category is not null limit 1), 'full', now()
      from companies c where c.approved limit 1
    returning id`, [tenant.id])

  // reports records no reviewer column; who reviewed it lives in
  // report_audit_log. 049 read new.reviewed_by here and would have raised 42703
  // on every approval — a plpgsql trigger body is resolved when it fires, not
  // when it is created, so the migration reported success. 051 fixed it.
  await c.query(`update reports set status = 'approved' where id = $1`, [report.id])
  const afterFirst = await balance()
  check('اعتماد التقرير يمنح بسعر الإعدادات', afterFirst - before === rate,
    `${afterFirst - before} نقطة (متوقّع ${rate})`)

  // ── 4) The same approval again ─────────────────────────────────────────────
  await c.query(`update reports set status = 'pending_review' where id = $1`, [report.id])
  await c.query(`update reports set status = 'approved' where id = $1`, [report.id])
  check('إعادة الاعتماد لا تمنح ثانيةً', (await balance()) === afterFirst,
    `${(await balance()) - afterFirst} نقطة إضافية`)

  // ── 5) The monthly ceiling ─────────────────────────────────────────────────
  if (cap > 0) {
    await c.query(
      `insert into credits_ledger (tenant_id, amount, reason, source_table, source_id)
       values ($1, $2, 'report_approved', 'probe', gen_random_uuid())`, [tenant.id, cap])
    const { rows: [g] } = await c.query(
      `select public.grant_credits($1,'report_approved','probe',gen_random_uuid(),null) g`, [tenant.id])
    check('السقف الشهري يوقف المنح', Number(g.g) === 0, `مُنحت ${g.g} نقطة فوق السقف`)
    await c.query(`delete from credits_ledger where source_table = 'probe' and tenant_id = $1`, [tenant.id])
  }

  // ── 6) Spending ────────────────────────────────────────────────────────────
  // Leave exactly one purchase in the balance.
  const now = await balance()
  if (now !== cost) {
    await c.query(`insert into credits_ledger (tenant_id, amount, reason) values ($1,$2,'admin_adjustment')`,
      [tenant.id, cost - now])
  }

  await asUser(member.id)
  const { rows: [first] } = await c.query(`select public.spend_credits('search_unlock') r`)
  const { rows: [second] } = await c.query(`select public.spend_credits('search_unlock') r`)
  await asOwner()

  check('الخصم الأول ينجح', Number(first.r.spent) === cost, JSON.stringify(first.r))
  check('الخصم الثاني يُرفض لعدم الكفاية',
    Number(second.r.spent) === 0 && second.r.insufficient === true, JSON.stringify(second.r))
  const end = await balance()
  check('الرصيد لا يصبح سالباً', end >= 0, `الرصيد ${end}`)

  // ── 7) The granting function is not the browser's to call ──────────────────
  const { rows: [grants] } = await c.query(`
    select count(*)::int n from information_schema.role_routine_grants
     where routine_name = 'grant_credits' and grantee in ('authenticated','anon','PUBLIC')`)
  check('المنح غير قابل للنداء من المتصفح', grants.n === 0,
    grants.n ? `${grants.n} صلاحية تنفيذ ممنوحة` : 'لا صلاحية تنفيذ')
} finally {
  await c.query('rollback')
  await c.end()
}

console.log(`\n  ${pass} نجح · ${fail} فشل\n`)
process.exit(fail ? 1 : 0)
