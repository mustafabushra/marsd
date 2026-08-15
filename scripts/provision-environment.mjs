#!/usr/bin/env node
/**
 * تركيب بيئة مرصد من الصفر على قاعدة جديدة.
 *
 * ============================================================================
 * لماذا سكربت لا «شغّل المهاجرات بالترتيب»
 * ============================================================================
 * ١٨٧ مهاجرة تُشغَّل بيد واحدةً واحدة تعني ١٨٧ فرصة لتخطّي واحدة أو عكس
 * اثنتين. والخطأ لا يظهر عند التشغيل — يظهر بعد أسبوع في شاشة لا تعمل.
 *
 * ============================================================================
 * وحارسٌ ضدّ أسوأ ما قد يحدث
 * ============================================================================
 * أسوأ نتيجة ممكنة هنا ليست فشل التركيب — بل نجاحه **على قاعدة الإنتاج**.
 * ملفّ بيئة يُمرَّر خطأً، أو نسخة سطر، ويُعاد تركيب مخطّط فوق بيانات حيّة.
 *
 * فالسكربت يرفض العمل على قاعدة فيها بيانات مستخدمين ما لم يُمرَّر `--force`،
 * ويطبع دائماً **إلى أين** يتحدّث قبل أن يكتب حرفاً.
 *
 *   node scripts/provision-environment.mjs --env .env.company
 *   node scripts/provision-environment.mjs --env .env.company --dry
 */
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, dflt = null) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const has = (name) => argv.includes(name)

const ENV_FILE = arg('--env', '.env.migrations')
const DRY = has('--dry')
const FORCE = has('--force')

const BOM = String.fromCharCode(0xFEFF)
const readVar = (file, name) => {
  if (!existsSync(join(root, file))) return null
  const txt = readFileSync(join(root, file), 'utf8')
  const line = txt.split(/\r?\n/).find((l) => l.split(BOM).join('').trim().startsWith(`${name}=`))
  if (!line) return null
  return line.split('=').slice(1).join('=').split(BOM).join('').trim().replace(/^["']|["']$/g, '')
}

const url = readVar(ENV_FILE, 'DATABASE_URL')
if (!url) {
  console.error(`\n❌ لا DATABASE_URL في ${ENV_FILE}\n`)
  console.error('   أنشئ الملفّ بسطر واحد:')
  console.error('   DATABASE_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres\n')
  console.error('   والصقه في محرّر — لا بـ echo ولا Out-File، فهما يضيفان بادئة خفيّة.\n')
  process.exit(2)
}

// يُطبع المضيف لا كلمة السرّ: من يقرأ المخرَج يجب أن يرى **أين** يعمل.
const host = /@([^:/]+)/.exec(url)?.[1] || 'مجهول'
const ref = /db\.([a-z0-9]{20})\./.exec(url)?.[1] || null

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 180_000,
})

console.log(`\n${'═'.repeat(64)}`)
console.log(`الوجهة : ${host}`)
if (ref) console.log(`المشروع: ${ref}`)
console.log(`الملفّ  : ${ENV_FILE}`)
console.log(`الوضع  : ${DRY ? 'تجربة — لا يُكتب شيء' : 'تركيب فعلي'}`)
console.log('═'.repeat(64))

await client.connect()

// ---------------------------------------------------------------------------
// حارس: أهذه قاعدة نظيفة؟
// ---------------------------------------------------------------------------
const tableExists = async (t) => (await client.query(
  'select to_regclass($1) r', [`public.${t}`])).rows[0].r !== null

let users = 0
let companies = 0
if (await tableExists('users')) {
  users = Number((await client.query('select count(*) n from public.users')).rows[0].n)
}
if (await tableExists('companies')) {
  companies = Number((await client.query('select count(*) n from public.companies')).rows[0].n)
}

const applied = await tableExists('schema_migrations')
  ? new Set((await client.query('select filename from public.schema_migrations')).rows.map((r) => r.filename))
  : new Set()

console.log(`\nحالة الوجهة: ${users} مستخدماً · ${companies} شركة · ${applied.size} مهاجرة مطبَّقة`)

