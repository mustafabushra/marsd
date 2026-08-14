#!/usr/bin/env node
/**
 * محاولة كسر بوّابة المستندات — لا التأكّد من أنها تعمل.
 *
 * ============================================================================
 * كيف تختلف هذه عن check:gateway و probe:gateway
 * ============================================================================
 * تلك تُثبت أن ما بُني يعمل. وهذه تفترض أنه لا يعمل وتبحث عن الطريق. الفرق
 * ليس في الصياغة: مجموعةٌ يكتبها من بنى النظام تميل إلى اختبار ما فكّر فيه،
 * وهذه مكتوبة لتسأل عمّا لم يُفكَّر فيه.
 *
 * ولذلك تُبلّغ عن **الحدود** كما تُبلّغ عن النجاح. اختبارٌ يمرّ لأن الملف رُفض
 * لسببٍ غير الذي يُفترض أنه رُفض له ليس نجاحاً — وهو مُعلَّم هنا بـ«يمرّ
 * لسبب آخر».
 *
 * ============================================================================
 * العيّنات آمنة كلّها
 * ============================================================================
 * لا برمجية خبيثة حقيقية. الملفّات تُبنى بايتاً بايتاً، و EICAR سلسلةٌ نصّية
 * قياسية غير ضارّة صُمّمت لاختبار الماسحات — ليست فيروساً.
 *
 * ============================================================================
 * لا تُضعِف شيئاً
 * ============================================================================
 * لا تُسقط قيداً ولا سياسة ولا تعدّل شيفرة إنتاج. كل كتابة داخل معاملة
 * تُلغى، وكل كائن يُنشأ يُحذف.
 *
 *   node scripts/attack-document-gateway.mjs
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(pathToFileURL(join(root, 'api', '_lib', 'fileScan.js')).href)

const BOM = String.fromCharCode(0xFEFF)
const readVar = (name) => {
  for (const f of ['.env.migrations', '.env.local', '.env', '.env.production']) {
    let txt = ''
    try { txt = readFileSync(join(root, f), 'utf8') } catch { continue }
    const line = txt.split(/\r?\n/).find((l) => l.split(BOM).join('').trim().startsWith(`${name}=`))
    if (line) {
      const v = line.split('=').slice(1).join('=').split(BOM).join('').trim()
        .replace(/^["']|["']$/g, '').trim()
      if (v) return v
    }
  }
  return process.env[name] ? process.env[name].split(BOM).join('').trim() : null
}

const DB_URL = readVar('DATABASE_URL')
const SB_URL = readVar('SUPABASE_URL') || readVar('VITE_SUPABASE_URL')
const SERVICE = readVar('SUPABASE_SERVICE_ROLE_KEY')
const ANON = readVar('SUPABASE_ANON_KEY') || readVar('VITE_SUPABASE_ANON_KEY')

if (!DB_URL) { console.error('❌ DATABASE_URL مفقود'); process.exit(2) }

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const svc = (SB_URL && SERVICE) ? createClient(SB_URL, SERVICE, { auth: { persistSession: false } }) : null

// ---------------------------------------------------------------------------
// إطار التقرير
// ---------------------------------------------------------------------------
const results = []
const findings = []
const uncovered = []

const record = (id, name, property, passed, note = '') => {
  results.push({ id, name, property, passed, note })
  const tag = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m'
  console.log(`${tag} ${String(id).padStart(2)}. ${name}`)
  console.log(`       يُثبت: ${property}`)
  if (note) console.log(`       ${note}`)
}
const finding = (severity, title, detail, fix) => findings.push({ severity, title, detail, fix })
const gap = (title, why) => uncovered.push({ title, why })
const section = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`)

const stamp = Date.now().toString(36)
const ACTOR = `user_attack_${stamp}`
const cleanup = { objects: [], scans: [] }

// ---------------------------------------------------------------------------
// عيّنات آمنة
// ---------------------------------------------------------------------------
const cat = (...a) => Buffer.concat(a.map((x) => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))))

const pdf = (inject = '', { eof = true } = {}) => cat(
  `%PDF-1.4\n1 0 obj\n<< /Type /Catalog ${inject} >>\nendobj\ntrailer\n<< /Size 2 >>\nstartxref\n0\n`,
  eof ? '%%EOF' : '')

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (b) => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < b.length; i += 1) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
})()
const chunk = (type, data) => {
  const h = Buffer.alloc(8)
  h.writeUInt32BE(data.length, 0); h.write(type, 4, 'latin1')
  const t = Buffer.alloc(4); t.writeUInt32BE(CRC(Buffer.concat([h.subarray(4), data])), 0)
  return Buffer.concat([h, data, t])
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const png = (extra = []) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc(14)
  for (let y = 0; y < 2; y += 1) for (let i = 1; i < 7; i += 1) raw[y * 7 + i] = (y * 30 + i * 10) & 0xFF
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), ...extra,
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/**
 * سلسلة EICAR القياسية — ليست برمجية خبيثة.
 *
 * تُبنى بالتقطيع كي لا يوقظ هذا الملفُّ نفسُه ماسحاً على جهاز مطوّر.
 */
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-',
  'ANTIVIRUS-TEST-FILE!$H+H*'].join('')

const makeZip = (entries) => {
  const locals = []; const centrals = []; let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = Buffer.from(e.data ?? '', 'latin1')
    const comp = e.compSize ?? data.length
    const raw = e.rawSize ?? data.length
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4)
    lh.writeUInt32LE(comp, 18); lh.writeUInt32LE(raw, 22); lh.writeUInt16LE(name.length, 26)
    const local = Buffer.concat([lh, name, data]); locals.push(local)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6)
    ch.writeUInt32LE(comp, 20); ch.writeUInt32LE(raw, 24)
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([ch, name])); offset += local.length
  }
  const central = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, eocd])
}

const scan = (buf, opts = {}) => S.scanFile(Buffer.from(buf), { allow: ['pdf', 'png', 'jpeg', 'webp'], ...opts })

// ===========================================================================
section('أولاً — طبقة الفحص: خداع النوع والحمولات')
// ===========================================================================

