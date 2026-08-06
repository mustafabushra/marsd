#!/usr/bin/env node
/**
 * What does every RPC say to someone who is not signed in?
 *
 * report_analytics returned analytics across every tenant to an anonymous
 * caller, and platform_health returned the schema's shape — which tables exist,
 * which have RLS, plus counts across the platform. Both were written with a
 * guard in mind. report_analytics had one and it did not fire:
 *
 *   if not is_platform_admin() and not is_reviewer() then return '{}' end if;
 *
 * is_reviewer() returned NULL with no session, because `NULL IN (...)` is NULL,
 * so the condition was `true and NULL` → NULL, and an IF does not fire on NULL.
 * platform_health simply had no guard.
 *
 * Neither was visible by reading. Both took one curl with the key that ships
 * inside the browser bundle. So this calls every function the anon and
 * authenticated roles may execute, with no session at all, and reports anything
 * that answers with data.
 *
 * A function is allowed to answer — my_entitlements has to work for a signed-in
 * user and returns nothing useful without one. What it must not do is return
 * rows about other tenants to nobody.
 *
 * Usage: node scripts/probe-anon-rpc.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l ? l.slice(l.indexOf('=') + 1).trim() : null
}

const ENV = ['.env.production', '.env'].find((f) => {
  try { return !!envFrom(f, 'VITE_SUPABASE_URL') } catch { return false }
})
const URL_BASE = envFrom(ENV, 'VITE_SUPABASE_URL')
const ANON = envFrom(ENV, 'VITE_SUPABASE_ANON_KEY')

const c = new pg.Client({
  connectionString: envFrom('.env.migrations', 'DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Every function a browser can reach.
//
// provolatile matters: 'v' means the function may write. Those are called with
// ids that do not exist, so a missing guard shows up in the reply without the
// probe mutating anything. Anything else gets real ids, because a read function
// handed a random uuid returns nothing and would score as safe when it is not.
const { rows: fns } = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef,
         p.provolatile
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and exists (
       select 1 from information_schema.role_routine_grants g
        where g.specific_name = p.proname || '_' || p.oid
          and g.grantee in ('anon', 'authenticated', 'PUBLIC'))
   order by p.proname`)

// Real ids, so a read function actually has something to disclose.
const one = async (sql) => (await c.query(sql)).rows[0]?.id || null
const REAL = {
  tenant: await one('select id from tenants limit 1'),
  company: await one('select id from companies limit 1'),
  report: await one('select id from reports limit 1'),
  user: await one("select id from users where role = 'platform_admin' limit 1"),
  dispute: await one('select id from disputes limit 1'),
  request: await one('select id from plan_change_requests limit 1'),
}
await c.end()

const NOWHERE = '00000000-0000-0000-0000-000000000000'

if (!fns.length) {
  console.error('\n  ❌ لم يُعثر على أي دالة قابلة للنداء — الفحص لا يرى شيئاً، والنتيجة بلا قيمة\n')
  process.exit(2)
}

console.log(`\n  ${fns.length} دالة قابلة للنداء من المتصفح · تُستدعى بلا أي جلسة\n`)

/**
 * A value for every argument name the platform's functions take.
 *
 * `writes` decides which id is used: a volatile function gets an id that matches
 * nothing, so an absent guard is visible in the reply without this probe
 * changing production data. approve_report_and_award_credits takes a credit
 * amount as a parameter and resolve_dispute settles a dispute — those must be
 * exercised, and must not actually run.
 *
 * A name missing from here is reported as untested rather than counted as safe.
 * That distinction is the whole point: the last three holes came out of the
 * untested pile.
 */
const valueFor = (name, writes) => {
  const id = (real) => (writes ? NOWHERE : real || NOWHERE)
  const map = {
    p_tenant_id: id(REAL.tenant),
    p_company_id: id(REAL.company),
    company_id: id(REAL.company),
    p_target_company_id: id(REAL.company),
    p_reporter_tenant_id: id(REAL.tenant),
    p_report_id: id(REAL.report),
    p_dispute_id: id(REAL.dispute),
    p_request_id: id(REAL.request),
    p_reviewer_id: writes ? NOWHERE : REAL.user,
    p_source_id: id(REAL.report),
    p_source_table: 'reports',
    p_reason: 'report_approved',
    p_action: 'search_unlock',
    p_days: 0,
    p_months: 1,
    p_credit_amount: 0,
    p_upheld: false,
    p_note: 'probe',
    p_key: 'searches_per_month',
    p_status: null,
    p_source: null,
    p_query: 'a',
    search_query: 'a',
    p_limit: 5,
    limit_val: 5,
    p_offset: 0,
    offset_val: 0,
  }
  return name in map ? map[name] : undefined
}

/**
 * Did this answer carry the platform's data, or did it decline?
 *
 * A function is allowed to reply. my_entitlements answers {"reason":"لا توجد
 * جلسة","degraded":true}; get_company_report answers {"status":"locked"}. Those
 * are refusals stated in the response, and counting them as leaks would bury the
 * two real ones — a checker whose output is mostly noise is one people stop
 * reading, which is how the real finding gets missed.
 *
 * So: an object whose only content is a refusal is a refusal.
 */
const REFUSAL_KEYS = ['error', 'reason', 'message', 'degraded', 'insufficient', 'proceed']

const leaks = (body) => {
  if (body == null) return false
  if (Array.isArray(body)) return body.length > 0
  if (typeof body === 'number') return body !== 0
  if (typeof body !== 'object') return !!body

  const keys = Object.keys(body)
  if (!keys.length) return false
  if (body.status === 'locked' || body.degraded === true) return false

  // Every key is either a refusal marker or carries nothing.
  const substantive = keys.filter((k) => {
    if (REFUSAL_KEYS.includes(k)) return false
    const v = body[k]
    return v !== null && v !== false && v !== 0 && v !== ''
  })
  return substantive.length > 0
}

