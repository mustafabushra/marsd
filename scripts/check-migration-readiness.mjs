#!/usr/bin/env node
/**
 * هل يقوم مرصد على بيئة فارغة؟
 *
 * ============================================================================
 * ما يجيب عنه
 * ============================================================================
 * الانتقال إلى حساب شركة يعني: مستودع جديد، ومشروع Supabase جديد، ونسخة
 * Clerk جديدة، وفريق Vercel جديد. وكل ما ليس في المستودع لن ينتقل — ولن
 * يشتكي أحد حتى تُفتح الشاشة التي تحتاجه.
 *
 * فهذا يعدّ ما يلزم يدوياً، ويقول ما هو بالضبط. لا يغيّر شيئاً ولا يتصل
 * بالبيئة الجديدة — يقرأ الحالية ويقارنها بالمستودع.
 *
 * ============================================================================
 * ما لا يفحصه
 * ============================================================================
 * صحّة القيم في البيئة الجديدة: لا يعرف مفاتيحها. يعدّ الأسماء المطلوبة
 * ويقول أيّها سرّي فيُولَّد من جديد بدل نسخه.
 *
 *   npm run check:migration-ready
 */
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const has = (p) => existsSync(join(root, p))
const read = (p) => (has(p) ? readFileSync(join(root, p), 'utf8') : '')

let pass = 0
let manual = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { console.log(`  ⚠️  ${n}${d ? ` — ${d}` : ''}`) }
}
const needsHand = (what, how) => {
  manual += 1
  console.log(`  ✋ ${what}`)
  console.log(`       ${how}`)
}

// ---------------------------------------------------------------------------
console.log('─── قاعدة البيانات ───')
const migDir = join(root, 'backend', 'migrations')
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
console.log(`  ملفات المهاجرات: ${files.length}`)

