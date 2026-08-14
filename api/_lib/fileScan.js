/**
 * بوّابة فحص مستندات مرصد — النواة.
 *
 * ============================================================================
 * ما هذا وما ليس هو
 * ============================================================================
 * ليس مضادّ فيروسات، ولا يُقال إنه كذلك. مضادّ الفيروسات يجيب سؤالاً مفتوحاً
 * — «أخبيثٌ هذا الملف؟» — ولا يُجاب بلا توقيعات مقيمة وتحليل ديناميكي.
 * وهذه تجيب سؤالاً مغلقاً: «أهذا مستندٌ سليم البنية من النوع المطلوب، خالٍ من
 * المحتوى النشط؟»
 *
 * والثاني قابل للتنفيذ ومناسب لِما يُرفع إلى مرصد: شهادة سجل تجاري لا سبب
 * مشروع لأن تحوي JavaScript، ولا إجراءً يعمل عند الفتح، ولا ملفاً مضمَّناً.
 * فالرفض هنا سياسةُ محتوى، لا حكمٌ على النيّة.
 *
 * ============================================================================
 * ما لا يكتشفه — بصراحة
 * ============================================================================
 * ثغرة يوم-صفر في مُفكِّك ترميز، داخل ملف سليم البنية بلا محتوى نشط، تمرّ. لا
 * شيء هنا يمنعها. الجواب عنها احتواءٌ لا كشف: ألّا يُفتح المستند غير الموثوق
 * في سياق يهمّ فيه الاستغلال.
 *
 * ============================================================================
 * لماذا يقرأ البايتات لا الترويسات
 * ============================================================================
 * `allowed_mime_types` في الدلو و`<input accept>` كلاهما يصدّق ما ادّعاه
 * المُرسِل. ومن يصوغ الطلب بيد يكتب `application/pdf` فوق أي محتوى. فالنوع
 * هنا يُستنتج من أول البايتات، ثم يُقارن بما ادُّعي — والتناقض نفسه إشارة.
 */

import { createHash } from 'node:crypto'
import { inflateSync, deflateSync, inflateRawSync } from 'node:zlib'

/** يتغيّر مع كل تعديل في المنطق، ويُسجَّل مع كل حكم. */
export const SCANNER_VERSION = 'mdsg-1'

/** أقصى ما يُقبل مهما قال الدلو — يقابل حدّ src/lib/api.ts. */
export const MAX_BYTES = 21 * 1024 * 1024

// ---------------------------------------------------------------------------
// أسباب الرفض
// ---------------------------------------------------------------------------
// رموز ثابتة تُخزَّن، وعبارات عربية تُعرض. الفصل مقصود: الرمز يُبحث ويُحصى عبر
// الإصدارات، والعبارة تتغيّر بلا أن تكسر تقريراً.
export const REASON = {
  empty: 'الملف فارغ',
  too_large: 'الملف أكبر من الحدّ المسموح',
  unknown_type: 'محتوى الملف لا يطابق أي صيغة مدعومة',
  type_not_allowed: 'نوع الملف غير مقبول لهذا الغرض',
  declared_mismatch: 'النوع المُعلَن يخالف محتوى الملف',
  executable: 'ملف تنفيذي',
  archive: 'ملف مضغوط',
  script: 'برنامج نصّي',
  pdf_active_content: 'PDF يحوي محتوى نشطاً (سكربت أو إجراء تلقائي)',
  pdf_embedded_file: 'PDF يحوي ملفاً مضمَّناً',
  pdf_launch: 'PDF يحوي أمر تشغيل خارجي',
  pdf_xfa: 'PDF يحوي نموذج XFA',
  pdf_encrypted: 'PDF مُعمّى — لا يمكن فحص محتواه',
  pdf_malformed: 'بنية PDF غير سليمة',
  polyglot: 'الملف صالح كصيغتين — بنية مزدوجة',
  trailing_data: 'بيانات زائدة بعد نهاية الملف',
  zip_traversal: 'اسم مدخل في الأرشيف يحوي مساراً صاعداً',
  zip_bomb: 'نسبة ضغط أو حجم مفكوك غير معقول',
  zip_macro: 'مستند Office يحوي ماكرو',
  zip_executable: 'الأرشيف يحوي ملفاً تنفيذياً أو نصّياً',
  zip_nested: 'أرشيف داخل أرشيف',
  zip_external: 'مستند Office يشير إلى مورد خارجي',
  image_malformed: 'بنية الصورة غير سليمة',
  previously_rejected: 'ملف مطابق رُفض سابقاً',
  // أسباب تصدر عن البوّابة لا عن الفاحص، وتُسمّى هنا كي لا يظهر رمزٌ خام.
  upload_failed: 'تعذّر حفظ الملف بعد الفحص',
  scan_exception: 'تعذّر إتمام الفحص — بقي الملف في الحجر',
}

