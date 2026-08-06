#!/usr/bin/env node
/**
 * The annual confirmation, as the trust score actually sees it.
 *
 * The migration proved the bands differ at the moment it ran. This proves they
 * still do, against the live settings — which are editable from the admin
 * screen, so somebody can set a penalty to zero next month and nothing else in
 * the suite would notice.
 *
 * The failure this exists to catch is not a crash. Before 104 the score asked
 * only about `cr_expiry_date`, a column the new commercial registration law
 * stopped filling; every company added under the new law scored as perfectly
 * current no matter how long it had gone unconfirmed. Nothing errored. The
 * number on the screen simply stopped meaning anything.
 *
 *   node scripts/probe-annual-confirmation.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const DB = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
  ?.split('=').slice(1).join('=').trim()

if (!DB) { console.error('  ❌ لا DATABASE_URL'); process.exit(1) }

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const CR = 'PROBE-ANNUAL-CONF'

try {
  // ---- the settings the rule reads ---------------------------------------
  const { rows: [cfg] } = await c.query(`
    select (value -> 'layers' -> 'official' ->> 'confirmation_grace_days')::int         as grace,
           (value -> 'layers' -> 'official' ->> 'confirmation_overdue_penalty')::numeric   as overdue,
           (value -> 'layers' -> 'official' ->> 'confirmation_suspended_penalty')::numeric as suspended,
           (value -> 'layers' -> 'official' ->> 'confirmation_lapsed_penalty')::numeric    as lapsed,
           (value -> 'layers' -> 'official' ->> 'expired_cr_penalty')::numeric             as expired
      from public.system_settings where key = 'trust_score_rules'`)

  console.log(`  الإعدادات: مهلة ${cfg.grace} يوم · متأخر ${cfg.overdue} · موقوف ${cfg.suspended} · منتهٍ ${cfg.lapsed}`)

  check(cfg.grace === 90, 'المهلة 90 يوماً كما ينص النظام', `هي ${cfg.grace}`)
  check(cfg.overdue > 0 && cfg.suspended > cfg.overdue && cfg.lapsed > cfg.suspended,
    'العقوبات متصاعدة', `${cfg.overdue} / ${cfg.suspended} / ${cfg.lapsed}`)
  check(cfg.expired != null, 'قاعدة السجل القديم لم تُحذف')

  // ---- score one company at four points in time --------------------------
  await c.query('delete from public.companies where cr_number = $1', [CR])
  const { rows: [row] } = await c.query(`
    insert into public.companies (name, cr_number, cr_status, source, approved)
    values ('فحص التأكيد السنوي', $1, 'active', 'community', false)
    returning id`, [CR])

  const scoreAt = async (offsetDays) => {
    await c.query(
      `update public.companies
          set annual_confirmation_date = case when $2::int is null then null
                                              else current_date + $2::int end
        where id = $1`, [row.id, offsetDays])
    const { rows: [s] } = await c.query('select public.trust_layer_official($1) as v', [row.id])
    return Number(s.v)
  }

  const none = await scoreAt(null)
  const future = await scoreAt(200)
  const late = await scoreAt(-30)
  const susp = await scoreAt(-180)
  const gone = await scoreAt(-800)

  console.log(`  الدرجات: بلا تاريخ=${none} · مستقبلي=${future} · متأخر 30ي=${late} · موقوف 180ي=${susp} · مهمل 800ي=${gone}`)

  // A company in good standing must not be charged for being in good standing.
  check(future === none, 'تاريخ مستقبلي لا يكلّف شيئاً', `${future} مقابل ${none}`)

  check(late < future, 'التأخر داخل المهلة يخصم')
  check(susp < late, 'تجاوز المهلة يخصم أكثر — السجل يُوقَف عند 90 يوماً')
  check(gone < susp, 'المهمَل سنة بعد الإيقاف يخصم أكثر — معرّض للشطب')

  // The exact step, so an edit that flattens two bands into one is caught.
  check(Math.abs((future - late) - Number(cfg.overdue)) < 0.01,
    'خصم المتأخر يطابق الإعداد', `${future - late} مقابل ${cfg.overdue}`)
  check(Math.abs((future - susp) - Number(cfg.suspended)) < 0.01,
    'خصم الموقوف يطابق الإعداد', `${future - susp} مقابل ${cfg.suspended}`)

  // ---- the boundary ------------------------------------------------------
  // 90 and 91 days must land in different bands, or the grace period is a
  // number in the settings that changes nothing.
  const day90 = await scoreAt(-90)
  const day91 = await scoreAt(-91)
  check(day90 > day91, 'الحد بين المهلة والإيقاف حقيقي عند 90/91 يوماً', `${day90} / ${day91}`)

  // ---- the old rule still works for old records ---------------------------
  await c.query(
    `update public.companies
        set annual_confirmation_date = null, cr_expiry_date = current_date - 10
      where id = $1`, [row.id])
  const { rows: [old] } = await c.query('select public.trust_layer_official($1) as v', [row.id])
  check(Number(old.v) < none, 'انتهاء السجل القديم ما زال يخصم', `${old.v} مقابل ${none}`)

} finally {
  await c.query('delete from public.companies where cr_number = $1', [CR])
  const { rows: [left] } = await c.query(
    'select count(*)::int as n from public.companies where cr_number = $1', [CR])
  if (left.n > 0) { console.log('  ❌ بقي صف فحص'); failed++ }
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل` : '\n  ✅ كل الفحوصات نجحت')
process.exit(failed ? 1 : 0)