// Extension-owned functions (pg_trgm's similarity, show_limit, …) are not this
// platform's surface and are granted by the extension itself.
const EXTENSION_FNS = new Set([
  'show_limit', 'set_limit', 'show_trgm', 'similarity', 'similarity_dist',
  'similarity_op', 'strict_word_similarity', 'word_similarity',
  'gtrgm_in', 'gtrgm_out', 'unaccent', 'unaccent_init', 'unaccent_lexize',
])

/**
 * Functions whose answer to an anonymous caller is about that caller and nobody
 * else. Listed by name with a reason, not pattern-matched away — an exception
 * you cannot read is how a real leak gets added to the allowlist later.
 */
const SELF_DESCRIBING = {
  // Returns role, tenant and admin flags for whoever asked. To an anonymous
  // caller every one of them is null or false; the only truthy field is
  // jwt_present, which says an apikey was sent — which the caller sent.
  whoami: 'تصف جلسة المُنادي نفسه؛ كلها فارغة بلا هوية',
}

/**
 * Functions that publish to the open web on purpose.
 *
 * Different in kind from SELF_DESCRIBING: these do return other people's data,
 * and are meant to. The exception is therefore narrower — the listed columns are
 * the whole of what may cross, and anything else appearing in the response is
 * treated as a leak even though the function is on this list. An allowlist that
 * excuses a function forever is how a widened function stops being noticed.
 */
const PUBLISHED = {
  public_partners: {
    why: 'قائمة الشركاء على /partners — الظهور فيها إحدى مزايا الشراكة المعلنة (091)',
    columns: ['name', 'sector', 'reports_approved', 'partner_since'],
  },
  public_plans: {
    why: 'قائمة الأسعار على /pricing — سعر معلن لباقة معروضة للبيع (111)',
    columns: ['plans', 'featureLabels'],
    // The data is one level down, and a check that stopped at the top would be
    // approving the word «plans» rather than what is inside it — an allowlist
    // that excuses a function forever, which is the thing this file warns
    // against two comments above.
    inside: {
      plans: ['code', 'name', 'description', 'priceMonthly',
        'isDefault', 'giveToGet', 'limits', 'features'],
    },
  },
}

let leaked = 0
let refused = 0
let skipped = 0

for (const fn of fns) {
  if (fn.proname in SELF_DESCRIBING) {
    refused++
    continue
  }
  if (EXTENSION_FNS.has(fn.proname) || /_op$|_commutator|^gtrgm_|^gin_/.test(fn.proname)) {
    skipped++
    continue
  }
  const writes = fn.provolatile === 'v'
  const argNames = fn.args ? fn.args.split(',').map((a) => a.trim().split(' ')[0]) : []
  const unknown = argNames.filter((a) => a && valueFor(a, writes) === undefined)
  if (unknown.length) {
    console.log(`  ⏭  ${fn.proname}  — لم تُختبر (وسائط مجهولة: ${unknown.join(', ')})`)
    skipped++
    continue
  }

  const body = Object.fromEntries(argNames.filter(Boolean).map((a) => [a, valueFor(a, writes)]))

  let parsed = null
  let status = 0
  try {
    const resp = await fetch(`${URL_BASE}/rest/v1/rpc/${fn.proname}`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    status = resp.status
    parsed = await resp.json().catch(() => null)
  } catch (err) {
    console.log(`  ⏭  ${fn.proname}  — تعذّر النداء: ${err.message}`)
    skipped++
    continue
  }

  // A 4xx is a refusal, which is the correct answer to an anonymous caller.
  if (status >= 400) { refused++; continue }

  const published = PUBLISHED[fn.proname]
  if (published) {
    // Allowed to answer — but only with the columns it was allowed to publish.
    const extra = [...new Set(
      (Array.isArray(parsed) ? parsed : [parsed])
        .filter((r) => r && typeof r === 'object')
        .flatMap((r) => Object.keys(r)))]
      .filter((k) => !published.columns.includes(k))

    // And whatever the declared keys contain, when the payload is nested.
    for (const [key, allowed] of Object.entries(published.inside || {})) {
      const rows = (Array.isArray(parsed) ? parsed : [parsed])
        .flatMap((r) => (Array.isArray(r?.[key]) ? r[key] : []))
      for (const k of new Set(rows.flatMap((r) => Object.keys(r || {})))) {
        if (!allowed.includes(k)) extra.push(`${key}.${k}`)
      }
    }

    if (extra.length) {
      leaked++
      console.log(`  ❌ ${fn.proname}  — تنشر أعمدة خارج المسموح: ${extra.join('، ')}`)
    } else {
      refused++
      console.log(`  ℹ️  ${fn.proname}  — منشورة عمداً · ${published.why}`)
    }
    continue
  }

  if (leaks(parsed)) {
    leaked++
    const preview = JSON.stringify(parsed).slice(0, 110)
    console.log(`  ❌ ${fn.proname}  — أجابت بلا جلسة: ${preview}`)
  } else {
    refused++
  }
}

console.log(`\n  ${refused} صامتة أو مرفوضة · ${leaked} تُسرّب · ${skipped} لم تُختبر\n`)

if (leaked) {
  console.log('  دالة تُجيب مجهولاً بمحتوى هي دالة يجب أن تحمل بوّابة:')
  console.log("  if not coalesce(is_platform_admin() or is_reviewer(), false) then ...\n")
}

process.exit(leaked ? 1 : 0)