export const reasonLabel = (code) => REASON[code] || code

// ---------------------------------------------------------------------------
// التواقيع
// ---------------------------------------------------------------------------
const b = (...a) => Buffer.from(a)

/** الصيغ المفهومة — سواء أُريدت أم رُفضت. */
const SIGNATURES = [
  { type: 'pdf', mime: 'application/pdf', magic: b(0x25, 0x50, 0x44, 0x46) },              // %PDF
  { type: 'png', mime: 'image/png', magic: b(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) },
  { type: 'jpeg', mime: 'image/jpeg', magic: b(0xFF, 0xD8, 0xFF) },
  { type: 'gif', mime: 'image/gif', magic: b(0x47, 0x49, 0x46, 0x38) },
  { type: 'webp', mime: 'image/webp', magic: b(0x52, 0x49, 0x46, 0x46), at8: b(0x57, 0x45, 0x42, 0x50) },
  { type: 'zip', mime: 'application/zip', magic: b(0x50, 0x4B, 0x03, 0x04) },
  { type: 'zip', mime: 'application/zip', magic: b(0x50, 0x4B, 0x05, 0x06) },              // أرشيف فارغ
  { type: 'rar', mime: 'application/vnd.rar', magic: b(0x52, 0x61, 0x72, 0x21) },
  { type: 'exe-win', mime: null, magic: b(0x4D, 0x5A) },                                   // MZ
  { type: 'exe-elf', mime: null, magic: b(0x7F, 0x45, 0x4C, 0x46) },
  { type: 'exe-mach', mime: null, magic: b(0xCF, 0xFA, 0xED, 0xFE) },
  { type: 'exe-mach', mime: null, magic: b(0xCE, 0xFA, 0xED, 0xFE) },
  { type: 'exe-mach', mime: null, magic: b(0xCA, 0xFE, 0xBA, 0xBE) },                      // universal / class
  { type: 'script', mime: null, magic: b(0x23, 0x21) },                                    // #!
]

/** ما يُرفض بمجرّد معرفته، مهما كان الاسم أو النوع المُعلَن. */
const DANGEROUS_TYPE = {
  'exe-win': 'executable',
  'exe-elf': 'executable',
  'exe-mach': 'executable',
  script: 'script',
  rar: 'archive',
}

const startsWith = (buf, magic, at = 0) =>
  buf.length >= at + magic.length && buf.compare(magic, 0, magic.length, at, at + magic.length) === 0

/**
 * النوع الحقيقي من أول البايتات.
 *
 * يُرجع `null` لِما لا يُعرف — و«لا يُعرف» رفضٌ هنا، لا تساهل: قائمة سماح لا
 * قائمة منع.
 */