// 1
{
  const cases = [
    ['MZ يدّعي application/pdf', cat(Buffer.from([0x4D, 0x5A]), Buffer.alloc(40)), 'application/pdf'],
    ['PNG يدّعي application/pdf', png(), 'application/pdf'],
    ['PDF يدّعي image/png', pdf(), 'image/png'],
    ['ZIP يدّعي application/pdf', makeZip([{ name: 'a', data: 'b' }]), 'application/pdf'],
  ]
  const all = cases.every(([, b, m]) => scan(b, { declaredMime: m }).verdict === 'rejected')
  record(1, 'انتحال نوع MIME', 'النوع يُستنتج من البايتات، والترويسة المُعلَنة لا تُصدَّق', all,
    all ? 'أربع محاولات، كلّها رُفضت' : '')
}

// 2
{
  const names = ['x.pdf', 'x.png', 'x.jpg', 'x.webp', 'x.PDF']
  // الفاحص لا يقرأ الاسم إطلاقاً — تُمرَّر نفس البايتات بأسماء مختلفة.
  const mz = cat(Buffer.from([0x4D, 0x5A]), Buffer.alloc(40))
  const all = names.every(() => scan(mz).reasons.includes('executable'))
  const nameIgnored = /file\.name|\.name\b/.test(
    readFileSync(join(root, 'api', '_lib', 'fileScan.js'), 'utf8')) === false
  record(2, 'انتحال الامتداد', 'الامتداد لا يدخل قرار القبول أصلاً', all && nameIgnored,
    nameIgnored ? 'الفاحص لا يقرأ اسم الملف في شيفرته' : 'الفاحص يقرأ الاسم — راجع')
}

// 3
{
  const payloads = [
    ['/JavaScript', pdf('/JavaScript 5 0 R')],
    ['/OpenAction', pdf('/OpenAction << /S /JavaScript >>')],
    ['/Launch', pdf('/Launch << /F (cmd.exe) >>')],
    ['/EmbeddedFile', pdf('/EmbeddedFile 5 0 R')],
    ['/XFA', pdf('/XFA 5 0 R')],
    ['تمويه ست عشري', pdf('/J#61vaScript 5 0 R')],
    ['تمويه كامل', pdf('/#4A#61#76#61#53#63#72#69#70#74 5 0 R')],
    ['داخل مجرى مضغوط', (() => {
      const z = deflateSync(Buffer.from('<< /S /JavaScript /JS (x) >>', 'latin1'))
      return cat('%PDF-1.5\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n', z,
        '\nendstream\nendobj\ntrailer\n<< >>\n%%EOF')
    })()],
    ['مُعمّى', pdf('/Encrypt 9 0 R')],
  ]
  const bad = payloads.filter(([, b]) => scan(b).verdict !== 'rejected').map(([n]) => n)
  record(3, 'حمولات PDF خبيثة', 'المحتوى النشط يُرفض، ولا يُخفيه تمويه الأسماء ولا الضغط',
    bad.length === 0, bad.length ? `مرّت: ${bad.join(', ')}` : `${payloads.length} حمولة رُفضت`)
}

// 4 — EICAR
{
  const bare = scan(Buffer.from(EICAR, 'latin1'))
  const bareRejected = bare.verdict === 'rejected'
  const reasonIsType = bare.reasons.includes('unknown_type')

  // EICAR مدسوسة داخل PDF سليم البنية بلا محتوى نشط.
  const inPdf = scan(pdf(`/Note (${EICAR})`))
  const inPdfAccepted = inPdf.verdict === 'clean'

  // وداخل صورة، في مقطع نصّي.
  const inPng = scan(png([chunk('tEXt', Buffer.from(`c\0${EICAR}`, 'latin1'))]))
  const inPngAccepted = inPng.verdict === 'clean'

  record(4, 'ملف EICAR القياسي',
    'البوّابة سياسةُ محتوى لا مضادّ فيروسات — والتمييز مقصود ومُوثَّق',
    bareRejected,
    `مجرّدة: رُفضت${reasonIsType ? ' — لكن لأنها ليست من الأنواع المسموحة، لا لأنها كُشفت' : ''}`
    + `\n       داخل PDF سليم: ${inPdfAccepted ? 'قُبلت' : 'رُفضت'}`
    + `\n       داخل مقطع PNG نصّي: ${inPngAccepted ? 'قُبلت (ثم أُزيلت بإعادة الترميز)' : 'رُفضت'}`)

  if (inPdfAccepted) {
    finding('معلومة', 'حمولة خاملة داخل مستند سليم تمرّ',
      'EICAR داخل PDF بلا محتوى نشط تُقبل. هذا سلوكٌ مقصود لا خلل: البوّابة '
      + 'تفحص البنية والمحتوى النشط، ولا تطابق توقيعات. أي سلسلة بايتات خاملة '
      + 'داخل مستند صالح ستمرّ.',
      'إن أُريد كشف التوقيعات فالمرحلة اللاحقة: سمعة التجزئة (MalwareBazaar) '
      + 'وقواعد YARA — وهما مؤجَّلتان بقرارك.')
  }
  if (inPngAccepted) {
    const sanitized = scan(png([chunk('tEXt', Buffer.from(`c\0${EICAR}`, 'latin1'))])).sanitized
    const gone = sanitized && !sanitized.bytes.includes(EICAR, 0, 'latin1')
    record(4.1, 'EICAR داخل صورة تُزال بإعادة الترميز',
      'التعقيم يُزيل الحمولة الخاملة من الصور وإن لم تُكشَف كتوقيع', !!gone,
      gone ? 'المخرَج خالٍ منها' : 'باقية في المخرَج')
  }
}

// 5
{
  const big = Buffer.alloc(22 * 1024 * 1024)
  const r = scan(big)
  const atLimit = scan(Buffer.alloc(21 * 1024 * 1024))
  record(5, 'ملف يتجاوز الحدّ', 'الحجم يُفحص قبل أي معالجة، فلا يُستهلك الخادم بملف ضخم',
    r.verdict === 'rejected' && r.reasons.includes('too_large')
    && atLimit.reasons.includes('unknown_type'),
    'الفائض يُرفض بالحجم، وما دونه يُرفض بالنوع لا بالحجم')
}

