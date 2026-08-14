#!/usr/bin/env node
/**
 * هل تستطيع المهاجرات إعادة بناء القاعدة من الصفر؟
 *
 * ============================================================================
 * السؤال الذي يجيب عنه
 * ============================================================================
 * مشروع ينتقل إلى حساب شركة يُعاد بناء قاعدته من ملفات المهاجرات وحدها. فأي
 * كائن أُنشئ يدوياً — في لوحة Supabase أو باستعلام عابر — لن يوجد في البيئة
 * الجديدة، ولن يشتكي أحد حتى تُفتح الشاشة التي تحتاجه.
 *
 * فهذا يقارن ما في القاعدة الحيّة بما تذكره ملفات backend/migrations:
 * الجداول، والدوال، والمشغّلات، والامتدادات، وسياسات RLS، والفهارس غير
 * الضمنية.
 *
 * ============================================================================
 * ما لا يفعله
 * ============================================================================
 * ليس مقارنة بنيوية كاملة — لا يفحص أنواع الأعمدة ولا القيود بالتفصيل. يفحص
 * الوجود: هل يذكر أي ملف مهاجرة إنشاء هذا الكائن. وهذا يمسك الصنف الأخطر من
 * الانحراف — كائن موجود في الإنتاج ولا أثر له في المستودع.
 *
 *   npm run check:schema-drift
 */
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIG_DIR = join(root, 'backend', 'migrations')

const envPath = join(root, '.env.migrations')
if (!existsSync(envPath)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
if (!line) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

// كل نصوص المهاجرات في سلسلة واحدة. البحث بالاسم يكفي: اسم دالة لا يظهر في
// أي ملف يعني أنها لم تُنشأ من مهاجرة.
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'))
const corpus = files.map((f) => readFileSync(join(MIG_DIR, f), 'utf8')).join('\n')
const mentions = (name) => corpus.includes(name)

const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
const q = async (sql) => (await c.query(sql)).rows

await c.connect()
console.log(`ملفات المهاجرات: ${files.length}\n`)

const report = []
let missing = 0

const section = async (label, sql, pick) => {
  const rows = await q(sql)
  const gone = rows.map(pick).filter((n) => !mentions(n))
  missing += gone.length
  console.log(`${gone.length ? '❌' : '✅'} ${label.padEnd(26)} ${rows.length} في القاعدة · ${gone.length} بلا مهاجرة`)
  if (gone.length) report.push([label, gone])
  return gone
}

await section('الجداول', `
  select c.relname n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r'
   order by 1`, (r) => r.n)

await section('الدوال', `
  select p.proname n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.prokind = 'f'
     and not exists (select 1 from pg_depend d
                      where d.objid = p.oid and d.deptype = 'e')
   group by 1 order by 1`, (r) => r.n)

await section('المشغّلات', `
  select distinct t.tgname n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and not t.tgisinternal
   order by 1`, (r) => r.n)

await section('سياسات RLS', `
  select policyname n from pg_policies where schemaname = 'public' order by 1`,
(r) => r.n)

await section('الفهارس غير الضمنية', `
  select i.indexname n from pg_indexes i
   where i.schemaname = 'public'
     and not exists (select 1 from pg_constraint con
                      where con.conname = i.indexname)
   order by 1`, (r) => r.n)

await section('الامتدادات', `
  select extname n from pg_extension
   where extname not in ('plpgsql')
   order by 1`, (r) => r.n)

// دلاء التخزين لا تُنشأ بـ SQL عادةً، لكن غيابها من المهاجرات يعني إعداداً
// يدوياً في البيئة الجديدة — يُذكر ولا يُعدّ انحرافاً.
const buckets = await q("select id from storage.buckets order by 1").catch(() => [])
if (buckets.length) {
  const undocumented = buckets.map((b) => b.id).filter((b) => !mentions(b))
  console.log(`${undocumented.length ? 'ℹ️ ' : '✅'} دلاء التخزين${' '.repeat(16)}${buckets.length} في القاعدة · ${undocumented.length} بلا ذكر`)
  if (undocumented.length) console.log(`     ${undocumented.join(', ')}`)
}

await c.end()

if (report.length) {
  console.log('\n─── تفصيل ما لا تذكره المهاجرات ───')
  for (const [label, names] of report) {
    console.log(`\n  ${label} (${names.length}):`)
    for (const n of names) console.log(`    · ${n}`)
  }
}

console.log(`\n${missing ? '❌' : '✅'} ${missing} كائناً لا تذكره أي مهاجرة`)
process.exit(missing ? 1 : 0)