export function detectType (buf) {
  for (const s of SIGNATURES) {
    if (startsWith(buf, s.magic) && (!s.at8 || startsWith(buf, s.at8, 8))) return s.type
  }
  return null
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * الكلمات التي تجعل المستند فاعلاً لا مقروءاً.
 *
 * المصدر عملي: هذه هي التي تستعملها عيّنات PDF الخبيثة فعلاً. و«شهادة سجل
 * تجاري» لا تحتاج واحدة منها، فالرفض هنا لا يكلّف مستخدماً شرعياً شيئاً.
 */
const PDF_ACTIVE = [
  { needle: '/JavaScript', reason: 'pdf_active_content' },
  { needle: '/JS', reason: 'pdf_active_content' },
  { needle: '/OpenAction', reason: 'pdf_active_content' },
  { needle: '/AA', reason: 'pdf_active_content' },
  { needle: '/SubmitForm', reason: 'pdf_active_content' },
  { needle: '/RichMedia', reason: 'pdf_active_content' },
  { needle: '/Launch', reason: 'pdf_launch' },
  { needle: '/EmbeddedFile', reason: 'pdf_embedded_file' },
  { needle: '/GoToE', reason: 'pdf_embedded_file' },
  { needle: '/XFA', reason: 'pdf_xfa' },
]

/**
 * يفكّ تمويه الأسماء قبل البحث.
 *
 * PDF يسمح بكتابة أي محرف في الاسم بصيغة \u200E#XX\u200E ستّ عشرية: فـ\u200E/J#61vaScript\u200E
 * هو \u200E/JavaScript\u200E حرفياً عند القارئ. وباحثٌ عن النصّ الخام لا يراه — وهذه
 * أشهر حيلة لتجاوز فاحصات PDF الساذجة، لا حالة نادرة.
 */
function decodePdfNames (buf) {
  const out = Buffer.allocUnsafe(buf.length)
  let j = 0
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x23 && i + 2 < buf.length) {          // '#'
      const hex = buf.toString('latin1', i + 1, i + 3)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out[j++] = parseInt(hex, 16)
        i += 2
        continue
      }
    }
    out[j++] = buf[i]
  }
  return out.subarray(0, j)
}

/**
 * يجمع ما يُقرأ من محتوى مضغوط داخل الملف.
 *
 * الكلمات الخطرة تُخبَّأ داخل \u200E/ObjStm\u200E مضغوط بـFlate، فلا تظهر في البايتات
 * الخام إطلاقاً. فتُفكّ كل مجاري الضغط ويُبحث داخلها أيضاً.
 *
 * ما يفشل فكّه يُتجاهل بصمت: مجرى معطوب ليس دليل خبث، والحكم على ما لم يُقرأ
 * يأتي من `/ObjStm` غير المفكوك أدناه.
 */
function inflatedStreams (buf, limit = 64) {
  const parts = []
  let from = 0
  let count = 0
  while (count < limit) {
    const s = buf.indexOf('stream', from, 'latin1')
    if (s < 0) break
    const e = buf.indexOf('endstream', s, 'latin1')
    if (e < 0) break
    // بعد الكلمة: CRLF أو LF.
    let start = s + 6
    if (buf[start] === 0x0D) start += 1
    if (buf[start] === 0x0A) start += 1
    const raw = buf.subarray(start, e)
    from = e + 9
    count += 1
    if (raw.length < 2 || raw.length > 8 * 1024 * 1024) continue
    for (const fn of [inflateSync, inflateRawSync]) {
      try {
        const out = fn(raw)
        if (out.length && out.length < 32 * 1024 * 1024) { parts.push(out); break }
      } catch { /* ليس مجرى Flate، أو معطوب */ }
    }
  }
  return parts
}

/** يبحث عن الكلمات في نصّ بعد فكّ تمويه الأسماء. */
function findActive (chunk, found) {
  const hay = decodePdfNames(chunk).toString('latin1')
  for (const { needle, reason } of PDF_ACTIVE) {
    // \u200E/JS\u200E و\u200E/AA\u200E قصيران، وقد يردان جزءاً من اسم أطول (\u200E/JSName\u200E). الحدّ
    // التالي يجب ألّا يكون حرفاً — وإلا فهو اسم آخر.
    const re = new RegExp(`${needle.replace(/[/$]/g, '\\$&')}(?![A-Za-z0-9])`)
    if (re.test(hay)) found.add(reason)
  }
}