// 6
{
  const r = scan(Buffer.alloc(0))
  record(6, 'ملف فارغ', 'الفراغ يُردّ صراحةً ولا يُعامَل كنوع مجهول',
    r.verdict === 'rejected' && r.reasons.includes('empty'))
}

// 7
{
  const cases = [
    ['PDF بلا %%EOF', pdf('', { eof: false })],
    ['ترويسة PDF فقط', Buffer.from('%PDF-1.4', 'latin1')],
    ['PDF مقطوع في منتصف مجرى', cat('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n', Buffer.alloc(50, 0x41))],
    ['ترويسة PDF مشوّهة', cat('%PDF-XX\n trailer\n%%EOF')],
  ]
  const bad = cases.filter(([, b]) => scan(b).verdict !== 'rejected').map(([n]) => n)
  record(7, 'PDF مقطوع أو تالف', 'البنية غير السليمة تُردّ بدل أن تُخمَّن',
    bad.length === 0, bad.length ? `مرّت: ${bad.join(', ')}` : `${cases.length} حالة رُفضت`)
}

// 8
{
  const cases = [
    ['نسبة فكّ خيالية', makeZip([{ name: 'a', data: 'x', compSize: 1, rawSize: 50_000_000 }])],
    ['حجم مفكوك ضخم', makeZip([{ name: 'a', data: 'x', compSize: 9_000_000, rawSize: 900_000_000 }])],
    ['مدخلات بلا عدد', makeZip(Array.from({ length: 60 }, (_, i) => ({ name: `f${i}`, data: 'x' })))],
  ]
  const zipAlwaysRejected = cases.every(([, b]) => scan(b).reasons.includes('archive'))
  const bombNamed = S.scanZip(cases[0][1]).includes('zip_bomb')
    && S.scanZip(cases[1][1]).includes('zip_bomb')
  record(8, 'قنابل الضغط', 'الأرشيف مرفوض أصلاً، والقنبلة تُقاس من الفهرس لا بفكّها',
    zipAlwaysRejected && bombNamed,
    'الأحجام تُقرأ من الفهرس المركزي — لا فكّ، فلا استهلاك')
}

// 9
{
  const doubles = ['x.pdf.exe', 'x.png.js', 'doc.pdf.scr', 'a.jpg.html', 'x.pdf .exe']
  // الاسم لا يُقرأ في الفحص. والمهمّ أن المسار المخزَّن يأخذ امتداد **المحتوى**.
  const src = readFileSync(join(root, 'api', 'scan-document.js'), 'utf8')
  const corrects = /withExtension\(targetPath, verdict\.detectedType\)/.test(src)
    && /replace\(\/\\\.\[A-Za-z0-9\]\{1,8\}\$\/, ''\)/.test(src)
  const mzRejected = doubles.every(() => scan(cat(Buffer.from([0x4D, 0x5A]), Buffer.alloc(40)))
    .reasons.includes('executable'))
  record(9, 'الامتدادات المزدوجة', 'الامتداد المخزَّن يُشتقّ من المحتوى، فلا يُورَّث من الاسم',
    corrects && mzRejected,
    corrects ? 'withExtension تقطع الامتداد الوارد وتضع امتداد النوع المُستنتَج' : 'لم تُعثر آلية التصحيح')
}

// 10 · 11 · 12 — أسماء المسارات
{
  const SAFE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9/_.-]{0,300}$/
  const traversal = ['../../etc/passwd', '..\\..\\win.ini', 'a/../../b', '/etc/shadow',
    'C:\\windows\\x', '....//....//etc', 'a/./../../b']
  const nullByte = ['x.pdf\u0000.exe', '\u0000abc', 'a\u0000/b']
  const unicode = [
    'a\uFF0E\uFF0E\uFF0Fb',          // نقطتان ومائلة بعرض كامل
    'a\u202E gpj.exe',                // قلب اتجاه
    'a\u200B/../b',                   // مسافة صفرية العرض
    '%2e%2e%2fetc',                   // ترميز URL
    'caf\u00E9/x', 'cafe\u0301/x',    // NFC مقابل NFD
    'a\u0000b',
  ]
  const rej = (list) => list.filter((p) => SAFE.test(p))

  const t10 = rej(traversal)
  record(10, 'أسماء فيها اجتياز مسار', 'المسار يُرفض قبل لمس التخزين — لا صعود ولا جذر',
    t10.length === 0, t10.length ? `قُبلت: ${t10.join(', ')}` : `${traversal.length} صيغة رُفضت`)

  const t11 = rej(nullByte)
  record(11, 'أسماء فيها بايتة صفرية', 'البايتة الصفرية تُنهي السلسلة في طبقات دنيا، فتُردّ هنا',
    t11.length === 0, t11.length ? `قُبلت: ${t11.join(', ')}` : '')

  const t12 = rej(unicode)
  // NFC/NFD: هل يمكن لصيغتين مختلفتين أن تشيرا لنفس الكائن؟
  const nfc = 'caf\u00E9'
  const nfd = 'cafe\u0301'
  const sameAfterNorm = nfc.normalize('NFC') === nfd.normalize('NFC')
  const pathsDiffer = nfc !== nfd
  record(12, 'يونيكود وتطبيع المسارات', 'المسار مقصور على ASCII محدَّد، فلا تطبيع ولا التباس',
    t12.length === 0, t12.length ? `قُبلت: ${t12.join(', ')}`
      : `ASCII فقط — والتباس NFC/NFD (${sameAfterNorm && pathsDiffer ? 'قائم في يونيكود' : '—'}) لا يبلغ المسار`)

  // ولا يُبنى المسار من اسم الملف أصلاً.
  const gw = readFileSync(join(root, 'src', 'lib', 'uploadViaGateway.js'), 'utf8')
  const usesSafeName = /safeStorageName\(/.test(gw) && !/file\.name/.test(gw)
  record(12.1, 'اسم الملف لا يدخل مسار التخزين',
    'اسم التخزين عشوائي، فلا ينتقل شيء من اسم المستخدم إلى المفتاح', usesSafeName,
    usesSafeName ? 'uploadViaGateway يستعمل safeStorageName ولا يقرأ file.name' : '')
}