if ((users > 0 || companies > 0) && !FORCE) {
  console.error(`\n❌ الوجهة فيها بيانات — لن يُركَّب شيء.`)
  console.error('   هذا السكربت للقواعد النظيفة. وإن كنت متأكّداً أنها الوجهة الصحيحة')
  console.error('   وتريد إكمال المهاجرات الناقصة عليها، أضف --force.\n')
  await client.end()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// المهاجرات بالترتيب الرقمي
// ---------------------------------------------------------------------------
const dir = join(root, 'backend', 'migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    // الترتيب رقمي لا أبجدي: أبجدياً يأتي 100 قبل 99.
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.localeCompare(b)
  })

const pending = files.filter((f) => !applied.has(f))
console.log(`\nالمهاجرات: ${files.length} في المستودع · ${pending.length} تنتظر التطبيق`)

if (!pending.length) {
  console.log('\n✅ لا شيء ينتظر — الوجهة محدَّثة.\n')
  await client.end()
  process.exit(0)
}

if (DRY) {
  console.log('\nستُطبَّق بهذا الترتيب:')
  for (const f of pending.slice(0, 12)) console.log(`   ${f}`)
  if (pending.length > 12) console.log(`   … و${pending.length - 12} غيرها`)
  console.log('\n(تجربة — لم يُكتب شيء)\n')
  await client.end()
  process.exit(0)
}

await client.query(`
  create table if not exists public.schema_migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now(),
    checksum    text)`)

let ok = 0
const failures = []

for (const f of pending) {
  const sql = readFileSync(join(dir, f), 'utf8')
  process.stdout.write(`   ${f.slice(0, 52).padEnd(54)}`)
  await client.query('begin')
  try {
    await client.query(sql)
    await client.query(
      `insert into public.schema_migrations (filename, checksum) values ($1, $2)
       on conflict (filename) do update set applied_at = now(), checksum = excluded.checksum`,
      [f, String(sql.length)])
    await client.query('commit')
    ok += 1
    console.log('✅')
  } catch (err) {
    await client.query('rollback')
    console.log('❌')
    failures.push({ file: f, message: err.message, hint: err.hint, position: err.position })
    // يُتوقَّف عند أول فشل: المهاجرات متتابعة، وما بعد الفاشلة يفشل غالباً
    // بأخطاء مشتّتة تُخفي السبب الأصلي.
    break
  }
}

// ---------------------------------------------------------------------------
// ما تحتاجه القاعدة النظيفة ولا تُنشئه مهاجرة
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(64)}`)
console.log(`طُبّقت ${ok} من ${pending.length}`)

if (failures.length) {
  console.error('\n❌ توقّف التركيب:')
  for (const f of failures) {
    console.error(`   ${f.file}`)
    console.error(`   ${f.message}`)
    if (f.hint) console.error(`   تلميح: ${f.hint}`)
  }
  console.error('')
  await client.end()
  process.exit(1)
}

const buckets = (await client.query('select id from storage.buckets order by id')).rows.map((r) => r.id)
const admins = Number((await client.query(
  "select count(*) n from public.users where role = 'platform_admin'")).rows[0].n)
const perms = Number((await client.query('select count(*) n from public.role_permissions')).rows[0].n)
const settings = Number((await client.query('select count(*) n from public.system_settings')).rows[0].n)

console.log(`\nالدلاء      : ${buckets.join(' · ') || 'لا شيء'}`)
console.log(`الصلاحيات   : ${perms} قيداً`)
console.log(`الإعدادات   : ${settings} مفتاحاً`)
console.log(`مسؤولو منصّة: ${admins}`)

if (admins === 0) {
  console.log(`\n${'═'.repeat(64)}`)
  console.log('⚠️  خطوة يدوية باقية — بدونها لا يستطيع أحد إدارة المنصّة')
  console.log('═'.repeat(64))
  console.log(`
كل تسجيل جديد يُنتج دور company_member، ولا مهاجرة تُنشئ مسؤول منصّة. فحتى
تُنفَّذ هذه الخطوة لن يستطيع أحد اعتماد شركة، ولا تدقيق مستند، ولا فتح لوحة
الإدارة.

  ١) سجّل دخولك في التطبيق بحساب Clerk الجديد — يُنشأ لك صفّ في users
  ٢) ثم نفّذ:

     node scripts/bootstrap-admin.mjs --env ${ENV_FILE} --email you@company.com
`)
}

console.log(`\n✅ التركيب اكتمل. التالي: تحقّق بالمجموعات — npm run check:all\n`)
await client.end()