/**
 * يفحص PDF: البنية، والمحتوى النشط، والزائد بعد النهاية.
 */
export function scanPdf (buf) {
  const reasons = new Set()

  const head = buf.toString('latin1', 0, Math.min(1024, buf.length))
  if (!/^%PDF-\d\.\d/.test(head)) reasons.add('pdf_malformed')

  const lastEof = buf.lastIndexOf('%%EOF', buf.length, 'latin1')
  if (lastEof < 0) reasons.add('pdf_malformed')

  // مُعمّى: لا يُقرأ محتواه، فلا يُحكم بسلامته. وشهادةٌ رسمية لا تُرسَل مُعمّاة.
  if (/\/Encrypt(?![A-Za-z0-9])/.test(decodePdfNames(buf).toString('latin1'))) {
    reasons.add('pdf_encrypted')
  }

  findActive(buf, reasons)
  for (const part of inflatedStreams(buf)) findActive(part, reasons)

  // بيانات بعد آخر \u200E%%EOF\u200E — موضع بنية الأرشيف في polyglot من نوع PDF+ZIP،
  // لأن قارئ ZIP يقرأ من النهاية وقارئ PDF من البداية.
  if (lastEof >= 0) {
    const tail = buf.subarray(lastEof + 5)
    if (tail.length > 0 && tail.toString('latin1').trim().length > 0) {
      reasons.add('trailing_data')
      if (tail.includes('PK', 0, 'latin1')
          || tail.includes('PK', 0, 'latin1')) reasons.add('polyglot')
    }
  }

  return [...reasons]
}

// ---------------------------------------------------------------------------
// ZIP و Office
// ---------------------------------------------------------------------------

const ZIP_ACTIVE_NAME = /(^|\/)(vbaProject\.bin|vbaData\.xml)$/i
const ZIP_EXEC_EXT = /\.(exe|dll|scr|com|pif|cpl|msi|jar|js|jse|vbs|vbe|wsf|wsh|ps1|bat|cmd|sh|hta|lnk|reg|iso|img)$/i
const ZIP_NESTED_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz|cab|arj)$/i

/**
 * يقرأ الفهرس المركزي بلا فكّ ضغط.
 *
 * قنبلة الضغط تُقاس من الأرقام المُعلَنة، لا بفكّها — فكُّها هو الهجوم نفسه.
 */
export function scanZip (buf) {
  const reasons = new Set()

  // نهاية الفهرس المركزي: PK\x05\x06، يُبحث عنها من آخر الملف.
  let eocd = -1
  const from = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= from; i -= 1) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return ['zip_bomb'] // لا فهرس ⇒ لا يُقرأ ⇒ لا يُوثق به

  const entries = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)

  if (entries > 2000) reasons.add('zip_bomb')

  let totalComp = 0
  let totalRaw = 0
  const max = Math.min(entries, 2000)

  for (let n = 0; n < max; n += 1) {
    if (off + 46 > buf.length) { reasons.add('zip_bomb'); break }
    if (buf.readUInt32LE(off) !== 0x02014b50) { reasons.add('zip_bomb'); break }

    const comp = buf.readUInt32LE(off + 20)
    const raw = buf.readUInt32LE(off + 24)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)

    totalComp += comp
    totalRaw += raw

    // اسم يخرج من مجلّد الفكّ — يكتب فوق ملفات النظام عند فكّه.
    if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')
        || /^[A-Za-z]:/.test(name)) reasons.add('zip_traversal')

    if (ZIP_ACTIVE_NAME.test(name)) reasons.add('zip_macro')
    if (ZIP_EXEC_EXT.test(name)) reasons.add('zip_executable')
    if (ZIP_NESTED_EXT.test(name)) reasons.add('zip_nested')
    // كائن OLE مضمَّن — طريق DDE و«اضغط لتفعيل المحتوى».
    if (/embeddings\/|oleObject|\.bin$/i.test(name) && /^(word|xl|ppt)\//i.test(name)) {
      reasons.add('zip_macro')
    }

    off += 46 + nameLen + extraLen + commentLen
  }

  // نسبة الفكّ. مئةٌ سخيّة: مستند Office حقيقي نادراً يتجاوز عشرين.
  if (totalComp > 0 && totalRaw / totalComp > 100) reasons.add('zip_bomb')
  if (totalRaw > 512 * 1024 * 1024) reasons.add('zip_bomb')

  return [...reasons]
}