// ===========================================================================
section('ثانياً — التصريح والعزل')
// ===========================================================================

const asUser = (sub) => db.query("select set_config('request.jwt.claims',$1,true)",
  [JSON.stringify({ sub, role: 'authenticated' })])

const { rows: [realUser] } = await db.query(
  "select id, tenant_id from public.users where status='active' and tenant_id is not null order by id limit 1")
const { rows: [otherUser] } = await db.query(
  "select id, tenant_id from public.users where status='active' and tenant_id is not null and id <> $1 order by id limit 1",
  [realUser?.id || ''])

// 13
{
  await db.query('begin')
  await asUser(ACTOR)
  await db.query('set local role authenticated')
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  const { rows: [{ n }] } = await db.query("select count(*)::int n from storage.objects where bucket_id='quarantine'")
  let inserted = false
  try {
    await db.query("insert into storage.objects (bucket_id,name,owner_id) values ('quarantine',$1,$2)",
      [`${ACTOR}/x.pdf`, ACTOR])
    inserted = true
  } catch { /* متوقَّع أن يمرّ: سياسة الرفع تسمح بمجلّد صاحبه */ }
  let readBack = 0
  try {
    const { rows: [r] } = await db.query("select count(*)::int n from storage.objects where bucket_id='quarantine'")
    readBack = r.n
  } catch { /* لا سياسة قراءة */ }
  await db.query('rollback')
  record(13, 'قراءة غير مصرَّح بها من الحجر',
    'الحجر لا يُقرأ بأي هويّة مستخدم — ولو كان هو من رفع',
    me === 'authenticated' && n === 0 && readBack === 0,
    `الدور المُختبَر: ${me} · صفوف مرئية: ${n} · بعد الرفع: ${readBack}`
    + `${inserted ? ' · الرفع في مجلّده مسموح كما يجب' : ''}`)
}

// 14 · 15
if (realUser && otherUser) {
  const { rows: [doc] } = await db.query(
    `select d.file_url, d.company_id, d.uploaded_by_tenant_id
       from public.company_documents d
      where d.uploaded_by_tenant_id is not null limit 1`)

  if (!doc) {
    gap('وصول متقاطع بين الشركات على كائن حقيقي',
      'لا صفّ في company_documents له مستأجر رافع — لم يُختبر على بيانات حقيقية')
    record(14, 'وصول متقاطع بين الشركات', 'مستند شركة لا يُقرأ من مستأجر آخر', true,
      'لا بيانات كافية — يُعتمد على فحص السياسة أدناه')
  } else {
    await db.query('begin')
    await asUser(otherUser.id)
    await db.query('set local role authenticated')
    const { rows: [{ n }] } = await db.query(
      "select count(*)::int n from storage.objects where bucket_id='company-documents' and name=$1",
      [doc.file_url])
    const { rows: [{ me }] } = await db.query('select current_user::text me')
    await db.query('rollback')
    const isolated = n === 0 || otherUser.tenant_id === doc.uploaded_by_tenant_id
    record(14, 'وصول متقاطع بين الشركات',
      'مستند شركة لا يُقرأ من حساب مستأجر آخر', isolated && me === 'authenticated',
      `الكائن مرئي لمستأجر آخر: ${n} صفّاً`)
  }

  await db.query('begin')
  await asUser(`${ACTOR}_stranger`)
  await db.query('set local role authenticated')
  const { rows: [{ n: seen }] } = await db.query(
    "select count(*)::int n from storage.objects where bucket_id in ('company-documents','report-documents','support-attachments')")
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  await db.query('rollback')
  record(15, 'وصول متقاطع بين المستخدمين',
    'حساب لا يملك شيئاً لا يرى شيئاً في الدلاء الدائمة', seen === 0 && me === 'authenticated',
    `مستخدم غريب يرى ${seen} كائناً`)
} else {
  gap('اختبارات الوصول المتقاطع', 'لا مستخدمَين نشطَين بمستأجرين — لم تُشغَّل')
}

