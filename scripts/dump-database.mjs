#!/usr/bin/env node
/**
 * نسخة كاملة من قاعدة البيانات — المخطّط والبيانات معاً.
 *
 * ============================================================================
 * لماذا غلاف وليس أمراً يُكتب بيد
 * ============================================================================
 * ثلاثة أسباب:
 *
 * **كلمة السرّ.** رابط الاتصال يحملها، وتمريره في سطر أوامر يضعها في سجلّ
 * الصدفة وفي قائمة العمليات. هنا تُقرأ من الملفّ وتُمرَّر في بيئة العملية.
 *
 * **الترميز.** `--db-url` يشترط ترميز النسبة المئوية، وكلمة سرّ فيها `@` أو
 * `#` أو `/` تكسر الرابط بصمت — فيبدو الفشل خطأ اتصال لا خطأ ترميز.
 *
 * **المخطّطات.** `pg_dump` الافتراضي يأخذ `public` وحده. وهذا المشروع يضع في
 * `storage` أشياء لا يعمل بدونها: أربعة دلاء (صفوف بيانات لا مخطّط)، وتسع
 * سياسات، وخمسة مشغّلات — منها الذي يمنع بايتات غير مفحوصة من بلوغ التخزين.
 * فنسيان `--schema` يُنتج نسخةً تبدو كاملة وتُعيد بناء نظام بلا بوّابة.
 *
 * ============================================================================
 * ما لا تحويه النسخة
 * ============================================================================
 * **الملفّات نفسها.** الكائنات في S3 لا في القاعدة — النسخة تحوي صفوف
 * `storage.objects` (البيانات الوصفية) ولا تحوي بايتات الملفّات. تنزيلها
 * خطوة منفصلة، ويقولها المخرَج صراحةً.
 *
 *   node scripts/dump-database.mjs
 *   node scripts/dump-database.mjs --env .env.company --out backups/company
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}

const ENV_FILE = arg('--env', '.env.migrations')
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const OUT = join(root, arg('--out', `backups/${STAMP}`))

const BOM = String.fromCharCode(0xFEFF)
const readVar = (file, name) => {
  if (!existsSync(join(root, file))) return null
  const line = readFileSync(join(root, file), 'utf8').split(/\r?\n/)
    .find((l) => l.split(BOM).join('').trim().startsWith(`${name}=`))
  return line ? line.split('=').slice(1).join('=').split(BOM).join('').trim().replace(/^["']|["']$/g, '') : null
}

const raw = readVar(ENV_FILE, 'DATABASE_URL')
if (!raw) { console.error(`\n❌ لا DATABASE_URL في ${ENV_FILE}\n`); process.exit(2) }

/**
 * يُرمّز كلمة السرّ وحدها.
 *
 * `postgresql://user:p@ss#1@host:5432/db` — الـ`@` الأولى داخل كلمة السرّ
 * تجعل المُحلِّل يظنّ أن المضيف هو `ss#1@host`. فتُنتزع كلمة السرّ بموضعها
 * (بين أوّل `:` بعد المستخدم وآخر `@` قبل المضيف) وتُرمَّز وحدها.
 */
function encodeUrl (u) {
  const m = /^(\w+:\/\/)([^:/@]+):(.*)@([^@]+)$/.exec(u)
  if (!m) return u
  const [, proto, user, pass, rest] = m
  const already = /%[0-9A-Fa-f]{2}/.test(pass)
  return `${proto}${user}:${already ? pass : encodeURIComponent(pass)}@${rest}`
}

const url = encodeUrl(raw)
const host = /@([^:/]+)/.exec(raw)?.[1] || 'مجهول'

mkdirSync(OUT, { recursive: true })

console.log(`\n${'═'.repeat(64)}`)
console.log(`المصدر : ${host}`)
console.log(`الوجهة : ${OUT.replace(root, '.')}`)
console.log('═'.repeat(64))

const run = (label, file, extra) => {
  process.stdout.write(`\n${label.padEnd(26)}`)
  const r = spawnSync('npx', [
    'supabase', 'db', 'dump',
    '--db-url', url,
    '--file', join(OUT, file),
    ...extra,
  ], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 600_000 })

  if (r.status !== 0) {
    console.log('❌')
    const out = (r.stderr || r.stdout || 'بلا مخرَج').trim()

    // العطل الأشيع هنا ليس في القاعدة ولا في الرابط: Docker مغلق.
    // ورسالته ثلاثة أسطر متكرّرة عن npipe لا تقول ما يُفعل.
    if (/docker API|docker daemon|dockerDesktop/i.test(out)) {
      console.error('\n   Docker غير مُشغَّل.')
      console.error('   supabase db dump يشغّل pg_dump داخل حاوية، فيحتاجه.')
      console.error('\n   افتح Docker Desktop وانتظر حتى يصير جاهزاً، ثم أعد الأمر.')
      console.error('   وللتحقّق:  docker info\n')
      return null
    }
    if (/password authentication|SASL|authentication failed/i.test(out)) {
      console.error('\n   فشلت المصادقة — راجع كلمة السرّ في ملفّ البيئة.')
      console.error('   وإن كانت فيها محارف خاصّة فالسكربت يُرمّزها، لكن تأكّد أنها منسوخة كاملة.\n')
      return null
    }
    console.error(out.split('\n').slice(-6).join('\n'))
    return null
  }
  const size = existsSync(join(OUT, file)) ? statSync(join(OUT, file)).size : 0
  console.log(`✅ ${(size / 1024).toFixed(0)} ك.ب`)
  return size
}