// ---------------------------------------------------------------------------
// الصور — إعادة بناء
// ---------------------------------------------------------------------------

/**
 * PNG: إعادة ترميز فعلية.
 *
 * ليست تنظيفاً للحاوية فحسب — تُفكّ ضغط IDAT، وتُعكس مرشّحات الأسطر إلى
 * بكسلات خام، ثم يُعاد الترشيح والضغط. فما ينجو هو البكسلات وحدها: كل
 * البيانات الوصفية، وكل ما أُلحق، وأي حمولة في مقاطع نصّية — يزول.
 *
 * ومجرى IDAT مصوغٌ بعناية ليستغلّ مُفكِّك ترميز بعينه لن ينجو من فكّ وإعادة
 * ترميز بمكتبة أخرى — إما يفشل هنا فيُرفض، أو يخرج بكسلات لا ضرر فيها.
 *
 * المتشابك (Adam7) يُترك لإعادة بناء الحاوية: مساره مختلف، وهو نادر، وتنفيذه
 * على عجل أخطر من تركه.
 */
function reencodePng (buf) {
  const CRIT = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND'])
  // مقاطع تُبقى لأن العرض يعتمد عليها. ما عداها — نصوص، EXIF، ملفّات تعريف
  // ألوان مضغوطة، مقاطع مجهولة — يُسقط.
  const KEEP = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'pHYs'])

  let off = 8
  const chunks = []
  const idat = []
  let ihdr = null

  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    if (len > buf.length) return { ok: false }
    const type = buf.toString('latin1', off + 4, off + 8)
    const dataStart = off + 8
    const dataEnd = dataStart + len
    if (dataEnd + 4 > buf.length) return { ok: false }
    const data = buf.subarray(dataStart, dataEnd)

    if (type === 'IHDR') ihdr = data
    if (type === 'IDAT') idat.push(data)
    else if (CRIT.has(type) || KEEP.has(type)) chunks.push({ type, data })

    off = dataEnd + 4
    if (type === 'IEND') break
  }

  if (!ihdr || ihdr.length < 13 || !idat.length) return { ok: false }

  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const depth = ihdr[8]
  const colorType = ihdr[9]
  const interlace = ihdr[12]

  if (!width || !height || width > 20000 || height > 20000) return { ok: false }
  if (interlace !== 0) return { ok: false }         // يسقط إلى إعادة بناء الحاوية

  const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const ch = CHANNELS[colorType]
  if (!ch || ![1, 2, 4, 8, 16].includes(depth)) return { ok: false }

  const bitsPerPixel = ch * depth
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8))
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8)

  let raw
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch { return { ok: false } }
  if (raw.length < (rowBytes + 1) * height) return { ok: false }

  // عكس المرشّحات — البكسلات الحقيقية.
  const out = Buffer.allocUnsafe(rowBytes * height)
  let prev = Buffer.alloc(rowBytes)
  let p = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p]; p += 1
    const line = Buffer.from(raw.subarray(p, p + rowBytes)); p += rowBytes
    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0
      const bUp = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (filter === 1) v = (v + a) & 0xFF
      else if (filter === 2) v = (v + bUp) & 0xFF
      else if (filter === 3) v = (v + ((a + bUp) >> 1)) & 0xFF
      else if (filter === 4) {
        const pa = Math.abs(bUp - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + bUp - 2 * c)
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? bUp : c)
        v = (v + pr) & 0xFF
      } else if (filter !== 0) return { ok: false }
      line[i] = v
    }
    line.copy(out, y * rowBytes)
    prev = line
  }

  // إعادة الترشيح بـNone: البكسلات لم تتغيّر، والحجم يكبر قليلاً — وهو ثمن
  // مقبول مقابل ألّا يبقى شيء من المجرى الأصلي.
  const refiltered = Buffer.allocUnsafe((rowBytes + 1) * height)
  for (let y = 0; y < height; y += 1) {
    refiltered[y * (rowBytes + 1)] = 0
    out.copy(refiltered, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes)
  }

  const crcTable = pngCrcTable()
  const chunk = (type, data) => {
    const head = Buffer.allocUnsafe(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'latin1')
    const crcBuf = Buffer.concat([head.subarray(4), data])
    const tail = Buffer.allocUnsafe(4)
    tail.writeUInt32BE(pngCrc(crcBuf, crcTable) >>> 0, 0)
    return Buffer.concat([head, data, tail])
  }

  const parts = [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])]
  parts.push(chunk('IHDR', ihdr.subarray(0, 13)))
  for (const c of chunks) {
    if (c.type === 'IHDR' || c.type === 'IEND') continue
    parts.push(chunk(c.type, c.data))
  }
  parts.push(chunk('IDAT', deflateSync(refiltered, { level: 9 })))
  parts.push(chunk('IEND', Buffer.alloc(0)))

  return { ok: true, buf: Buffer.concat(parts), method: 'png_reencode' }
}