// 16 · 17 · 18 · 19 — تصريح الرفع
if (realUser) {
  const P = `attack/${stamp}/a.pdf`
  await db.query('begin')
  await asUser(realUser.id)
  const permits = async (b, p) => (await db.query('select public.file_scan_permits($1,$2) x', [b, p])).rows[0].x

  const before = await permits('company-documents', P)
  const { rows: [sc] } = await db.query(
    `insert into public.file_scans (sha256,quarantine_path,target_bucket,target_path,size_bytes,
       scanner_version,actor,verdict,scanned_at)
     values ($1,'q/a','company-documents',$2,10,'attack',$3,'clean',now()) returning id`,
    ['a'.repeat(64), P, realUser.id])
  const mine = await permits('company-documents', P)

  await asUser(otherUser?.id || `${ACTOR}_x`)
  const theirs = await permits('company-documents', P)

  await asUser(realUser.id)
  const wrongBucket = await permits('report-documents', P)
  const wrongPath = await permits('company-documents', `attack/${stamp}/b.pdf`)

  await db.query("update public.file_scans set scanned_at = now() - interval '11 minutes' where id=$1", [sc.id])
  const expired = await permits('company-documents', P)

  await db.query("update public.file_scans set scanned_at=now(), verdict='rejected' where id=$1", [sc.id])
  const afterReject = await permits('company-documents', P)

  // الاستهلاك: هل يبقى التصريح صالحاً بعد استعماله؟
  await db.query("update public.file_scans set verdict='clean' where id=$1", [sc.id])
  const stillValid = await permits('company-documents', P)
  await db.query('rollback')

  record(16, 'استعمال تصريح رفع لمستخدم آخر',
    'التصريح مقصور على فاعله — لا يُستعار', theirs === false,
    `صاحبه: ${mine} · غيره: ${theirs}`)
  record(17, 'تصريح رفع منتهٍ', 'التصريح يسقط بعد عشر دقائق فلا يصير مفتاحاً دائماً',
    expired === false, `قبل الانتهاء: ${mine} · بعده: ${expired}`)
  record(19, 'دلو أو مسار خاطئ', 'التصريح مقصور على دلوه ومساره بالضبط',
    wrongBucket === false && wrongPath === false,
    `دلو آخر: ${wrongBucket} · مسار آخر: ${wrongPath}`)
  record(21, 'ترقية ملف مرفوض', 'الحكم بالرفض لا يُصرّح بشيء',
    afterReject === false && before === false)

  // 18 — النتيجة الحقيقية
  record(18, 'إعادة استعمال تصريح مُستهلَك',
    'التصريح يُستهلك بعد أول رفع فلا يُعاد استعماله', stillValid === false,
    stillValid ? 'التصريح **ليس** ذا استعمال واحد — يبقى صالحاً عشر دقائق' : '')

  if (stillValid) {
    finding('متوسطة', 'تصريح الرفع لا يُستهلك ولا يرتبط بمحتوى',
      'file_scan_permits يفحص (الدلو، المسار، الفاعل، الوقت) ولا يفحص تجزئة الملف '
      + 'ولا يُعلَّم كمُستهلَك. فمن يحصل على حكم نظيف لمسار P يستطيع خلال عشر '
      + 'دقائق أن يرفع **بايتات أخرى** إلى P عبر واجهة التخزين مباشرةً، متجاوزاً '
      + 'الفاحص. ويحدّ من الأثر أن upsert:false يمنع الكتابة فوق كائن قائم — '
      + 'فالنافذة هي الحالة التي فشل فيها رفع البوّابة أو لم يبدأ.',
      'أضف sha256 إلى شرط التصريح، وعمود consumed_at يُضبط عند نجاح الرفع: '
      + 'file_scan_permits(bucket, path, sha256) مع and s.consumed_at is null. '
      + 'ويحتاج ذلك تمرير التجزئة من العميل — أو، أبسط: اجعل البوّابة ترفع '
      + 'بمفتاح الخدمة وتُعيد بناء شروط التصريح داخلها، وهو ما تجنّبناه عمداً '
      + 'لئلا تُكتب قواعد التصريح مرّتين.')
  }
} else {
  gap('اختبارات تصريح الرفع', 'لا مستخدم نشط — لم تُشغَّل')
}

// ===========================================================================
section('ثالثاً — تجاوز البوّابة والبنية التحتية')
// ===========================================================================

// 20 · 30
if (realUser) {
  await db.query('begin')
  await asUser(realUser.id)
  await db.query('set local role authenticated')
  const tryWrite = async (bucket, name) => {
    await db.query('savepoint s')
    try {
      await db.query('insert into storage.objects (bucket_id,name,owner_id) values ($1,$2,$3)',
        [bucket, name, realUser.id])
      await db.query('rollback to savepoint s'); return true
    } catch { await db.query('rollback to savepoint s'); return false }
  }
  const direct = {
    company: await tryWrite('company-documents', `${stamp}/direct.pdf`),
    report: await tryWrite('report-documents', `${stamp}/direct.pdf`),
    support: await tryWrite('support-attachments', `${stamp}/direct.pdf`),
  }
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  await db.query('rollback')
  const blocked = !direct.company && !direct.report && !direct.support
  record(20, 'كتابة مباشرة إلى التخزين الدائم بلا فحص',
    'لا يبلغ دلواً دائماً شيءٌ بلا حكم نظيف مطابق — القاعدة تمنعه لا الشيفرة',
    blocked && me === 'authenticated',
    `company:${direct.company} report:${direct.report} support:${direct.support}`)

  record(30, 'الملف المرفوض لا يبلغ التخزين الدائم أبداً',
    'الرفض والفشل كلاهما يترك الدلو الدائم بلا شيء', blocked,
    'مشتقّ من ٢٠: بلا حكم نظيف لا كتابة، والمرفوض لا يُنتج حكماً نظيفاً')
} else {
  gap('محاولة الكتابة المباشرة', 'لا مستخدم نشط')
}

// 22 — سباق الفحص والترقية
{
  const src = readFileSync(join(root, 'api', 'scan-document.js'), 'utf8')
  const downloadsOnce = /const bytes = Buffer\.from\(await blob\.arrayBuffer\(\)\)/.test(src)
  const uploadsSameBytes = /const out = verdict\.sanitized\?\.bytes \|\| bytes/.test(src)
  const settleBeforeUpload = src.indexOf("settle(svc, scanId, 'clean'") < src.indexOf('asUser.storage.from(targetBucket).upload')
  record(22, 'سباق بين الفحص والترقية (TOCTOU)',
    'ما يُفحص هو ما يُرفع — البايتات تُقرأ مرّة وتُستعمل نفسها، فلا نافذة تبديل',
    downloadsOnce && uploadsSameBytes,
    'الملف يُنزَّل إلى الذاكرة مرّة، ويُفحص، ويُرفع المخرَج نفسه — لا قراءة ثانية من الحجر')
  if (settleBeforeUpload) {
    record(22.1, 'الحكم يُكتب قبل الرفع',
      'ترتيبٌ مقصود: صفّ الحكم هو التصريح، فلا بدّ أن يسبق الرفع', true,
      'ويترتّب عليه أن حكماً نظيفاً قد يوجد بلا كائن — راجع الثغرة في ١٨')
  }
}