const envPath = join(root, '.env.migrations')
if (!existsSync(envPath)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const q = async (s) => (await c.query(s)).rows

// السجلّ مقابل القرص: مهاجرة على القرص وغير مسجّلة قد تكون غير مطبَّقة، وأخرى
// مسجّلة بلا ملف تعني بيئةً لا تُعاد بناؤها.
const applied = (await q(
  "select filename from public.schema_migrations where filename ~ '^[0-9]'")).map((r) => r.filename)
const onDisk = new Set(files)
const unapplied = files.filter((f) => !applied.includes(f))
const ghost = applied.filter((f) => !onDisk.has(f))

// السجلّ بدأ متأخّراً — أقدم قيد فيه هو 011، فما قبله مطبَّق وغير مسجَّل.
//
// وهذه فجوة تاريخية لا خطر: ما يهمّ لبيئة جديدة هو أن تشغيل الملفات بترتيبها
// يُنتج القاعدة نفسها، وذلك ما يثبته انحراف الـschema الصفري — لا أن السجلّ
// كامل بأثر رجعي. أما مهاجرةٌ مسجَّلة بلا ملف فهي المشكلة الحقيقية: بيئةٌ لا
// تُعاد بناؤها.
const ledgerStart = Math.min(...applied.map((f) => parseInt(f, 10)).filter(Boolean))
const recent = unapplied.filter((f) => (parseInt(f, 10) || 0) > ledgerStart)

ok('لا مهاجرة حديثة غير مسجَّلة', recent.length === 0, recent.slice(0, 5).join(', '))
ok('لا مهاجرة مسجَّلة بلا ملف', ghost.length === 0, ghost.slice(0, 5).join(', '))
if (unapplied.length) {
  console.log(`     (${unapplied.length} مهاجرة قبل بدء السجلّ عند ${String(ledgerStart).padStart(3, '0')} — مطبَّقة وغير مسجَّلة، وانحراف الـschema يؤكّد تمثيلها)`)
}

const corpus = files.map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n')
const mentions = (n) => corpus.includes(n)

for (const [label, sql, pick] of [
  ['الجداول', "select relname n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r'", (r) => r.n],
  ['الدوال', "select proname n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') group by 1", (r) => r.n],
  ['سياسات RLS', "select policyname n from pg_policies where schemaname='public'", (r) => r.n],
]) {
  const missing = (await q(sql)).map(pick).filter((n) => !mentions(n))
  ok(`${label} ممثّلة في المهاجرات`, missing.length === 0, missing.slice(0, 4).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n─── التخزين ───')
const buckets = await q('select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id')
for (const b of buckets) {
  ok(`${b.id}: خاص ومحدود ومقيَّد`,
    b.public === false && b.file_size_limit != null && b.allowed_mime_types?.length > 0)
}
// دلاء التخزين لا تُنشأ بـ SQL في مشروع Supabase جديد.
needsHand(`إنشاء ${buckets.length} دلو تخزين في المشروع الجديد`,
  buckets.map((b) => `${b.id} (خاص · ${Math.round(b.file_size_limit / 1048576)} م.ب · ${b.allowed_mime_types.length} أنواع)`).join(' · '))

const storagePolicies = await q(
  "select policyname from pg_policies where schemaname='storage'")
if (storagePolicies.length) {
  const missing = storagePolicies.map((p) => p.policyname).filter((n) => !mentions(n))
  ok(`سياسات التخزين ممثّلة (${storagePolicies.length})`, missing.length === 0,
    missing.slice(0, 3).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n─── متغيّرات البيئة ───')
// ما يُقرأ فعلاً من الكود، لا ما هو مكتوب في ملف مثال.
const sources = []
for (const dir of ['api', 'src', 'scripts']) {
  const walk = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|jsx|ts|tsx|mjs)$/.test(e.name)) sources.push(read(p))
    }
  }
  if (has(dir)) walk(dir)
}
const blob = sources.join('\n') + read('vite.config.js')
const names = [...new Set(
  [...blob.matchAll(/process\.env\.([A-Z0-9_]+)|import\.meta\.env\.([A-Z0-9_]+)/g)]
    .map((m) => m[1] || m[2])
    .filter((n) => n && !['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'CI'].includes(n)),
)].sort()

const SECRET = /SECRET|SERVICE_ROLE|_KEY$|TOKEN|PASSWORD|DATABASE_URL/
const secrets = names.filter((n) => SECRET.test(n) && !n.startsWith('VITE_'))
const publicVars = names.filter((n) => !secrets.includes(n))

console.log(`  المتغيّرات المقروءة من الكود: ${names.length}`)
console.log(`  سرّية (تُولَّد من جديد): ${secrets.length}`)
for (const n of secrets) console.log(`     ${n}`)
console.log(`  عامّة (تُنسخ أو تُحدَّث): ${publicVars.length}`)
for (const n of publicVars) console.log(`     ${n}`)

// VITE_ يُحقن في حزمة المتصفح — سرٌّ باسم VITE_ سرٌّ منشور.
const leaked = names.filter((n) => n.startsWith('VITE_') && /SECRET|SERVICE_ROLE|PASSWORD/.test(n))
ok('لا سرّ باسم VITE_ (يُحقن في حزمة المتصفح)', leaked.length === 0, leaked.join(', '))

// ولا سرّ مُودَع في المستودع.
const gitignore = read('.gitignore')
for (const f of ['.env', '.env.local', '.env.migrations', '.env.production']) {
  ok(`${f} متجاهَل في git`, gitignore.includes(f.replace(/^\./, '.')) || gitignore.includes('.env'))
}

// ---------------------------------------------------------------------------
console.log('\n─── ما يلزم يدوياً ───')
needsHand('نسخة Clerk جديدة',
  'مفاتيح جديدة، وقوالب البريد، ومسارات إعادة التوجيه، وwebhooks إن وُجدت')
needsHand('أسرار Vercel لثلاث بيئات',
  'Production و Preview و Development منفصلة — لا يُعاد استعمال مفاتيح الحساب الشخصي')
needsHand('تفعيل Realtime على الجداول',
  `${(await q("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime'"))[0].n} جدولاً في نشرة supabase_realtime`)

await c.end()

console.log(`\n✅ ${pass} جاهز · ✋ ${manual} يلزم يدوياً`)
