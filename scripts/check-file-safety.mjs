#!/usr/bin/env node
/**
 * هل يُردّ ملفٌ يكذب عن نفسه؟
 *
 * ثلاث طبقات تُختبر، وكلٌّ منها تسقط وحدها:
 *
 *   `<input accept>`      اقتراحٌ لمربّع الاختيار، يتجاوزه السحب والإفلات.
 *   allowed_mime_types    يفحص ترويسة يرسلها العميل، فيصدّق ما ادُّعي.
 *   fileSafety            يقرأ أول بايتات الملف — التوقيع الذي لا يُدَّعى.
 *
 * وهذا يفحص الثالثة، ويؤكّد أن الدلاء الثلاثة محروسة في القاعدة.
 *
 *   npm run check:files
 */
import pg from 'pg'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { inspectFile, safeStorageName } =
  await import(pathToFileURL(join(root, 'src', 'lib', 'fileSafety.js')).href)

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

/** أقلّ ما يشبه File: الحجم والاسم والنوع وقراءة شريحة. */
const mk = (bytes, name, type) => ({
  name,
  type,
  size: bytes.length,
  slice: (a, b) => ({
    arrayBuffer: async () => new Uint8Array(bytes.slice(a, b)).buffer,
  }),
})

const pad = (b, n = 16) => b.concat(Array(Math.max(0, n - b.length)).fill(0))
const PDF = pad([0x25, 0x50, 0x44, 0x46])
const PNG = pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const JPG = pad([0xFF, 0xD8, 0xFF, 0xE0])
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
const EXE = pad([0x4D, 0x5A, 0x90])
const ELF = pad([0x7F, 0x45, 0x4C, 0x46])
const MACHO = pad([0xCF, 0xFA, 0xED, 0xFE])
const ZIP = pad([0x50, 0x4B, 0x03, 0x04])
const RAR = pad([0x52, 0x61, 0x72, 0x21])
const SH = pad([0x23, 0x21, 0x2F, 0x62])
const HTML = pad([0x3C, 0x68, 0x74, 0x6D, 0x6C, 0x3E])
const SVG = pad([0x3C, 0x73, 0x76, 0x67, 0x20])

const check = async (label, file, want, opts) => {
  const r = await inspectFile(file, opts)
  ok(`${label}${r.ok ? '' : ` (${r.reason})`}`, r.ok === want)
}

console.log('─── تُقبل ───')
await check('PDF حقيقي', mk(PDF, 'a.pdf', 'application/pdf'), true)
await check('PNG حقيقي', mk(PNG, 'a.png', 'image/png'), true)
await check('JPEG حقيقي', mk(JPG, 'a.jpg', 'image/jpeg'), true)
await check('WEBP حقيقي', mk(WEBP, 'a.webp', 'image/webp'), true)
await check('PDF بلا نوع معلَن', mk(PDF, 'a.pdf', ''), true)

console.log('\n─── تُرفض: محتوى تنفيذي ───')
await check('تنفيذي Windows سُمّي .pdf', mk(EXE, 'فاتورة.pdf', 'application/pdf'), false)
await check('تنفيذي Linux', mk(ELF, 'a.pdf', 'application/pdf'), false)
await check('تنفيذي macOS', mk(MACHO, 'a.pdf', 'application/pdf'), false)
await check('برنامج نصّي', mk(SH, 'a.pdf', 'application/pdf'), false)

console.log('\n─── تُرفض: محتوى قابل للتنفيذ في المتصفح ───')
await check('HTML', mk(HTML, 'a.pdf', 'application/pdf'), false)
await check('SVG', mk(SVG, 'a.svg', 'image/svg+xml'), false)

console.log('\n─── تُرفض: أرشيفات ───')
await check('ZIP', mk(ZIP, 'a.zip', 'application/pdf'), false)
await check('RAR', mk(RAR, 'a.rar', 'application/pdf'), false)
// docx/xlsx تواقيعها ZIP — تُرفض قصداً: المستندات المقبولة PDF وصور.
await check('DOCX (توقيعه ZIP)', mk(ZIP, 'a.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), false)

console.log('\n─── تُرفض: تناقض أو تشويه ───')
await check('PNG مُعلَن أنه PDF', mk(PNG, 'a.pdf', 'application/pdf'), false)
await check('ملف فارغ', mk([], 'a.pdf', 'application/pdf'), false)
await check('اسم فيه صعود مجلّد', mk(PDF, '../../etc/passwd', 'application/pdf'), false)
await check('اسم فيه فاصل مسار', mk(PDF, 'a/b.pdf', 'application/pdf'), false)
await check('أكبر من الحدّ', mk(pad(PDF, 2048), 'a.pdf', 'application/pdf'), false, { maxBytes: 1024 })
await check('نوع خارج القائمة المسموحة', mk(PNG, 'a.png', 'image/png'), false,
  { allow: ['application/pdf'] })

console.log('\n─── اسم التخزين ───')
const names = new Set(Array.from({ length: 200 }, () => safeStorageName('pdf')))
ok('لا يتكرّر في مئتَي توليد', names.size === 200, `${names.size}`)
ok('لا يشتقّ من اسم المستخدم', !safeStorageName('pdf').includes('..'))
ok('ينتهي بالامتداد', safeStorageName('pdf').endsWith('.pdf'))

console.log('\n─── الدلاء في القاعدة ───')
const envPath = join(root, '.env.migrations')
if (!existsSync(envPath)) { console.error('❌ .env.migrations مفقود'); process.exit(2) }
const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))
const c = new pg.Client({
  connectionString: line.split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const buckets = (await c.query(
  'select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id')).rows
await c.end()

for (const b of buckets) {
  ok(`${b.id}: خاص`, b.public === false)
  ok(`  حدّ حجم`, b.file_size_limit != null, 'بلا حدّ')
  ok(`  قائمة أنواع`, Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length > 0,
    'بلا قائمة')
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