// 23
if (svc) {
  // تسلسلياً: الكتابة الثانية على مسار قائم تُردّ.
  const seqPath = `${ACTOR}/seq-${stamp}.png`
  await svc.storage.from('quarantine').upload(seqPath, Buffer.from('AAAA'), { contentType: 'image/png', upsert: false })
  const second = await svc.storage.from('quarantine').upload(seqPath, Buffer.from('BBBB'), { contentType: 'image/png', upsert: false })
  const { data: kept } = await svc.storage.from('quarantine').download(seqPath)
  const keptText = Buffer.from(await kept.arrayBuffer()).toString()
  cleanup.objects.push(['quarantine', seqPath])
  record(23, 'كتابة ثانية تسلسلية على مسار قائم',
    'upsert:false يمنع الاستبدال، فلا يُكتب فوق كائن استقرّ',
    !!second.error && keptText === 'AAAA',
    `الثانية: ${second.error ? 'رُدّت' : 'نجحت'} · المحتوى الباقي: ${keptText}`)

  // تزامنياً: هل تتسلسل؟ سؤالٌ مختلف، وجوابه متقطّع — فيُقاس بجولات لا بجولة.
  // سباقٌ يظهر مرّةً ويختفي مرّة سباقٌ قائم؛ وجولةٌ واحدة تُعطي أيّ الجوابين
  // بالصدفة.
  const ROUNDS = 5
  let worstOk = 0
  let racedRounds = 0
  let finText = ''
  for (let i = 0; i < ROUNDS; i += 1) {
    const racePath = `${ACTOR}/race-${stamp}-${i}.png`
    const rs = await Promise.allSettled(['AAAA', 'BBBB', 'CCCC'].map((x) =>
      svc.storage.from('quarantine').upload(racePath, Buffer.from(x), { contentType: 'image/png', upsert: false })))
    cleanup.objects.push(['quarantine', racePath])
    const n = rs.filter((r) => r.status === 'fulfilled' && !r.value.error).length
    if (n > 1) racedRounds += 1
    if (n > worstOk) {
      worstOk = n
      const { data: fin } = await svc.storage.from('quarantine').download(racePath)
      finText = Buffer.from(await fin.arrayBuffer()).toString()
    }
  }
  const okCount = worstOk
  record(23.1, 'رفعات متزامنة على نفس المسار',
    'الكتابات المتزامنة تتسلسل فلا يفوز آخرُها على مسار محجوز',
    racedRounds === 0,
    `${racedRounds} من ${ROUNDS} جولات تسابقت · أسوأ جولة: ${okCount} من 3 نجحت`
    + (finText ? ` · الباقي: ${finText}` : ''))

  if (racedRounds > 0) {
    finding('عالية', 'الكتابات المتزامنة على نفس المسار لا تتسلسل',
      `تسابقت ${racedRounds} من ${ROUNDS} جولات؛ في أسوأها نجحت ${okCount} من ثلاث `
      + 'رفعات متزامنة إلى نفس المفتاح، والمحتوى الباقي هو آخر الواصلين. فـ '
      + 'upsert:false يحمي من كتابة ثانية **تسلسلية** فقط، ولا يحجز المفتاح أمام '
      + 'كتابة متزامنة. وتقطّعُه لا ينفيه — يجعله أصعب اكتشافاً فقط.\n'
      + 'وهذا وحده غير مستغَلّ في الحجر (المسارات عشوائية)، لكنه يتضاعف مع الثغرة '
      + 'في ١٨: من يملك تصريحاً صالحاً لمسار في دلو دائم يستطيع أن يسابق رفع '
      + 'البوّابة نفسه ببايتات من عنده، فيستقرّ محتواه في المسار الذي يشير إليه '
      + 'صفّ company_documents.',
      'اربط التصريح بتجزئة المحتوى واستهلكه (انظر إصلاح ١٨) — فذلك يُغلق السلسلة '
      + 'كلّها: بلا تصريح مطابق للتجزئة لا تُقبل بايتات المهاجم أصلاً، سبقت أم '
      + 'تأخّرت.')
  }
} else {
  gap('الرفعات المتزامنة', 'يحتاج مفتاح الخدمة')
}

// 24 · 25 — الروابط الموقَّعة
if (svc) {
  const p = `${ACTOR}/signed-${stamp}.png`
  await svc.storage.from('quarantine').upload(p, png(), { contentType: 'image/png' })
  cleanup.objects.push(['quarantine', p])
  const { data: s1 } = await svc.storage.from('quarantine').createSignedUrl(p, 1)
  await new Promise((r) => setTimeout(r, 2500))
  let expiredStatus = 0
  try { expiredStatus = (await fetch(s1.signedUrl)).status } catch { expiredStatus = -1 }
  record(24, 'انتهاء صلاحية الرابط الموقَّع',
    'الرابط الموقَّع يسقط بانقضاء مدّته فلا يصلح مفتاحاً دائماً',
    expiredStatus === 400 || expiredStatus === 403 || expiredStatus === 401,
    `الطلب بعد الانتهاء: HTTP ${expiredStatus}`)

  const { data: s2 } = await svc.storage.from('quarantine').createSignedUrl(p, 60)
  let byStranger = 0
  try { byStranger = (await fetch(s2.signedUrl)).status } catch { byStranger = -1 }
  record(25, 'استعمال رابط موقَّع من شخص آخر',
    'الرابط الموقَّع حاملٌ للإذن بطبيعته — من يملكه يقرأ',
    byStranger === 200,
    'يُقرأ بلا هويّة: هذا تصميم الروابط الموقَّعة لا خلل فيها')
  if (byStranger === 200) {
    finding('مقبولة بشروط', 'الرابط الموقَّع يعمل لمن يحمله',
      'أي شخص يحصل على الرابط خلال مدّته يقرأ الملف بلا مصادقة. وهذا سلوك '
      + 'الروابط الموقَّعة في كل نظام تخزين.',
      'الحدّ القائم: عمر خمس دقائق في DocumentViewer، ولا يُخزَّن الرابط. '
      + 'وللتشديد: قصّر المدّة أكثر، أو مرّر الملف عبر دالة تتحقّق من الهويّة '
      + 'في كل طلب بدل رابط مباشر.')
  }

  const src = readFileSync(join(root, 'src', 'components', 'DocumentViewer.jsx'), 'utf8')
  const m = /SIGN_SECONDS\s*=\s*(\d+)/.exec(src)
  record(24.1, 'مدّة الرابط في المنتج قصيرة',
    'المدّة المستعملة فعلياً محدودة لا افتراضية', !!m && Number(m[1]) <= 300,
    m ? `SIGN_SECONDS = ${m[1]} ثانية` : 'لم يُعثر الثابت')
} else {
  gap('اختبارات الروابط الموقَّعة', 'يحتاج مفتاح الخدمة')
}

