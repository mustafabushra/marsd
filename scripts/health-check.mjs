#!/usr/bin/env node
/**
 * A reading of the system, taken rather than recalled.
 *
 * Every number here is measured at the moment it runs: no counts kept in a file,
 * no list of what was true when somebody last looked. The point is to be able to
 * answer «is this ready» with figures instead of an impression.
 *
 *   node scripts/health-check.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const say = (k, v) => console.log(`  ${k.padEnd(42, '.')} ${v}`)
const head = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p.replace(/\\/g, '/'))
  }
  return out
}

head('الشيفرة')
const src = walk('src')
say('ملفات src', src.length)
say('صفحات', src.filter((f) => f.startsWith('src/pages/')).length)
say('فحوصات (scripts)', readdirSync('scripts').filter((f) => /^(verify|probe|audit)-.*\.mjs$/.test(f)).length)
say('ترحيلات على القرص', readdirSync('backend/migrations').filter((f) => f.endsWith('.sql')).length)

head('الحماية — ما يصل إليه زائر بلا حساب')
const { rows: [views] } = await c.query(`
  select count(*)::int n from pg_class cl
   where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('v','m')
     and coalesce(array_to_string(cl.reloptions, ','), '') !~ 'security_invoker=(true|on)'
     and exists (select 1 from information_schema.role_table_grants g
                  where g.table_schema='public' and g.table_name=cl.relname
                    and g.grantee in ('anon','authenticated'))`)
say('عروض تتجاوز RLS وممنوحة للمتصفّح', views.n === 0 ? '0 ✅' : `${views.n} ⛔`)

const { rows: [rls] } = await c.query(`
  select count(*)::int n from pg_class cl
   where cl.relnamespace='public'::regnamespace and cl.relkind='r'
     and not cl.relrowsecurity
     and exists (select 1 from information_schema.role_table_grants g
                  where g.table_schema='public' and g.table_name=cl.relname
                    and g.grantee in ('anon','authenticated'))`)
say('جداول بلا RLS وممنوحة للمتصفّح', rls.n === 0 ? '0 ✅' : `${rls.n} ⛔`)

const { rows: [defs] } = await c.query(`
  select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.prosecdef and p.proconfig is null`)
say('دوال SECURITY DEFINER بلا search_path', defs.n === 0 ? '0 ✅' : `${defs.n} ⚠️`)

head('البيانات')
for (const [label, sql] of [
  ['كيانات', 'select count(*)::int n from public.tenants'],
  ['شركات في السجل', 'select count(*)::int n from public.companies'],
  ['تقارير معتمدة', "select count(*)::int n from public.reports where status='approved'"],
  ['تقارير قيد المراجعة', "select count(*)::int n from public.reports where status='pending_review'"],
  ['مستخدمون', 'select count(*)::int n from public.users'],
  ['اشتراكات تمنح صلاحيات', `select count(*)::int n from public.subscriptions
     where status='active' and (current_period_end is null or current_period_end > now())`],
  ['شركات لها مؤشر محسوب', 'select count(*)::int n from public.trust_scores'],
]) say(label, (await c.query(sql)).rows[0].n)

head('الإعدادات القابلة للضبط')
const { rows: settings } = await c.query('select key from public.system_settings order by key')
say('مفاتيح الإعدادات', settings.length)
const { rows: plans } = await c.query(
  'select code, active, listed_publicly, is_default from public.plans order by sort_order')
for (const p of plans) {
  say(`  باقة ${p.code}`,
    `${p.active ? 'مفعّلة' : 'موقوفة'}${p.is_default ? ' · افتراضية' : ''}${p.active && !p.listed_publicly ? ' · لا تُباع' : ''}`)
}

head('ما يحتاج انتباهاً')
const notes = []
const { rows: [far] } = await c.query(`select count(*)::int n from public.subscriptions
  where current_period_end > now() + interval '50 years'`)
if (far.n) notes.push(`${far.n} اشتراك بتاريخ غير معقول`)

const { rows: [orphan] } = await c.query(`select count(*)::int n from public.tenants t
  where not exists (select 1 from public.subscriptions s where s.tenant_id = t.id)`)
if (orphan.n) notes.push(`${orphan.n} كيان بلا اشتراك`)

const { rows: [susp] } = await c.query(
  'select count(*)::int n from public.tenants where coalesce(company_add_suspended,false)')
if (susp.n) notes.push(`${susp.n} كيان موقوف عن إضافة الشركات (قرار إداري)`)

const { rows: [stale] } = await c.query(`select count(*)::int n from public.companies
  where coalesce(review_status,'approved') not in ('approved')`)
if (stale.n) notes.push(`${stale.n} شركة في حالة مراجعة`)

const { rows: [noscore] } = await c.query(`select count(*)::int n from public.companies co
  where not exists (select 1 from public.trust_scores t where t.company_id = co.id)`)
if (noscore.n) notes.push(`${noscore.n} شركة بلا مؤشر ثقة محسوب`)

if (notes.length) notes.forEach((n) => say('•', n))
else say('•', 'لا شيء')

await c.end()
console.log('')