// المخطّط: public وحده.
//
// إدراج `storage` هنا كان يُخرج المخطّط كلّه — إنشاءه وثمانية جداول وسبع
// عشرة دالّة ومنحاً وملكيات — وكلّها يُنشئها Supabase مع المشروع ويملكها
// `supabase_storage_admin`. فلصقه في محرّر SQL يفشل بـ
// «permission denied for schema storage»، وهو رفضٌ صحيح.
//
// وما يحتاجه مرصد من `storage` — سياساته ومشغّلاته — يُخرجه
// dump-storage-rules.mjs من فهرس القاعدة، فيصير ملفّاً يستطيع دورك تطبيقه.
const a = run('المخطّط (public)', 'schema-public.sql', ['--schema', 'public'])
// البيانات: بـCOPY لا INSERT — أسرع وأمتن على الجداول الكبيرة.
const b = run('البيانات', 'data.sql', ['--schema', 'public,storage', '--data-only', '--use-copy'])
// الأدوار: تُستعمل عند إعادة البناء على خادم آخر.
const c = run('الأدوار', 'roles.sql', ['--role-only'])

if (a === null || b === null) {
  console.error('\n❌ لم تكتمل النسخة.\n')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// تحقّق: هل النسخة تحوي ما ينبغي؟
// ---------------------------------------------------------------------------
const schema = readFileSync(join(OUT, 'schema-public.sql'), 'utf8')
const data = readFileSync(join(OUT, 'data.sql'), 'utf8')

const tables = (schema.match(/^CREATE TABLE /gm) || []).length
const policies = (schema.match(/^CREATE POLICY /gm) || []).length
const funcs = (schema.match(/^CREATE (OR REPLACE )?FUNCTION /gm) || []).length
// الصيغتان معاً: Supabase CLI يمرّ الناتج على
// `sed 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/'` كي يصير قابلاً
// لإعادة التطبيق. فعدُّ الصيغة الأولى وحدها كان يقول «صفر مشغّلات» عن نسخة
// فيها ثلاثة وخمسون — إنذارٌ كاذب يُوهم أن حرّاس البوّابة ضاعوا.
const triggers = (schema.match(/^CREATE (OR REPLACE )?TRIGGER /gm) || []).length
const hasBuckets = /COPY "?storage"?\."?buckets"?/.test(data)
const copies = (data.match(/^COPY /gm) || []).length

console.log(`\n${'─'.repeat(64)}`)
console.log(`الجداول    : ${tables}`)
console.log(`السياسات   : ${policies}`)
console.log(`الدوالّ     : ${funcs}`)
console.log(`المشغّلات   : ${triggers}`)
console.log(`جداول ببيانات: ${copies}`)
console.log(`دلاء التخزين : ${hasBuckets ? '✅ ضمن النسخة' : '⚠️ غير موجودة — راجع --schema'}`)

const warn = []
if (!hasBuckets) warn.push('صفوف storage.buckets مفقودة — الرفع لن يعمل عند الاستعادة')
if (policies < 40) warn.push(`عدد السياسات ${policies} أقلّ من المتوقَّع`)
if (triggers < 20) warn.push(`عدد المشغّلات ${triggers} أقلّ من المتوقَّع`)

if (warn.length) {
  console.log(`\n⚠️  ${warn.length} ملاحظة:`)
  warn.forEach((w) => console.log(`   · ${w}`))
}

console.log(`\n${'═'.repeat(64)}`)
console.log('ما لا تحويه هذه النسخة')
console.log('═'.repeat(64))
console.log(`
  · **بايتات الملفّات** — الكائنات في S3 لا في القاعدة. النسخة تحوي صفوف
    storage.objects (البيانات الوصفية) ولا تحوي الملفّات نفسها.
    لتنزيلها: node scripts/dump-storage.mjs

  · **مستخدمو Clerk** — الهويّات في Clerk لا هنا. جدول users يحمل معرّفاتها
    فقط، وهي بلا معنى في نسخة Clerk أخرى.
`)

console.log('⚠️  هذه النسخة تحوي بيانات إنتاج حقيقية — بريد المستخدمين وبيانات')
console.log('    الشركات. لا تُلتزم في git، ولا تُرسَل في محادثة.')
console.log(`    وbackups/ مُتجاهَل في .gitignore.\n`)
