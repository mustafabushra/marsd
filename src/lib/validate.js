/**
 * قواعد المدخلات — مصدر واحد.
 *
 * ============================================================================
 * لماذا هنا لا في كل نموذج
 * ============================================================================
 * القاعدة المكتوبة مرّتين تفترق مرّة. حدث هذا في مرصد بخريطة أنواع المستندات:
 * نسختان، نُسيت إحداها، فظهر المفتاح الإنجليزي الخام للمراجع وفي إشعارات
 * الشركات. القواعد أدناه تُستورد ولا تُنسخ.
 *
 * ============================================================================
 * وما يقابلها في القاعدة
 * ============================================================================
 * هذه طبقة أولى تُحسّن التجربة وتردّ أوضح الأخطاء مبكراً. الطبقة التي لا
 * تُتجاوَز هي قيود CHECK في قاعدة البيانات — راجع migration 173. عميلٌ يُعدَّل
 * أو طلبٌ يُصاغ بيد لا يمرّ من هنا أصلاً، ولهذا لا يُعتمد على هذا الملف وحده.
 */

// ---------------------------------------------------------------------------
// الهويّات
// ---------------------------------------------------------------------------

/**
 * الرقم الموحّد للمنشأة: عشرة أرقام تبدأ بـ 70.
 *
 * البادئة ليست تجميلاً — هي ما يفرّقه عن رقم السجل التجاري، وكلاهما عشرة
 * أرقام. خلطهما يربط تقريراً بشركة أخرى.
 */
export const UNIFIED_NUMBER = /^70\d{8}$/

/** السجل التجاري: عشرة أرقام. */
export const CR_NUMBER = /^\d{10}$/

/**
 * أرقام يفصلها مسافة أو شرطة — لا تسبقها ولا تتبعها.
 *
 * الناس يكتبون «1010 101010» و«1010-101010»، فالفاصل تنسيقٌ يُقبل. أما
 * الشرطة في الأول فعلامةُ سالب لا تنسيق: قبولها كان يمرّر «-1234567890»
 * سجلّاً تجارياً صحيحاً بعد أن تبتلع digitsOnly العلامة.
 */
const SEPARATED_DIGITS = /^\d+(?:[\s-]\d+)*$/

/**
 * جوّال سعودي: 05xxxxxxxx محلياً، أو +9665xxxxxxxx دولياً.
 *
 * يُقبل الشكلان لأن الناس يكتبون ما اعتادوه، ويُوحَّدان بـ normalizePhone قبل
 * التخزين — رقمان بصيغتين ليسا رقمين.
 */
export const SAUDI_PHONE = /^(?:05\d{8}|\+9665\d{8}|9665\d{8})$/