// 26
{
  await db.query('begin')
  await asUser(realUser?.id || ACTOR)
  await db.query('set local role authenticated')
  // يُقاس عدد الصفوف لا غياب الاستثناء: UPDATE بلا سياسة مطابقة لا يرمي شيئاً
  // — يُصيب صفر صفّاً بصمت. وعدُّ ذلك نجاحاً يقلب نتيجة الاختبار رأساً على عقب.
  const affected = async (sql) => {
    await db.query('savepoint s')
    try {
      const r = await db.query(sql)
      await db.query('rollback to savepoint s')
      return r.rowCount
    } catch { await db.query('rollback to savepoint s'); return -1 }
  }
  const upd = await affected("update public.audit_logs set action='tampered'")
  const del = await affected('delete from public.audit_logs')
  // القيمة المخزَّنة لا عدد الصفوف: مشغّل stamp_audit_actor قد يُصحّح الفاعل،
  // فنجاح الإدراج وحده لا يعني أن الانتحال وقع.
  let stored = null
  await db.query('savepoint f')
  try {
    const r = await db.query(
      "insert into public.audit_logs (actor_id,action,entity) values ('user_VICTIM','forged','x') returning actor_id")
    stored = r.rows[0].actor_id
  } catch { stored = 'رُفض' }
  await db.query('rollback to savepoint f')

  const self = await affected(
    "insert into public.audit_logs (actor_id,action,entity) values (null,'noise','x')")
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  await db.query('rollback')
  const forge = stored === 'user_VICTIM' ? 1 : -1

  record(26, 'العبث بسجلّ التدقيق',
    'السجلّ يُكتب ولا يُعدَّل ولا يُحذف — وإلا فليس سجلّاً',
    upd === 0 && del === 0 && me === 'authenticated',
    `عُدِّل ${upd} صفّاً · حُذف ${del} صفّاً (\u200E-1\u200E يعني رُفض باستثناء)`)

  record(26.1, 'انتحال فاعل في قيد تدقيق',
    'قيد التدقيق لا يُنسَب إلى غير كاتبه', forge === -1,
    forge === -1 ? 'رُفض أو صُحّح' : `خُزِّن باسم user_VICTIM كما طُلب`)

  if (forge === 1) {
    finding('متوسطة', 'مستخدم مسجَّل يستطيع تلفيق قيد تدقيق باسم غيره',
      'على audit_logs سياستا INSERT مسموحتان، وسياسات الإدراج المسموحة تُجمع '
      + 'بـOR — فيكفي أن تمرّ إحداهما:\n'
      + '  audit_logs_insert        تشترط actor_id = get_current_user_id() أو NULL\n'
      + '  audit_logs_insert_policy تشترط tenant_id = get_current_tenant_id() فقط\n'
      + 'والثانية لا تذكر الفاعل، فتُجيز ما تمنعه الأولى. ومشغّل stamp_audit_actor '
      + 'يملأ الفاعل حين يكون فارغاً ولا يُصحّحه حين يُملأ.\n'
      + 'والأثر: لا يستطيع أحد حذف قيد ولا تعديله — لكنه يستطيع أن **يزرع** قيداً '
      + 'منسوباً إلى مسؤول. وسجلٌّ يقبل النسبة الكاذبة أضعف من سجلٍّ ناقص، لأن '
      + 'قراءته تُبنى عليها قرارات.',
      'اجعل المشغّل قاطعاً: new.actor_id := public.get_current_user_id() دائماً عند '
      + 'الإدراج، لا عند الفراغ فقط — فيغلق الباب أياً كانت السياسات. وبديلٌ أضعف: '
      + 'إسقاط audit_logs_insert_policy المكرّرة، أو إضافة شرط الفاعل إليها.')
  }
  if (self >= 1) {
    finding('منخفضة', 'إغراق سجلّ التدقيق بقيود من مستخدم عادي',
      'الإدراج المباشر متاح لأي مستخدم مسجَّل، فيمكن إغراق السجلّ بضجيج.',
      'اقصر INSERT على الدوال SECURITY DEFINER ومفتاح الخدمة، أو أضف حدّ معدّل.')
  }
}

// 27
{
  const dist = join(root, 'dist')
  if (!existsSync(dist)) {
    gap('تسرّب مفتاح الخدمة إلى الحزمة', 'dist/ غير موجود — شغّل npm run build')
    record(27, 'تسرّب مفتاح الخدمة إلى شيفرة العميل', 'المفتاح لا يبلغ متصفّحاً', false,
      'لم يُفحص — dist/ مفقود')
  } else {
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
    const leaked = SERVICE ? (bundle.includes(SERVICE) || bundle.includes(SERVICE.slice(0, 40))) : false
    const roleLeak = /"role"\s*:\s*"service_role"/.test(bundle)
      || /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/.test(bundle)
    const srcRefs = []
    const walkSrc = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walkSrc(p)
        else if (/\.(jsx?|tsx?)$/.test(e.name)
          && /SERVICE_ROLE/.test(readFileSync(p, 'utf8'))) srcRefs.push(e.name)
      }
    }
    walkSrc(join(root, 'src'))
    record(27, 'تسرّب مفتاح الخدمة إلى شيفرة العميل',
      'المفتاح يتجاوز RLS كلّه — وجوده في المتصفّح يُلغي كل حراسة',
      !leaked && !roleLeak && srcRefs.length === 0,
      `${files.length} ملفاً في dist · قيمة المفتاح: ${leaked ? 'موجودة!' : 'غير موجودة'}`
      + ` · مراجع في src/: ${srcRefs.length ? srcRefs.join(',') : 'لا شيء'}`)
  }
}

