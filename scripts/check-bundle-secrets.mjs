#!/usr/bin/env node
/**
 * هل تسرّب سرٌّ إلى ما يُرسَل للمتصفح؟
 *
 * ============================================================================
 * لماذا يُفحص الناتج لا المصدر
 * ============================================================================
 * Vite يستبدل `import.meta.env.X` بقيمتها نصّاً عند البناء. فسرٌّ يُقرأ بهذا
 * الشكل يصير حرفياً داخل ملف JS يُنزّله كل زائر — والمصدر لا يُظهر ذلك، لأن
 * فيه اسم المتغيّر لا قيمته.
 *
 * فهذا يقرأ dist/ بعد البناء ويبحث عن الأشكال المعروفة للأسرار، وعن قيم
 * المتغيّرات السرّية نفسها كما هي في البيئة المحلية.
 *
 *   npm run check:bundle
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

if (!existsSync(dist)) {
  console.error('❌ dist/ غير موجود — شغّل npm run build أولاً')
  process.exit(2)
}

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

// كل ما يُرسَل: JS و CSS و HTML. خرائط المصدر تُفحص كذلك — تحمل المصدر كاملاً.
const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|mjs|css|html|map)$/.test(e.name)) files.push(p)
  }
}
walk(dist)

const bundle = files.map((f) => readFileSync(f, 'utf8')).join('\n')
const totalMb = (files.reduce((a, f) => a + statSync(f).size, 0) / 1048576).toFixed(1)
console.log(`الحزمة: ${files.length} ملفاً · ${totalMb} م.ب\n`)

// ---------------------------------------------------------------------------
console.log('─── أشكال الأسرار ───')
const PATTERNS = [
  ['مفتاح Clerk السرّي', /\bsk_(test|live)_[A-Za-z0-9]{10,}/],
  ['مفتاح Supabase service_role', /\bservice_role\b[^\n]{0,40}ey[A-Za-z0-9_-]{20,}/],
  ['JWT بدور service_role', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/],
  ['رابط قاعدة بيانات', /postgres(ql)?:\/\/[^\s"']{10,}/],
  ['مفتاح Groq', /\bgsk_[A-Za-z0-9]{20,}/],
  ['مفتاح OpenAI', /\bsk-[A-Za-z0-9]{32,}/],
  ['مفتاح AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['مفتاح خاص PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]
for (const [label, re] of PATTERNS) {
  const hit = bundle.match(re)
  ok(`لا ${label}`, !hit, hit ? `${String(hit[0]).slice(0, 24)}…` : '')
}

// ---------------------------------------------------------------------------
console.log('\n─── قيم المتغيّرات السرّية فعلياً ───')
// تُقرأ من ملفات البيئة المحلية وتُبحث في الحزمة. أدقّ من الأنماط: يمسك سرّاً
// لا يشبه أي شكل معروف.
const envFiles = ['.env', '.env.local', '.env.production', '.env.migrations']
const env = {}
for (const f of envFiles) {
  if (!existsSync(join(root, f))) continue
  for (const l of readFileSync(join(root, f), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}
const SECRET_NAME = /SECRET|SERVICE_ROLE|DATABASE_URL|PASSWORD|_TOKEN$|GROQ|PRIVATE/
const secretVars = Object.entries(env)
  .filter(([k, v]) => SECRET_NAME.test(k) && !k.startsWith('VITE_') && v && v.length >= 12)

console.log(`  متغيّرات سرّية محلية للفحص: ${secretVars.length}`)
for (const [k, v] of secretVars) {
  // يُبحث عن القيمة كاملةً وعن مقطع مميّز منها.
  const leaked = bundle.includes(v) || (v.length > 24 && bundle.includes(v.slice(0, 24)))
  ok(`قيمة ${k} ليست في الحزمة`, !leaked)
}
if (!secretVars.length) console.log('     (لا ملفات بيئة محلية — يُكتفى بفحص الأنماط)')

// ---------------------------------------------------------------------------
console.log('\n─── متغيّرات مكشوفة للعميل بالتصميم ───')
// VITE_ و NEXT_PUBLIC_ يُحقنان في الحزمة عمداً. المهم ألّا يكون بينهما سرّ.
const exposed = [...new Set(
  [...readFileSync(join(root, 'src', 'lib', 'api.ts'), 'utf8')
    .matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]),
)]
const srcAll = []
const walkSrc = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(d, e.name)
    if (e.isDirectory()) walkSrc(p)
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) srcAll.push(readFileSync(p, 'utf8'))
  }
}
walkSrc(join(root, 'src'))
const allExposed = [...new Set(
  [...srcAll.join('\n').matchAll(/import\.meta\.env\.([A-Z0-9_]+)|process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)]
    .map((m) => m[1] || m[2]).filter(Boolean),
)].sort()
void exposed

for (const n of allExposed) console.log(`     ${n}`)
const badlyNamed = allExposed.filter((n) => SECRET_NAME.test(n))
ok('لا متغيّر مكشوف يحمل اسم سرّ', badlyNamed.length === 0, badlyNamed.join(', '))
const nextPublic = allExposed.filter((n) => n.startsWith('NEXT_PUBLIC_'))
ok('لا NEXT_PUBLIC_ يحمل سرّاً',
  nextPublic.every((n) => !SECRET_NAME.test(n)), nextPublic.join(', ') || 'لا يوجد أصلاً')

// ---------------------------------------------------------------------------
console.log('\n─── ملفات لا يجوز نشرها ───')
for (const f of ['.env', '.env.local', '.env.production', '.env.migrations']) {
  ok(`${f} ليس في dist/`, !existsSync(join(dist, f)))
}
const maps = files.filter((f) => f.endsWith('.map'))
console.log(`  خرائط المصدر في dist/: ${maps.length}`)
if (maps.length) {
  console.log('     (تكشف المصدر كاملاً — لا سرّ فيها لكنها تُسهّل قراءة المنطق)')
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
