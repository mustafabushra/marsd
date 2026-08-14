/**
 * ما الذي يكونه هذا الملف فعلاً؟
 *
 * ============================================================================
 * لماذا لا يكفي النوع المُعلَن
 * ============================================================================
 * `allowed_mime_types` في دلاء Supabase يفحص الترويسة التي يرسلها العميل، و
 * `<input accept>` اقتراحٌ لمربّع اختيار الملف لا قيد. كلاهما يقول ما ادّعاه
 * المُرسِل، لا ما في الملف. من يصوغ الطلب بيد يكتب `application/pdf` فوق أي
 * محتوى.
 *
 * فهذا يقرأ أول بايتات الملف — التوقيع الذي يبدأ به كل صيغة — ويقارنه بما
 * ادُّعي. ملفٌ توقيعه MZ ليس PDF مهما قال العميل.
 *
 * ============================================================================
 * حدود هذه الطبقة
 * ============================================================================
 * تجري في المتصفح، فهي تمنع الخطأ والمحاولة العابرة لا خصماً مصمّماً — من
 * يتجاوز الواجهة يتجاوزها. الطبقة التي لا تُتجاوَز هي قيود الدلو في Supabase
 * وسياسات Storage، وفحصُ محتوى على خادم إن أُضيف لاحقاً. وجودها هنا يعني أن
 * الملف الخبيث يُردّ قبل أن يُرفع أصلاً، فلا يصل إلى مكان يحتاج تنظيفاً.
 */

/** التواقيع المقبولة — أول بايتات كل صيغة. */
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },          // %PDF
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },                // GIF8
  // WEBP: "RIFF" ثم أربعة بايتات حجم ثم "WEBP" — الفحص على الجزأين معاً.
  { mime: 'image/webp', ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] },
]

/**
 * تواقيع تُرفض صراحةً، مهما كان الاسم أو النوع المُعلَن.
 *
 * تُسمّى لأن رسالة «نوع غير مدعوم» على ملف تنفيذي تُقرأ كعُطل في الرفع، بينما
 * «ملف تنفيذي» تقول للمستخدم ما حدث — ولمن يحاول أن المحاولة رُئيت.
 */
const DANGEROUS = [
  { label: 'ملف تنفيذي (Windows)', bytes: [0x4D, 0x5A] },                            // MZ
  { label: 'ملف تنفيذي (Linux)', bytes: [0x7F, 0x45, 0x4C, 0x46] },                  // ELF
  { label: 'ملف تنفيذي (macOS)', bytes: [0xCF, 0xFA, 0xED, 0xFE] },
  { label: 'أرشيف مضغوط', bytes: [0x50, 0x4B, 0x03, 0x04] },                          // PK — يشمل docx/xlsx
  { label: 'أرشيف RAR', bytes: [0x52, 0x61, 0x72, 0x21] },
  { label: 'برنامج نصّي', bytes: [0x23, 0x21] },                                      // #!
]

const startsWith = (buf, bytes, offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b)

/** أول ست عشرة بايتة تكفي لكل التواقيع أعلاه. */
const head = async (file) =>
  new Uint8Array(await file.slice(0, 16).arrayBuffer())

/**
 * يفحص ملفاً واحداً.
 *
 * يُرجع `{ ok: true, mime }` أو `{ ok: false, reason }` — والسبب بالعربية لأنه
 * يُعرض كما هو.
 */
export async function inspectFile (file, {
  maxBytes = 10 * 1024 * 1024,
  allow = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
} = {}) {
  if (!file || typeof file.slice !== 'function') {
    return { ok: false, reason: 'ملف غير صالح' }
  }
  if (file.size === 0) return { ok: false, reason: 'الملف فارغ' }
  if (file.size > maxBytes) {
    return { ok: false, reason: `أكبر من ${Math.round(maxBytes / 1048576)} م.ب` }
  }

  // اسم فيه فاصل مسار أو صعود مجلّد — لا يُستعمل الاسم في المسار أصلاً، لكن
  // ردّه هنا يمنع تسرّبه إلى سجلّ أو ترويسة لاحقاً.
  if (/[/\\]|\.\./.test(file.name || '')) {
    return { ok: false, reason: 'اسم الملف يحوي مساراً' }
  }

  const buf = await head(file)

  for (const d of DANGEROUS) {
    if (startsWith(buf, d.bytes)) return { ok: false, reason: d.label }
  }

  const match = SIGNATURES.find((s) =>
    startsWith(buf, s.bytes) && (!s.at8 || startsWith(buf, s.at8, 8)))

  if (!match) return { ok: false, reason: 'محتوى الملف لا يطابق أي صيغة مدعومة' }
  if (!allow.includes(match.mime)) {
    return { ok: false, reason: 'صيغة غير مسموحة — PDF أو صورة فقط' }
  }

  // النوع المُعلَن يخالف المحتوى: ملفٌ سُمّي .pdf وهو صورة يمرّ بلا ضرر — لكن
  // إعلان النوع خلاف المحتوى علامةُ محاولةٍ لا خطأِ تسمية.
  const declared = (file.type || '').toLowerCase()
  if (declared && declared !== match.mime && allow.includes(declared)) {
    return { ok: false, reason: 'نوع الملف المُعلَن يخالف محتواه' }
  }

  return { ok: true, mime: match.mime, ext: match.ext }
}

/**
 * اسم تخزين عشوائي — لا يُشتقّ من اسم المستخدم إطلاقاً.
 *
 * الوسيط امتدادٌ لا اسم ملف: `safeStorageName(inspect.ext)`. لكنه مُصدَّر، ومن
 * يمرّر `file.name.split('.').pop()` يوماً — وهي عادة شائعة — يمرّر معها
 * `../../etc/passwd` إن كان الاسم كذلك، فيصير مفتاح التخزين مساراً صاعداً.
 *
 * فيُقصر الامتداد هنا على حروف وأرقام لاتينية، لا لأن المنادي اليوم يخطئ، بل
 * لأن الدالة يجب أن تكون آمنة بأي وسيط — الأمان الذي يعتمد على أدب المنادي
 * ليس أماناً.
 */
export const safeStorageName = (ext) => {
  const rnd = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('')
  // آخر مقطع بعد نقطة، ثم ما بقي من [a-z0-9] فقط.
  const raw = String(ext ?? '').toLowerCase().split('.').pop() || ''
  const safe = raw.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  return `${Date.now().toString(36)}-${hex}.${safe}`
}