// 28
{
  const { rows: buckets } = await db.query('select id, public from storage.buckets order by id')
  const pub = buckets.filter((b) => b.public)
  let anonFetch = null
  if (SB_URL) {
    try {
      const r = await fetch(`${SB_URL}/storage/v1/object/public/company-documents/x.pdf`)
      anonFetch = r.status
    } catch { anonFetch = -1 }
  }
  record(28, 'انكشاف دلو أو كائن للعموم',
    'لا دلو عامّ — ولا قراءة بلا رابط موقَّع', pub.length === 0 && anonFetch !== 200,
    `${buckets.length} دلواً، العامّ منها ${pub.length} · طلب عامّ مجهول: HTTP ${anonFetch}`)
}

// 29
{
  await db.query('begin')
  await asUser(ACTOR)
  await db.query('set local role authenticated')
  const attempt = async (sql, params = []) => {
    await db.query('savepoint s')
    try { const r = await db.query(sql, params); await db.query('rollback to savepoint s'); return r }
    catch (e) { await db.query('rollback to savepoint s'); return { error: e.code } }
  }
  const readScans = await attempt('select count(*)::int n from public.file_scans')
  const permitOther = await attempt("select public.file_scan_permits('company-documents','x')")
  const importer = await attempt("select public.import_reference_activities('[]'::jsonb)")
  const hashFn = await attempt('select public.file_hash_verdict($1)', ['a'.repeat(64)])
  const { rows: [{ me }] } = await db.query('select current_user::text me')
  await db.query('rollback')

  const scansVisible = !readScans.error && readScans.rows?.[0]?.n > 0
  const importerOpen = !importer.error
  const hashOpen = !hashFn.error
  record(29, 'محاولات تجاوز RLS',
    'حساب عادي لا يقرأ سجلّ الفحص ولا ينادي دوالّ الإدارة ولا ذاكرة التجزئة',
    !scansVisible && !importerOpen && !hashOpen && me === 'authenticated',
    `file_scans: ${scansVisible ? 'مقروء!' : 'محجوب'}`
    + ` · import_reference_activities: ${importerOpen ? 'مفتوح!' : 'مُغلق'}`
    + ` · file_hash_verdict: ${hashOpen ? 'مفتوح!' : 'مُغلق'}`)

  // ترقية الدور لا تُختبَر من هنا: اتصال الهجرات جلستُه postgres، فـ SET ROLE
  // يعود إليها دائماً. النتيجة ستكون «نجح» في كل حال، وهي أثر أداة الاختبار
  // لا خاصيّة النظام — وادّعاء ثغرة منها بلاغٌ كاذب.
  gap('ترقية الدور (SET ROLE) من اتصال حقيقي بدور authenticated',
    'يحتاج اتصالاً تُصدره PostgREST بتوكن Clerk، لا اتصال الهجرات')
}

// ---------------------------------------------------------------------------
// تنظيف
// ---------------------------------------------------------------------------
if (svc) {
  for (const [b, p] of cleanup.objects) {
    await svc.storage.from(b).remove([p]).catch(() => {})
  }
}
if (cleanup.scans.length) {
  await db.query('delete from public.file_scans where id = any($1)', [cleanup.scans]).catch(() => {})
}
await db.end()

// ---------------------------------------------------------------------------
// ما لا يُقاس بفحص — يُذكر كي لا يُقرأ صمتُه تغطيةً
// ---------------------------------------------------------------------------
gap('رفع حقيقي عبر واجهة التخزين بتوكن Clerk',
  'لا سبيل إلى إصدار توكن Clerk خارج المتصفّح. السياسات تُختبَر على مستوى '
  + 'القاعدة — وهي المنطق نفسه — لا طبقة مصادقة واجهة التخزين فوقها')
gap('إعادة فحص الملفّات بعد استقرارها',
  'لا إعادة فحص دورية: ملفٌ قُبل اليوم يبقى مقبولاً بلا مراجعة، وتوقيعات الغد '
  + 'لا تُطبَّق عليه')
gap('استنفاد الموارد بطلبات فحص متوازية',
  'حدّ المعدّل ١٢٠ طلباً في الساعة لكل حساب، ولم يُقَس أثر التوازي على ذاكرة '
  + 'الدالة عند ملفّات قرب الحدّ الأقصى')
gap('سلامة الملف بعد الترقية',
  'لا تُقارَن تجزئة الكائن المستقرّ بتجزئة ما فُحص — فتبديلٌ لاحق لا يُكتشف')
gap('اختبار مضادّ على الإنتاج نفسه',
  'كل ما سبق على قاعدة التطوير والتخزين المرتبط بها؛ فروق الإعداد بين البيئتين '
  + 'لم تُقَس')

// ===========================================================================
// التقرير
// ===========================================================================
const passed = results.filter((r) => r.passed)
const failed = results.filter((r) => !r.passed)

console.log(`\n${'═'.repeat(72)}`)
console.log('التقرير')
console.log('═'.repeat(72))

console.log(`\nA · نجح: ${passed.length}`)
for (const r of passed) console.log(`   ${String(r.id).padStart(4)}. ${r.name}`)

console.log(`\nB · فشل: ${failed.length}`)
if (!failed.length) console.log('   لا شيء')
for (const r of failed) console.log(`   ${String(r.id).padStart(4)}. ${r.name} — ${r.note}`)

console.log(`\nC · ثغرات ومخاطر مكتشفة: ${findings.length}`)
if (!findings.length) console.log('   لا شيء')
for (const f of findings) {
  console.log(`\n   [${f.severity}] ${f.title}`)
  console.log(`   ${f.detail.replace(/\n/g, '\n   ')}`)
}

console.log(`\nD · إصلاحات مقترحة: ${findings.length}`)
for (const f of findings) {
  console.log(`\n   ${f.title}:`)
  console.log(`   ${f.fix.replace(/\n/g, '\n   ')}`)
}

console.log(`\nE · ما لم يُغطَّ: ${uncovered.length}`)
if (!uncovered.length) console.log('   لا شيء')
for (const u of uncovered) console.log(`   · ${u.title} — ${u.why}`)

console.log(`\n${'═'.repeat(72)}`)
console.log(`${passed.length} نجح · ${failed.length} فشل · ${findings.length} ملاحظة أمنية`)
console.log('نجاح هذه المجموعة لا يعني جاهزية الإنتاج — راجع القسمين C و E.')
process.exit(failed.length ? 1 : 0)
