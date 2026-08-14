#!/usr/bin/env node
/**
 * مجموعة هجوم على بوّابة فحص المستندات.
 *
 * ============================================================================
 * لماذا تُبنى الملفّات هنا لا تُحفظ في المستودع
 * ============================================================================
 * عيّنة خبيثة محفوظة في مستودع تُوقظ ماسحات المطوّرين وأنظمة البناء، وتُنقل
 * بالخطأ. وهذه تُبنى بايتاً بايتاً عند التشغيل: مرئيةٌ في الشيفرة، ولا تعيش
 * على قرص أحد.
 *
 * ============================================================================
 * ما يُختبر في الاتجاهين
 * ============================================================================
 * أن الخبيث يُرفض **وأن السليم يُقبل**. فاحصٌ يرفض كل شيء يجتاز نصف اختبار
 * ويكسر المنتج كلّه — وشهادةُ سجل تجاري مرفوضةٌ خطأً تمنع منشأة حقيقية من
 * التسجيل، ولا أحد يعلم أنه حدث.
 *
 * ويُتحقّق من أن تعقيم الصورة **يُبقي البكسلات كما هي**: مُعقِّمٌ يُتلف الصورة
 * يجتاز «أُزيلت الحمولة» ببلاهة.
 *
 *   npm run check:gateway
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(pathToFileURL(join(root, 'api', '_lib', 'fileScan.js')).href)

let pass = 0
let fail = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1 } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}
const section = (t) => console.log(`\n─── ${t} ───`)
const done = (t) => console.log(`  ✅ ${t}`)

/** يرفض، وبالسبب المتوقَّع. */
const rejects = (name, buf, code, opts) => {
  const r = S.scanFile(Buffer.from(buf), opts)
  const good = r.verdict === 'rejected' && (!code || r.reasons.includes(code))
  ok(name, good, `verdict=${r.verdict} reasons=[${r.reasons}] متوقَّع=${code}`)
  return r
}
const accepts = (name, buf, opts) => {
  const r = S.scanFile(Buffer.from(buf), opts)
  ok(name, r.verdict === 'clean', `reasons=[${r.reasons}]`)
  return r
}

// ---------------------------------------------------------------------------
// بنّاؤو الملفّات
// ---------------------------------------------------------------------------
const cat = (...a) => Buffer.concat(a.map((x) => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))))