/** بريد إلكتروني — تحقّق بنيوي لا قاطع؛ القاطع هو أن يصل الإشعار. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

// ---------------------------------------------------------------------------
// أدوات
// ---------------------------------------------------------------------------

/** الأرقام العربية-الهندية إلى لاتينية. المستخدم يكتب ٧٠٠ ونحن نخزّن 700. */
export const toLatinDigits = (s) => String(s ?? '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))

/** يُزيل كل ما ليس رقماً، بعد توحيد الأرقام. */
export const digitsOnly = (s) => toLatinDigits(s).replace(/\D/g, '')

/** إلى الصيغة المحلية 05xxxxxxxx، أو null إن لم يكن جوّالاً سعودياً. */
export const normalizePhone = (s) => {
  const d = digitsOnly(s)
  const local = d.startsWith('966') ? `0${d.slice(3)}` : d
  return /^05\d{8}$/.test(local) ? local : null
}

/**
 * تشذيب نصّ حرّ قبل التخزين.
 *
 * يزيل محارف التحكّم والمحارف الصفرية العرض — وهي التي تُخفي محتوى في اسم
 * يبدو سليماً — ويقصّ الطول. لا يُزيل وسوم HTML: React يهرّب النصّ عند
 * العرض، وإزالتها هنا تُفسد اسماً فيه < أو & بلا سبب.
 */
export const cleanText = (s, max = 500) => String(s ?? '')
  // محارف التحكّم — تُصبح مسافة لا تُحذف، فحذفها يلصق كلمتين.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  // صفرية العرض ومحدّدات الاتجاه: تُخفي محتوى داخل نصّ يبدو سليماً،
  // فاسمٌ يُقرأ «شركة أ» قد يحمل حروفاً لا تظهر.
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

// ---------------------------------------------------------------------------
// الحدود — مرآة لقيود القاعدة
// ---------------------------------------------------------------------------

/**
 * أطوال الحقول كما تفرضها القاعدة في migration 177.
 *
 * تُستورد في الواجهة لتوضع في maxLength. والغرض ليس الحماية — القاعدة تحمي —
 * بل ألّا تختلف الطبقتان: حقلٌ يقبل 3000 حرفاً وعمودٌ يرفض ما زاد عن 1000
 * ينتهي برسالة Postgres خام في وجه المستخدم بعد أن كتب صفحتين.
 *
 * كل رقم هنا يقابل قيد \u200E<table>_<column>_maxlen\u200E. تغييرُ أحدهما بلا الآخر
 * يكشفه \u200Enpm run check:limits\u200E.
 */
export const LIMITS = {
  // نصوص حرّة طويلة
  description: 5000,     // reports.description · clarification_requests.details
  details: 5000,         // support_tickets.details
  resolution: 5000,      // support_tickets.resolution
  // أسباب وملاحظات
  reason: 1000,          // *_reason · disputes.reason
  note: 1000,            // *_note · reports.notes
  // قوائم مركّبة
  list: 2000,            // previous_names · sub_activities · keywords
  // مفردات — كل حدّ ≤ أضيق عمود يستقبله، لا فوقه
  name: 200,             // partner_applications.contact_name = 200
  label: 100,            // cr_type · entity_type · region · city = 100
  email: 255,            // companies.official_email varchar(255)
  phone: 20,             // tenants.phone varchar(20) — و\u200E+966512345678\u200E ثلاثة عشر
  website: 255,          // companies.website varchar(255)
  url: 2048,             // أعمدة الروابط النصّية (لا حقول الواجهة)
  actor: 255,            // معرّف Clerk نصّي
  // هويّات: عشرة أرقام، والفائض متّسع للفواصل التي يكتبها الناس
  identifier: 20,        // companies.cr_number varchar(20)
  money: 20,             // مبلغ يُكتب نصّاً قبل تحويله
  // بحث لا يُخزَّن — حدّ يمنع طلباً ضخماً لا أكثر
  search: 120,
}

// ---------------------------------------------------------------------------
// روابط وتواريخ وأرقام
// ---------------------------------------------------------------------------

/** بروتوكولات تُنفَّذ سكربتاً عند فتحها. */
const EXECUTABLE_SCHEME = /^(javascript|vbscript|file|about|blob):/i

/**
 * الشكل الذي يقرأ به المتصفّح البروتوكول.
 *
 * المتصفّحات تُسقط المسافات ومحارف التحكّم من داخل اسم البروتوكول قبل
 * تنفيذه، فـ "java\nscript:alert(1)" يُنفَّذ فعلاً — ونمطٌ يفحص النصّ كما
 * ورد يمرّره. ولهذا تُنزع تلك المحارف قبل الفحص لا بعده.
 */
const schemeView = (s) => String(s ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0020\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
  .toLowerCase()

/** أنواع data: التي لا تُنفِّذ شيئاً — نفس ما يسمح به DocumentViewer. */
const SAFE_DATA = /^data:(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf)[;,]/i

/**
 * هل هذا الرابط آمن للتخزين والعرض؟
 *
 * \u200Ejavascript:\u200E في حقل يُعرض كرابط هو XSS مخزَّن مكتمل. و\u200Edata:text/html\u200E مثله،
 * و\u200Edata:image/svg+xml\u200E كذلك — فـ SVG مستند يُنفّذ سكربتاً، لا صورة.
 *
 * لا يُفحص المضيف هنا: منع SSRF شأن الخادم، لأن العميل لا يجلب الرابط.
 */
export const isSafeUrl = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return true
  const view = schemeView(s)
  if (EXECUTABLE_SCHEME.test(view)) return false
  if (view.startsWith('data:')) return SAFE_DATA.test(view)
  return true
}

/**
 * تاريخ تقويمي حقيقي.
 *
 * \u200Enew Date('2026-02-30')\u200E لا يرمي خطأً — يُرجع الأول من مارس. فالتحقّق أن
 * الأجزاء تعود كما دخلت، لا أن البناء نجح.
 */
export const isRealDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return false
  const [, y, mo, d] = m.map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/**
 * مبلغ مالي.
 *
 * يرفض السالب و NaN و Infinity — و\u200ENumber('')\u200E الذي يساوي صفراً بصمت. ويُبقي
 * القيمة نصّاً للمنادي كي يخزّنها في numeric بلا مرورٍ بـ float.
 */
export const isMoney = (v, { max = 1e12 } = {}) => {
  const s = toLatinDigits(v).trim()
  if (!s) return false
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= max
}

// ---------------------------------------------------------------------------
// الواجهة
// ---------------------------------------------------------------------------

/** يُرجع رسالة خطأ، أو null إن كانت القيمة مقبولة. */
export const validate = {
  unifiedNumber: (v) => {
    const s = toLatinDigits(v).trim()
    if (!s) return 'الرقم الموحّد مطلوب'
    if (!SEPARATED_DIGITS.test(s)) return 'الرقم الموحّد أرقام فقط'
    const d = s.replace(/[\s-]/g, '')
    if (!/^\d{10}$/.test(d)) return 'الرقم الموحّد عشرة أرقام'
    if (!d.startsWith('70')) return 'الرقم الموحّد يبدأ بـ 70'
    return null
  },
  crNumber: (v) => {
    const s = toLatinDigits(v).trim()
    if (!s) return 'رقم السجل التجاري مطلوب'
    // المسافة والشرطة تنسيقٌ يكتبه الناس: «1010 101010» رقمٌ واحد. أما ما عداهما
    // فليس تنسيقاً — و digitsOnly وحدها كانت تبلع علامة السالب فيمرّ
    // «-1234567890» سجلّاً صحيحاً.
    if (!SEPARATED_DIGITS.test(s)) return 'رقم السجل التجاري أرقام فقط'
    if (!CR_NUMBER.test(s.replace(/[\s-]/g, ''))) return 'رقم السجل التجاري عشرة أرقام'
    return null
  },
  phone: (v) => (normalizePhone(v) ? null : 'رقم جوّال سعودي يبدأ بـ 05'),
  email: (v) => (EMAIL.test(String(v ?? '').trim()) ? null : 'بريد إلكتروني غير صالح'),
  text: (v, { min = 0, max = 500, label = 'الحقل' } = {}) => {
    const t = cleanText(v, max + 1)
    if (t.length < min) return `${label} لا يقل عن ${min} حرفاً`
    if (t.length > max) return `${label} لا يزيد عن ${max} حرفاً`
    return null
  },
  url: (v, { required = false } = {}) => {
    const s = String(v ?? '').trim()
    if (!s) return required ? 'الرابط مطلوب' : null
    if (!isSafeUrl(s)) return 'رابط غير مقبول'
    if (s.length > LIMITS.url) return `الرابط لا يزيد عن ${LIMITS.url} حرفاً`
    return null
  },
  date: (v, { required = false, min, max, label = 'التاريخ' } = {}) => {
    const s = String(v ?? '').trim()
    if (!s) return required ? `${label} مطلوب` : null
    if (!isRealDate(s)) return `${label} غير صالح`
    if (min && s < min) return `${label} أقدم من المسموح`
    if (max && s > max) return `${label} في المستقبل`
    return null
  },
  money: (v, { required = false, max = 1e12, label = 'المبلغ' } = {}) => {
    const s = String(v ?? '').trim()
    if (!s) return required ? `${label} مطلوب` : null
    if (!isMoney(s, { max })) return `${label} يجب أن يكون رقماً موجباً`
    return null
  },
  /** قيمة ضمن مجموعة معروفة — قائمةُ سماح لا قائمةَ منع. */
  oneOf: (v, allowed, label = 'القيمة') =>
    (allowed.includes(v) ? null : `${label} غير مقبولة`),
}