let CRC_TABLE = null
function pngCrcTable () {
  if (CRC_TABLE) return CRC_TABLE
  CRC_TABLE = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    CRC_TABLE[n] = c
  }
  return CRC_TABLE
}
function pngCrc (buf, table) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return c ^ 0xFFFFFFFF
}

/**
 * PNG: إعادة بناء الحاوية — للمتشابك وما تعذّر ترميزه.
 *
 * تُبقي المقاطع اللازمة للعرض وتُسقط ما عداها، وتقطع كل ما بعد IEND. لا تمسّ
 * مجرى البكسلات، فهي أضعف من إعادة الترميز — وتُسمّى باسمها في النتيجة.
 */
function rebuildPngContainer (buf) {
  const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'pHYs'])
  let off = 8
  const parts = [buf.subarray(0, 8)]
  let sawIend = false
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off)
    if (len > buf.length) return { ok: false }
    const type = buf.toString('latin1', off + 4, off + 8)
    const end = off + 12 + len
    if (end > buf.length) return { ok: false }
    if (KEEP.has(type)) parts.push(buf.subarray(off, end))
    off = end
    if (type === 'IEND') { sawIend = true; break }
  }
  if (!sawIend) return { ok: false }
  return { ok: true, buf: Buffer.concat(parts), method: 'png_container' }
}

/**
 * JPEG: إعادة بناء الحاوية.
 *
 * إعادة الترميز الحقيقية تحتاج DCT كاملاً — وكتابته هنا خطأ. فالمُنفَّذ:
 * تُقرأ المقاطع واحداً واحداً، ويُبقى ما يلزم فكّ الترميز، ويُسقط كل APP
 * (وفيه EXIF وXMP وهما موضع الحمولات المعتادة) وكل تعليق، ويُقطع ما بعد EOI.
 *
 * حدُّها معلوم: مجرى الإنتروبيا يمرّ كما هو. تُسمّى `jpeg_container` لا
 * «إعادة ترميز».
 */