/** PDF بسيط سليم، مع إمكان حقن محتوى في جسمه. */
function makePdf (inject = '', { trailer = true } = {}) {
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R ${inject} >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
trailer
<< /Size 4 /Root 1 0 R >>
startxref
0
`
  return cat(body, trailer ? '%%EOF' : '')
}

/** PDF فيه مجرى مضغوط بـFlate يحوي النصّ المُمرَّر. */
function makePdfWithStream (hidden) {
  const z = deflateSync(Buffer.from(hidden, 'latin1'))
  return cat(
    '%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length ',
    String(z.length),
    ' >>\nstream\n', z, '\nendstream\nendobj\n',
    'trailer\n<< /Size 2 >>\nstartxref\n0\n%%EOF',
  )
}

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i += 1) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
})()

function pngChunk (type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** PNG حقيقي: 4×4 بألوان متدرّجة، RGB بعمق 8. */
function makePng ({ extraChunks = [], trailing = null } = {}) {
  const w = 4
  const h = 4
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8      // عمق
  ihdr[9] = 2      // RGB
  const rowBytes = w * 3
  const raw = Buffer.alloc((rowBytes + 1) * h)
  for (let y = 0; y < h; y += 1) {
    raw[y * (rowBytes + 1)] = 0
    for (let x = 0; x < w; x += 1) {
      const o = y * (rowBytes + 1) + 1 + x * 3
      raw[o] = (x * 40 + y) & 0xFF
      raw[o + 1] = (y * 40 + x) & 0xFF
      raw[o + 2] = (x * y * 7) & 0xFF
    }
  }
  const parts = [PNG_SIG, pngChunk('IHDR', ihdr), ...extraChunks,
    pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]
  if (trailing) parts.push(Buffer.from(trailing, 'latin1'))
  return Buffer.concat(parts)
}

/** يفكّ PNG إلى بكسلات خام — للمقارنة قبل التعقيم وبعده. */
function pngPixels (buf) {
  let off = 8
  let ihdr = null
  const idat = []
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') ihdr = data
    if (type === 'IDAT') idat.push(data)
    off += 12 + len
    if (type === 'IEND') break
  }
  const w = ihdr.readUInt32BE(0)
  const h = ihdr.readUInt32BE(4)
  const rowBytes = w * 3
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(rowBytes * h)
  let prev = Buffer.alloc(rowBytes)
  let p = 0
  for (let y = 0; y < h; y += 1) {
    const f = raw[p]; p += 1
    const line = Buffer.from(raw.subarray(p, p + rowBytes)); p += rowBytes
    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= 3 ? line[i - 3] : 0
      const up = prev[i]
      const c = i >= 3 ? prev[i - 3] : 0
      let v = line[i]
      if (f === 1) v = (v + a) & 0xFF
      else if (f === 2) v = (v + up) & 0xFF
      else if (f === 3) v = (v + ((a + up) >> 1)) & 0xFF
      else if (f === 4) {
        const pa = Math.abs(up - c); const pb = Math.abs(a - c); const pc = Math.abs(a + up - 2 * c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 0xFF
      }
      line[i] = v
    }
    line.copy(out, y * rowBytes)
    prev = line
  }
  return out
}

/** JPEG هيكلي سليم: SOI · APP0 · DQT · SOF0 · DHT · SOS · بيانات · EOI. */
function makeJpeg ({ app1 = null, trailing = null } = {}) {
  const seg = (marker, payload) => {
    const h = Buffer.alloc(4)
    h[0] = 0xFF; h[1] = marker
    h.writeUInt16BE(payload.length + 2, 2)
    return Buffer.concat([h, payload])
  }
  const parts = [Buffer.from([0xFF, 0xD8])]
  parts.push(seg(0xE0, Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])])))
  if (app1) parts.push(seg(0xE1, Buffer.from(app1, 'latin1')))
  parts.push(seg(0xDB, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 16)])))
  const sof = Buffer.alloc(15)
  sof[0] = 8; sof.writeUInt16BE(8, 1); sof.writeUInt16BE(8, 3); sof[5] = 3
  for (let i = 0; i < 3; i += 1) { sof[6 + i * 3] = i + 1; sof[7 + i * 3] = 0x11; sof[8 + i * 3] = 0 }
  parts.push(seg(0xC0, sof))
  parts.push(seg(0xC4, Buffer.concat([Buffer.from([0]), Buffer.alloc(16, 0), Buffer.alloc(1, 0)])))
  parts.push(seg(0xDA, Buffer.from([3, 1, 0, 2, 0, 3, 0, 0, 63, 0])))
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78]))
  parts.push(Buffer.from([0xFF, 0xD9]))
  if (trailing) parts.push(Buffer.from(trailing, 'latin1'))
  return Buffer.concat(parts)
}

function makeWebp ({ extraChunk = null } = {}) {
  const vp8 = Buffer.alloc(16, 0x11)
  const chunks = [Buffer.concat([Buffer.from('VP8 ', 'latin1'),
    (() => { const l = Buffer.alloc(4); l.writeUInt32LE(vp8.length); return l })(), vp8])]
  if (extraChunk) chunks.push(extraChunk)
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(body.length + 4, 4)
  head.write('WEBP', 8, 'latin1')
  return Buffer.concat([head, body])
}

/** ZIP حقيقي بمدخلات مخزَّنة، مع إمكان تزوير الأحجام المُعلَنة. */
function makeZip (entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = Buffer.from(e.data ?? '', 'latin1')
    const comp = e.compSize ?? data.length
    const raw = e.rawSize ?? data.length
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt32LE(comp, 18)
    lh.writeUInt32LE(raw, 22)
    lh.writeUInt16LE(name.length, 26)
    const local = Buffer.concat([lh, name, data])
    locals.push(local)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt32LE(comp, 20)
    ch.writeUInt32LE(raw, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([ch, name]))
    offset += local.length
  }
  const central = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, eocd])
}

// ===========================================================================
section('السليم يمرّ — وهذا نصف الاختبار')
// ===========================================================================
const cleanPdf = accepts('PDF بسيط سليم', makePdf())
ok('ونوعه يُستنتج pdf', cleanPdf.detectedType === 'pdf', cleanPdf.detectedType)
ok('وتجزئته SHA-256', /^[a-f0-9]{64}$/.test(cleanPdf.sha256 || ''))

accepts('PNG سليم', makePng())
accepts('JPEG سليم', makeJpeg())
accepts('WEBP سليم', makeWebp())
accepts('PDF فيه اسم يشبه الخطر ولا يطابقه (/JSName)', makePdf('/JSName (x)'))
accepts('PDF فيه رابط عادي', makePdf('/URI (https://example.com)'))
done('لا رفض لِما لا يستحقّه')

// ===========================================================================
section('PDF — المحتوى النشط')
// ===========================================================================
rejects('/JavaScript', makePdf('/JavaScript 5 0 R'), 'pdf_active_content')
rejects('/JS', makePdf('/JS (app.alert\\(1\\))'), 'pdf_active_content')
rejects('/OpenAction', makePdf('/OpenAction << /S /JavaScript >>'), 'pdf_active_content')
rejects('/AA إجراء تلقائي', makePdf('/AA << /O 5 0 R >>'), 'pdf_active_content')
rejects('/SubmitForm', makePdf('/SubmitForm 5 0 R'), 'pdf_active_content')
rejects('/RichMedia', makePdf('/RichMedia 5 0 R'), 'pdf_active_content')
rejects('/Launch تشغيل خارجي', makePdf('/Launch << /F (cmd.exe) >>'), 'pdf_launch')
rejects('/EmbeddedFile ملف مضمَّن', makePdf('/EmbeddedFile 5 0 R'), 'pdf_embedded_file')
rejects('/GoToE', makePdf('/GoToE 5 0 R'), 'pdf_embedded_file')
rejects('/XFA نموذج', makePdf('/XFA 5 0 R'), 'pdf_xfa')
rejects('/Encrypt مُعمّى', makePdf('/Encrypt 9 0 R'), 'pdf_encrypted')
done('١١ نوع محتوى نشط')

// ===========================================================================
section('PDF — التمويه الذي يتجاوز الفاحص الساذج')
// ===========================================================================
// \u200E/J#61vaScript\u200E هو \u200E/JavaScript\u200E عند القارئ، ولا يراه بحثٌ في النصّ الخام.
rejects('اسم مموَّه بترميز ست عشري #61', makePdf('/J#61vaScript 5 0 R'), 'pdf_active_content')
rejects('تمويه كامل لكل الحروف', makePdf('/#4A#61#76#61#53#63#72#69#70#74 5 0 R'), 'pdf_active_content')
rejects('OpenAction مموَّه', makePdf('/Open#41ction << /S /JavaScript >>'), 'pdf_active_content')
// مخبوء داخل مجرى مضغوط — لا يظهر في البايتات الخام إطلاقاً.
rejects('محتوى نشط داخل مجرى Flate مضغوط',
  makePdfWithStream('<< /Type /Action /S /JavaScript /JS (evil) >>'), 'pdf_active_content')
rejects('تمويه داخل مجرى مضغوط',
  makePdfWithStream('<< /S /J#61vaScript >>'), 'pdf_active_content')
done('التمويه والضغط لا يُخفيان')

// ===========================================================================
section('Polyglot والبيانات الزائدة')
// ===========================================================================
rejects('PDF متبوع بأرشيف ZIP', cat(makePdf(), makeZip([{ name: 'a.txt', data: 'x' }])), 'polyglot')
rejects('PDF متبوع ببيانات', cat(makePdf(), 'AAAA بيانات ملحقة'), 'trailing_data')
rejects('PNG متبوع ببيانات', makePng({ trailing: 'PAYLOAD' }), 'trailing_data')
rejects('PNG متبوع بتنفيذي', cat(makePng(), Buffer.from([0x4D, 0x5A, 0x90, 0x00])), 'trailing_data')
rejects('JPEG متبوع ببيانات بعد EOI', makeJpeg({ trailing: 'PAYLOAD' }), 'trailing_data')
rejects('WEBP أطول من طوله المُعلَن', cat(makeWebp(), 'EXTRA'), 'trailing_data')
done('النهايات محروسة')

// ===========================================================================
section('التنفيذي والأرشيف مهما سُمّي')
// ===========================================================================
const MZ = Buffer.concat([Buffer.from([0x4D, 0x5A, 0x90, 0]), Buffer.alloc(60)])
rejects('تنفيذي Windows مُعلَن PDF', MZ, 'executable', { declaredMime: 'application/pdf' })
rejects('تنفيذي Linux', Buffer.concat([Buffer.from([0x7F, 0x45, 0x4C, 0x46]), Buffer.alloc(60)]), 'executable')
rejects('تنفيذي macOS', Buffer.concat([Buffer.from([0xCF, 0xFA, 0xED, 0xFE]), Buffer.alloc(60)]), 'executable')
rejects('برنامج نصّي #!', cat('#!/bin/sh\nrm -rf /'), 'script')
rejects('أرشيف RAR', Buffer.concat([Buffer.from('Rar!', 'latin1'), Buffer.alloc(60)]), 'archive')
rejects('أرشيف ZIP', makeZip([{ name: 'a.txt', data: 'x' }]), 'archive')
done('لا يمرّ تنفيذي ولا أرشيف')

// ===========================================================================
section('داخل الأرشيف — ماكرو وتنفيذي وقنبلة ومسار صاعد')
// ===========================================================================
const zipReasons = (entries) => S.scanZip(makeZip(entries))
ok('ماكرو Office (vbaProject.bin)',
  zipReasons([{ name: 'word/vbaProject.bin', data: 'x' }]).includes('zip_macro'))
// الحالتان التاليتان لا تُمسكهما قاعدة «\u200E.bin\u200E تحت word/xl/ppt»: الأولى في
// الجذر والثانية ليست \u200E.bin\u200E. بلا هما تصير قاعدة الأسماء الصريحة زائدةً لا
// يكشف تعطيلَها اختبار.
ok('ماكرو في جذر الأرشيف',
  zipReasons([{ name: 'vbaProject.bin', data: 'x' }]).includes('zip_macro'))
ok('بيانات ماكرو بامتداد xml',
  zipReasons([{ name: 'word/vbaData.xml', data: 'x' }]).includes('zip_macro'))
ok('كائن OLE مضمَّن',
  zipReasons([{ name: 'word/embeddings/oleObject1.bin', data: 'x' }]).includes('zip_macro'))
ok('تنفيذي داخل الأرشيف',
  zipReasons([{ name: 'setup.exe', data: 'x' }]).includes('zip_executable'))
ok('سكربت PowerShell داخل الأرشيف',
  zipReasons([{ name: 'a/run.ps1', data: 'x' }]).includes('zip_executable'))
ok('اختصار lnk داخل الأرشيف',
  zipReasons([{ name: 'doc.lnk', data: 'x' }]).includes('zip_executable'))
ok('مسار صاعد ../',
  zipReasons([{ name: '../../etc/passwd', data: 'x' }]).includes('zip_traversal'))
ok('مسار مطلق',
  zipReasons([{ name: '/etc/shadow', data: 'x' }]).includes('zip_traversal'))
ok('مسار ويندوز مطلق',
  zipReasons([{ name: 'C:\\windows\\system32\\x.dll', data: 'x' }]).includes('zip_traversal'))
ok('أرشيف داخل أرشيف',
  zipReasons([{ name: 'inner.zip', data: 'x' }]).includes('zip_nested'))
ok('قنبلة ضغط بنسبة معلنة خيالية',
  zipReasons([{ name: 'a.txt', data: 'x', compSize: 1, rawSize: 50_000_000 }]).includes('zip_bomb'))
ok('حجم مفكوك يتجاوز نصف غيغابايت',
  zipReasons([{ name: 'a.txt', data: 'x', compSize: 10_000_000, rawSize: 600_000_000 }]).includes('zip_bomb'))
ok('مستند Office عادي لا يُتّهم',
  zipReasons([{ name: 'word/document.xml', data: 'x'.repeat(100), compSize: 100, rawSize: 400 }]).length === 0)
done('١٢ فحصاً داخل الأرشيف')

// ===========================================================================
section('الحدود والادّعاء')
// ===========================================================================
rejects('ملف فارغ', Buffer.alloc(0), 'empty')
rejects('أكبر من الحدّ', Buffer.alloc(22 * 1024 * 1024), 'too_large')
rejects('نوع مجهول', cat('هذا نصّ عادي لا توقيع له'), 'unknown_type')
rejects('GIF خارج قائمة السماح', cat('GIF89a', Buffer.alloc(20)), 'type_not_allowed')
rejects('PNG مُعلَن PDF', makePng(), 'declared_mismatch', { declaredMime: 'application/pdf' })
accepts('PNG مُعلَن PNG', makePng(), { declaredMime: 'image/png' })
accepts('PNG مع charset في الترويسة', makePng(), { declaredMime: 'image/png; charset=binary' })
done('قائمة سماح لا قائمة منع')

// ===========================================================================
section('تعقيم الصور — يُزيل الحمولة ويُبقي الصورة')
// ===========================================================================
// حمولة في مقطع نصّي: موضعٌ معتاد لتهريب سكربت داخل صورة تُعرض سليمة.
const payload = 'MARSAD_PAYLOAD_<script>alert(1)</script>'
const withText = makePng({ extraChunks: [pngChunk('tEXt', Buffer.from(`Comment\0${payload}`, 'latin1'))] })

ok('PNG فيه مقطع نصّي يُقبل (المقطع ليس خطراً بذاته)',
  S.scanFile(withText).verdict === 'clean')

const cleaned = S.scanFile(withText).sanitized
ok('وأُنتج مخرَج مُعقَّم', !!cleaned?.bytes)
ok('وطريقته إعادة ترميز فعلية', cleaned?.method === 'png_reencode', cleaned?.method)
ok('والحمولة اختفت من المخرَج',
  cleaned && !cleaned.bytes.includes(payload, 0, 'latin1'))
ok('والحمولة كانت موجودة في الأصل — الاختبار ليس فارغاً',
  withText.includes(payload, 0, 'latin1'))
ok('ولا مقطع tEXt في المخرَج',
  cleaned && !cleaned.bytes.includes('tEXt', 0, 'latin1'))

// الأهمّ: الصورة نفسها لم تتغيّر.
const before = pngPixels(makePng())
const after = pngPixels(cleaned.bytes)
ok('والبكسلات مطابقة تماماً قبل وبعد', before.equals(after),
  `${before.length} مقابل ${after.length}`)
ok('والمخرَج PNG صالح يبدأ بتوقيعه', cleaned.bytes.subarray(0, 8).equals(PNG_SIG))

// JPEG: تُسقط APP1 حيث تعيش EXIF وXMP.
const exifPayload = 'Exif\0\0MARSAD_EXIF_PAYLOAD'
const jpegExif = makeJpeg({ app1: exifPayload })
const jclean = S.scanFile(jpegExif).sanitized
ok('JPEG بـEXIF يُقبل', S.scanFile(jpegExif).verdict === 'clean')
ok('وحمولة EXIF كانت في الأصل', jpegExif.includes('MARSAD_EXIF_PAYLOAD', 0, 'latin1'))
ok('واختفت من المخرَج', jclean && !jclean.bytes.includes('MARSAD_EXIF_PAYLOAD', 0, 'latin1'))
ok('والمخرَج يبدأ بـSOI وينتهي بـEOI',
  jclean && jclean.bytes[0] === 0xFF && jclean.bytes[1] === 0xD8
  && jclean.bytes[jclean.bytes.length - 2] === 0xFF
  && jclean.bytes[jclean.bytes.length - 1] === 0xD9)

// WEBP: تُسقط المقاطع الوصفية.
const xmp = Buffer.concat([Buffer.from('XMP ', 'latin1'),
  (() => { const l = Buffer.alloc(4); l.writeUInt32LE(24); return l })(),
  Buffer.from('MARSAD_XMP_PAYLOAD______', 'latin1')])
const webpMeta = makeWebp({ extraChunk: xmp })
const wclean = S.scanFile(webpMeta).sanitized
ok('WEBP بمقطع XMP يُقبل', S.scanFile(webpMeta).verdict === 'clean')
ok('وحمولته اختفت', wclean && !wclean.bytes.includes('MARSAD_XMP_PAYLOAD', 0, 'latin1'))
done('التعقيم يُزيل ولا يُتلف')

// ===========================================================================
section('استنتاج النوع')
// ===========================================================================
for (const [label, buf, expect] of [
  ['PDF', makePdf(), 'pdf'],
  ['PNG', makePng(), 'png'],
  ['JPEG', makeJpeg(), 'jpeg'],
  ['WEBP', makeWebp(), 'webp'],
  ['ZIP', makeZip([{ name: 'a', data: 'b' }]), 'zip'],
  ['MZ', MZ, 'exe-win'],
  ['نصّ', cat('لا توقيع'), null],
]) {
  ok(`${label} → ${expect}`, S.detectType(Buffer.from(buf)) === expect, S.detectType(Buffer.from(buf)))
}
done('التوقيع يُقرأ لا يُصدَّق')

// ===========================================================================
section('كل سبب له عبارة عربية')
// ===========================================================================
const codes = new Set()
for (const t of [
  makePdf('/JavaScript 1 0 R'), makePdf('/Launch << >>'), makePdf('/XFA 1 0 R'),
  makePdf('/EmbeddedFile 1 0 R'), makePdf('/Encrypt 1 0 R'), MZ,
  makeZip([{ name: '../x.exe', data: 'x' }]), makePng({ trailing: 'X' }),
  Buffer.alloc(0), cat('نصّ'), cat('GIF89a', Buffer.alloc(9)),
]) {
  for (const r of S.scanFile(Buffer.from(t)).reasons) codes.add(r)
}
const missing = [...codes].filter((c) => !S.REASON[c])
ok(`${codes.size} سبباً ولكلٍّ عبارة`, missing.length === 0, missing.join(', '))
done('لا رمز يظهر خاماً لمستخدم')

// ===========================================================================
section('لا رفع مباشر باقٍ في المصدر')
// ===========================================================================
// القاعدة تمنعه منذ migration 180، لكن سطراً كهذا في الشيفرة يعني شاشةً
// تنكسر عند أول استعمال — لا ثغرةً. فيُمسك هنا حيث يُقرأ، لا في الإنتاج.
{
  const { readdirSync, readFileSync } = await import('node:fs')
  const PERMANENT = ['company-documents', 'report-documents', 'support-attachments']
  const offenders = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(jsx?|tsx?)$/.test(e.name)) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/storage\s*\n?\s*\.?\s*from\(\s*['"]([^'"]+)['"]\s*\)\s*\n?\s*\.upload\(/g)) {
        if (PERMANENT.includes(m[1])) offenders.push(`${e.name}: ${m[1]}`)
      }
      // والشكل المفصول على سطرين، كما في الشيفرة القائمة.
      for (const m of src.matchAll(/from\(['"]([^'"]+)['"]\)\s*\.upload\(/g)) {
        if (PERMANENT.includes(m[1])) offenders.push(`${e.name}: ${m[1]}`)
      }
    }
  }
  walk(join(root, 'src'))
  ok('لا ملف في src يرفع إلى دلو دائم مباشرةً',
    offenders.length === 0, [...new Set(offenders)].join(' · '))

  // ولا سقوط إلى data: بعد فشل رفع — كان يخزّن الملف غير مفحوص.
  const inline = []
  const walk2 = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) { walk2(p); continue }
      if (!/\.(jsx?|tsx?)$/.test(e.name)) continue
      const src = readFileSync(p, 'utf8')
      if (/readAsDataURL/.test(src) && /upload|storage/.test(src)) inline.push(e.name)
    }
  }
  walk2(join(root, 'src'))
  ok('ولا احتياط يخزّن الملف نصّاً عند فشل الرفع',
    inline.length === 0, inline.join(' · '))
}
done('البوّابة هي الطريق الوحيد')

console.log(`\n${fail ? '❌' : '✅'} ${pass} ناجح · ${fail} فاشل`)
process.exit(fail ? 1 : 0)
