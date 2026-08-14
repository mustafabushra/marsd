#!/usr/bin/env node
/**
 * ترويسات الأمان، وحدّ المعدّل، وما تفعله كل دالة قبل أن تعمل.
 *
 * فحص ثابت للملفات + فحص حيّ لحدّ المعدّل في القاعدة. لا يستدعي الدوال نفسها
 * — تشغيلها يحتاج مفاتيح إنتاج وبيئة Vercel — بل يتحقّق أن كلاً منها يفعل ما
 * لا يجوز إغفاله: يرفض الطريقة الخطأ، ويتحقّق من الهوية، ولا يفتح CORS
 * للجميع.
 *
 *   npm run check:api
 */
import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('─── ترويسات الأمان ───')
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const all = (vercel.headers || []).find((h) => h.source === '/(.*)')
ok('قاعدة ترويسات تشمل كل المسارات', !!all)

const H = Object.fromEntries((all?.headers || []).map((h) => [h.key, h.value]))
const need = {
  'X-Frame-Options': /DENY|SAMEORIGIN/i,
  'X-Content-Type-Options': /nosniff/i,
  'Referrer-Policy': /strict-origin|no-referrer/i,
  'Strict-Transport-Security': /max-age=\d{7,}/,
  'Content-Security-Policy': /frame-ancestors/i,
  'Permissions-Policy': /camera=\(\)/,
  'Cross-Origin-Opener-Policy': /same-origin/,
}
for (const [k, re] of Object.entries(need)) {
  ok(`  ${k}`, H[k] && re.test(H[k]), H[k] ? `القيمة ${H[k].slice(0, 40)}` : 'مفقودة')
}
// CSP بلا هذين تسمح بحقن نصّ برمجي عبر <base> أو إرسال نموذج إلى الخارج.
ok('  CSP يقيّد base-uri', /base-uri/.test(H['Content-Security-Policy'] || ''))
ok('  CSP يقيّد form-action', /form-action/.test(H['Content-Security-Policy'] || ''))
ok('  CSP يمنع object-src', /object-src/.test(H['Content-Security-Policy'] || ''))

// ---------------------------------------------------------------------------
console.log('\n─── دوال الـAPI ───')
const apiDir = join(root, 'api')
const fns = readdirSync(apiDir).filter((f) => f.endsWith('.js'))
for (const f of fns) {
  const src = readFileSync(join(apiDir, f), 'utf8')
  const name = f.replace(/\.js$/, '')
  ok(`${name}: يرفض الطريقة الخطأ`, /req\.method\s*!==/.test(src))
  ok(`  يتحقّق من الهوية`, /verifyToken|SERVICE|service_role/.test(src))
  // CORS مفتوح للجميع يبطل حماية same-origin ويسمح لأي موقع باستدعاء الدالة
  // بجلسة الزائر.
  ok(`  لا CORS مفتوح`, !/Access-Control-Allow-Origin['"\s:]+\*/.test(src))
  // مفتاح يُطبع في ردّ أو سجلّ يخرج من الخادم.
  ok(`  لا يطبع سرّاً`,
    !/(console\.\w+|res\.\w+)\([^)]*\b(SERVICE|CLERK_SECRET|SERVICE_ROLE|GROQ_KEY)\b/.test(src))
}

// ---------------------------------------------------------------------------
console.log('\n─── حدّ المعدّل ───')
const limited = ['invite-user.js', 'trust-report-pdf.js']
for (const f of limited) {
  const src = readFileSync(join(apiDir, f), 'utf8')
  ok(`${f.replace(/\.js$/, '')} محدود المعدّل`, /limitOrReject|rateLimit/.test(src))
}
ok('extract-document محدود بحصّة',
  /claim_document_read/.test(readFileSync(join(apiDir, 'extract-document.js'), 'utf8')))

const envPath = join(root, '.env.migrations')
if (!existsSync(envPath)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query('BEGIN')

const actor = `check-${Date.now()}`
const call = async (n = 1) => {
  let last
  for (let i = 0; i < n; i += 1) {
    last = (await c.query('select public.api_rate_limit($1,$2,$3,$4) v',
      [actor, 'probe', 3, '1 hour'])).rows[0].v
  }
  return last
}
ok('يسمح حتى الحدّ', (await call(3)).allowed === true)
const blocked = await call(1)
ok('يمنع بعده', blocked.allowed === false)
ok('  ويُرجع مهلة إعادة المحاولة', blocked.retry_after_seconds > 0)

// معزول: عدّاد فاعل لا يستهلك عدّاد غيره.
const other = (await c.query('select public.api_rate_limit($1,$2,$3,$4) v',
  [`${actor}-b`, 'probe', 3, '1 hour'])).rows[0].v
ok('  الفاعلون معزولون', other.allowed === true)

// والدالة نفسها محجوبة عن المستخدم — من يستدعي عدّاده يستنفده لغيره.
// نقطة حفظ: الرفض المتوقَّع يُجهض المعاملة، فتفشل كل الأوامر بعده بـ 25P02
// ويبدو الحارس منهاراً وهو ينجح.
await c.query('savepoint role_probe')
await c.query("select set_config('request.jwt.claims','',true)")
await c.query('set local role authenticated')
let denied = false
try { await c.query("select public.api_rate_limit('x','y',1,'1 hour')") } catch { denied = true }
await c.query('rollback to savepoint role_probe')
ok('  api_rate_limit محجوبة عن المستخدم', denied)

await c.query('ROLLBACK')
await c.end()

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