function rebuildJpeg (buf) {
  if (!(buf[0] === 0xFF && buf[1] === 0xD8)) return { ok: false }
  const parts = [Buffer.from([0xFF, 0xD8])]
  let i = 2
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xFF) return { ok: false }
    let marker = buf[i + 1]
    while (marker === 0xFF && i + 2 < buf.length) { i += 1; marker = buf[i + 1] }

    if (marker === 0xD9) { parts.push(Buffer.from([0xFF, 0xD9])); return { ok: true, buf: Buffer.concat(parts), method: 'jpeg_container' } }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue }

    const len = buf.readUInt16BE(i + 2)
    if (len < 2 || i + 2 + len > buf.length) return { ok: false }
    const seg = buf.subarray(i, i + 2 + len)

    // APP1..APP15 و COM تُسقط. APP0 (JFIF) يبقى — بعض القارئات تتوقّعه.
    const drop = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE
    if (!drop) parts.push(seg)

    i += 2 + len

    // بداية المسح: يتبعها مجرى الإنتروبيا حتى EOI. يُنسخ كما هو ثم يُنتهى.
    if (marker === 0xDA) {
      let j = i
      while (j + 1 < buf.length) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) break
        j += 1
      }
      if (j + 1 >= buf.length) return { ok: false }        // بلا EOI
      parts.push(buf.subarray(i, j))
      parts.push(Buffer.from([0xFF, 0xD9]))
      return { ok: true, buf: Buffer.concat(parts), method: 'jpeg_container' }
    }
  }
  return { ok: false }
}

/**
 * WEBP: قطعٌ عند الطول المُعلَن، وإسقاط المقاطع الوصفية.
 */
