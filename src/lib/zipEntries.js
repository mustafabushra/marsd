/**
 * قراءة فهرس أرشيف ZIP بلا فكّ ضغط.
 *
 * ============================================================================
 * لماذا يُقرأ الفهرس ولا يُفكّ الأرشيف
 * ============================================================================
 * قنبلة الضغط تُقاس من الأرقام المُعلَنة في الفهرس، لا بفكّها — فالفكّ هو
 * الهجوم نفسه. ملفٌ حجمه ميغابايت يُعلن أنه يفكّ إلى خمسين غيغابايت، ومن
 * يفكّه ليعرف يكون قد وقع فيه.
 *
 * ============================================================================
 * ولماذا هنا وفي api/_lib/fileScan.js كليهما
 * ============================================================================
 * ليست نسخة مكرّرة بلا سبب. المُحلِّل واحد والسياستان مختلفتان:
 *
 *   البوّابة (الخادم)  ترفض كل أرشيف — لا مستند من مستندات مرصد أرشيف
 *   هذا (المتصفّح)     يقبل xlsx ويفحصه — دليل الأنشطة يصل كذلك
 *
 * ونسخة الخادم لا تستورد من هنا عمداً: كل رفع في مرصد يمرّ بها الآن، وإضافة
 * مسار استيراد جديد إلى شجرة اعتمادها مخاطرةٌ في نشرٍ لا تستحقّها إزالةُ
 * ثمانين سطراً.
 *
 * يعمل على Uint8Array — بلا Buffer، فلا اعتماد على Node.
 */

const u32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24 >>> 0)
const u16 = (b, o) => b[o] | (b[o + 1] << 8)

/**
 * يُرجع `{ ok, entries, reason }`.
 *
 * `entries`: `[{ name, compressedSize, uncompressedSize }]`
 *
 * و`ok: false` حين يتعذّر قراءة الفهرس — وهو نفسه سبب رفض: أرشيفٌ لا يُقرأ
 * فهرسه لا يُوثق بشيء منه.
 */
export function readZipEntries (bytes, { maxEntries = 5000 } = {}) {
  if (!(bytes instanceof Uint8Array)) return { ok: false, reason: 'ليس بايتات' }
  if (bytes.length < 22) return { ok: false, reason: 'أصغر من أن يكون أرشيفاً' }

  // نهاية الفهرس المركزي: PK\x05\x06. يُبحث عنها من الآخر لأن بعدها تعليقٌ
  // اختياري طوله حتى ٦٥ ألف بايتة.
  let eocd = -1
  const floor = Math.max(0, bytes.length - 66_000)
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B
        && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break }
  }
  if (eocd < 0) return { ok: false, reason: 'لا فهرس مركزي — الملف تالف أو ليس أرشيفاً' }

  const count = u16(bytes, eocd + 10)
  let off = u32(bytes, eocd + 16)
  if (count > maxEntries) return { ok: false, reason: `عدد المدخلات غير معقول (${count})` }

  const entries = []
  const decoder = new TextDecoder('utf-8', { fatal: false })

  for (let n = 0; n < count; n += 1) {
    if (off + 46 > bytes.length) return { ok: false, reason: 'الفهرس مقطوع' }
    if (u32(bytes, off) !== 0x02014b50) return { ok: false, reason: 'الفهرس مشوّه' }

    const compressedSize = u32(bytes, off + 20) >>> 0
    const uncompressedSize = u32(bytes, off + 24) >>> 0
    const nameLen = u16(bytes, off + 28)
    const extraLen = u16(bytes, off + 30)
    const commentLen = u16(bytes, off + 32)

    if (off + 46 + nameLen > bytes.length) return { ok: false, reason: 'الفهرس مقطوع' }
    entries.push({
      name: decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen)),
      compressedSize,
      uncompressedSize,
    })
    off += 46 + nameLen + extraLen + commentLen
  }

  return { ok: true, entries }
}

/** أسماء تعني أن المصنّف يحمل شيئاً يعمل، لا بيانات. */
const ACTIVE = /(^|\/)(vbaProject\.bin|vbaData\.xml)$/i
const EXECUTABLE = /\.(exe|dll|scr|com|js|jse|vbs|vbe|wsf|ps1|bat|cmd|sh|hta|lnk|jar|msi)$/i
const NESTED = /\.(zip|rar|7z|tar|gz|xz|cab)$/i

/**
 * سياسة مصنّف Excel: بيانات لا برنامج.
 *
 * يُرجع `null` إن كان مقبولاً، أو سبباً عربياً إن لم يكن.
 *
 * وهذا فحصٌ في المتصفّح — يمنع الخطأ والمحاولة العابرة، ولا يحلّ محلّ تحقّق
 * الخادم من الصفوف. الضمان أن الخادم يُعيد التحقّق من كل صفّ، لا أن هذا مرّ.
 */
export function inspectWorkbook (bytes, { maxRatio = 200, maxTotal = 512 * 1024 * 1024 } = {}) {
  const read = readZipEntries(bytes)
  if (!read.ok) return read.reason

  let comp = 0
  let raw = 0
  for (const e of read.entries) {
    comp += e.compressedSize
    raw += e.uncompressedSize

    if (e.name.includes('..') || e.name.startsWith('/') || /^[A-Za-z]:/.test(e.name)) {
      return 'اسم مدخل في الملف يحوي مساراً صاعداً'
    }
    if (ACTIVE.test(e.name)) return 'المصنّف يحوي ماكرو — احفظه بصيغة xlsx بلا وحدات ماكرو'
    if (EXECUTABLE.test(e.name)) return 'المصنّف يحوي ملفاً تنفيذياً'
    if (NESTED.test(e.name)) return 'المصنّف يحوي أرشيفاً داخله'
    if (/^xl\/embeddings\//i.test(e.name) || /oleObject/i.test(e.name)) {
      return 'المصنّف يحوي كائناً مضمَّناً'
    }
  }

  if (raw > maxTotal) return 'حجم المحتوى بعد الفكّ غير معقول'
  if (comp > 0 && raw / comp > maxRatio) return 'نسبة الضغط غير معقولة — الملف قد يكون قنبلة ضغط'

  // مصنّف حقيقي فيه هذه دائماً. غيابها يعني أنه ليس xlsx مهما كان امتداده.
  const names = read.entries.map((e) => e.name)
  if (!names.some((n) => /^xl\/workbook\.xml$/i.test(n))) {
    return 'ليس مصنّف Excel صالحاً'
  }

  return null
}