function rebuildWebp (buf) {
  if (buf.length < 12) return { ok: false }
  const riffSize = buf.readUInt32LE(4)
  const total = Math.min(buf.length, riffSize + 8)
  if (total < 12) return { ok: false }

  const KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF'])
  const parts = []
  let off = 12
  while (off + 8 <= total) {
    const type = buf.toString('latin1', off, off + 4)
    const len = buf.readUInt32LE(off + 4)
    const end = off + 8 + len + (len % 2)
    if (end > total) break
    if (KEEP.has(type)) parts.push(buf.subarray(off, end))
    off = end
  }
  if (!parts.length) return { ok: false }

  const body = Buffer.concat(parts)
  const head = Buffer.allocUnsafe(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(body.length + 4, 4)
  head.write('WEBP', 8, 'latin1')
  return { ok: true, buf: Buffer.concat([head, body]), method: 'webp_container' }
}

/** بيانات بعد نهاية الصورة المنطقية — تُكتشف قبل إعادة البناء لأنها تُبلَّغ. */
function imageTrailing (buf, type) {
  if (type === 'png') {
    const i = buf.lastIndexOf('IEND', buf.length, 'latin1')
    return i >= 0 && buf.length > i + 8
  }
  if (type === 'jpeg') {
    for (let j = buf.length - 2; j >= 2; j -= 1) {
      if (buf[j] === 0xFF && buf[j + 1] === 0xD9) return j + 2 < buf.length
    }
    return false
  }
  if (type === 'webp') return buf.length > buf.readUInt32LE(4) + 8
  if (type === 'gif') {
    const i = buf.lastIndexOf(0x3B)
    return i >= 0 && i + 1 < buf.length
  }
  return false
}

/** توقيع صيغة أخرى في أول الملف أو آخره — موضع الـpolyglot العملي. */
function secondarySignature (buf, type) {
  const EDGE = 2048
  const regions = [buf.subarray(0, Math.min(EDGE, buf.length))]
  if (buf.length > EDGE) regions.push(buf.subarray(buf.length - EDGE))

  for (const r of regions) {
    for (const s of SIGNATURES) {
      if (s.type === type) continue
      // التوقيع في أول الملف هو نوع الملف نفسه، لا توقيعاً ثانوياً.
      const at = r.indexOf(s.magic)
      if (at < 0) continue
      if (r === regions[0] && at === 0) continue
      if (DANGEROUS_TYPE[s.type] || s.type === 'zip') return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// الحكم
// ---------------------------------------------------------------------------

/**
 * يفحص ملفاً ويُرجع حكماً.
 *
 * `{ verdict, reasons, detectedType, sha256, size, bytes, sanitized }`
 *
 * `verdict` واحد من `clean` أو `rejected`. ولا وجود لـ«مقبول بتحفّظ»: القرار
 * ثنائي عند البوّابة، والمراجعة البشرية تأتي بعد القبول لا بدلاً منه.
 *
 * وأي استثناء غير متوقّع يُترك ليصعد — المنادي يحوّله إلى `error`، والملف
 * يبقى في الحجر. الفشل مُغلَق: نظامٌ يمرّر عند تعطّل الفاحص يُهاجَم بتعطيله.
 */
export function scanFile (buf, {
  declaredMime = null,
  allow = ['pdf', 'png', 'jpeg', 'webp'],
  maxBytes = MAX_BYTES,
} = {}) {
  const reasons = new Set()

  if (!buf || buf.length === 0) {
    return { verdict: 'rejected', reasons: ['empty'], detectedType: null, size: 0 }
  }
  if (buf.length > maxBytes) {
    return { verdict: 'rejected', reasons: ['too_large'], detectedType: null, size: buf.length }
  }

  const digest = sha256(buf)
  const type = detectType(buf)
  const base = { detectedType: type, sha256: digest, size: buf.length }

  if (!type) return { verdict: 'rejected', reasons: ['unknown_type'], ...base }

  // ما يُرفض بمعرفته وحدها.
  if (DANGEROUS_TYPE[type]) {
    return { verdict: 'rejected', reasons: [DANGEROUS_TYPE[type]], ...base }
  }

  // الأرشيف يُفحص ليُسمّى سببه، حتى وهو خارج قائمة السماح.
  if (type === 'zip') {
    const zipReasons = scanZip(buf)
    return { verdict: 'rejected', reasons: ['archive', ...zipReasons], ...base }
  }

  if (!allow.includes(type)) {
    return { verdict: 'rejected', reasons: ['type_not_allowed'], ...base }
  }

  // النوع المُعلَن يخالف المحتوى: ليس خطأ تسمية بل ادّعاء.
  if (declaredMime) {
    const expected = SIGNATURES.find((s) => s.type === type)?.mime
    const d = String(declaredMime).toLowerCase().split(';')[0].trim()
    if (expected && d && d !== expected) reasons.add('declared_mismatch')
  }

  let sanitized = null

  if (type === 'pdf') {
    for (const r of scanPdf(buf)) reasons.add(r)
    if (secondarySignature(buf, type)) reasons.add('polyglot')
  } else {
    if (imageTrailing(buf, type)) reasons.add('trailing_data')
    if (secondarySignature(buf, type)) reasons.add('polyglot')

    let rebuilt = { ok: false }
    if (type === 'png') {
      rebuilt = reencodePng(buf)
      if (!rebuilt.ok) rebuilt = rebuildPngContainer(buf)
    } else if (type === 'jpeg') rebuilt = rebuildJpeg(buf)
    else if (type === 'webp') rebuilt = rebuildWebp(buf)

    if (!rebuilt.ok) reasons.add('image_malformed')
    else sanitized = { bytes: rebuilt.buf, method: rebuilt.method }
  }

  // بيانات زائدة على صورة أُعيد بناؤها لم تعد موجودة في المخرَج — لكن وجودها
  // في الأصل يبقى سبباً للرفض: من ألحق بايتات بصورة لم يفعلها سهواً.
  if (reasons.size > 0) return { verdict: 'rejected', reasons: [...reasons], ...base }

  return { verdict: 'clean', reasons: [], sanitized, ...base }
}
