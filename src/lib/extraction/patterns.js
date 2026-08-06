/**
 * Every rule the extractor knows, in one file.
 *
 * This is the file that changes when a portal is redesigned or the registry
 * adds a field. Nothing here executes logic — it is data about Saudi commercial
 * documents, kept apart from the machinery that applies it so that updating a
 * label never means editing a scorer.
 *
 * All label and keyword strings are stored **folded** (see normalizeText.js):
 * hamza flattened, taa-marbuta to haa. They are only ever compared against
 * folded text, so writing them any other way would silently never match.
 */

import { fold } from './fold.js'

/**
 * Fold a table of strings on the way in.
 *
 * Every label and vocabulary entry below is written in ordinary Arabic and
 * folded here, rather than being hand-written in folded form. Hand-folding is
 * a silent failure: «الرئيسي» and «الرييسي» look alike, a mis-typed entry
 * throws no error, and the only symptom is a field that is never extracted.
 */
const F = (list) => list.map(fold)

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------
/**
 * The bodies that issue these documents.
 *
 * A document's issuer is never its subject. «المركز السعودي للتنافسية
 * والأعمال» sits at the head of every business-platform page and reads exactly
 * like a company name — it contains «مركز» — so on a page whose layout put it
 * near the name label it won the field, and a registry entry was created for
 * the government agency instead of the business.
 *
 * Listed rather than inferred, because there is no shape that separates
 * «المركز السعودي للتنافسية والأعمال» from a real company called «المركز
 * السعودي للتدريب». Only knowing which one issues commercial registrations
 * does.
 */
export const ISSUERS = F([
  'المركز السعودي للتنافسية والأعمال',
  'المركز السعودي للأعمال',
  'المركز الوطني للتنافسية',
  'منصة الأعمال',
  'وزارة التجارة',
  'وزارة التجارة والاستثمار',
  'المملكة العربية السعودية',
  'هيئة الزكاة والضريبة والجمارك',
  'الهيئة العامة للزكاة والدخل',
  'المؤسسة العامة للتأمينات الاجتماعية',
  'وزارة الشؤون البلدية والقروية والإسكان',
  'وزارة الاستثمار',
  'الغرفة التجارية',
])

/** Lines that are the page's own furniture, matched exactly (folded). */
export const NOISE_EXACT = new Set([
  ...ISSUERS,
  ...F([
    'سياسة الخصوصية', 'الشروط والأحكام', 'جميع الحقوق محفوظة',
    'الأسئلة الشائعة', 'اتصل بنا', 'تواصل معنا', 'خريطة الموقع',
    'a', 'en', 'ar', 'العربية', 'english', 'رجوع', 'طباعة', 'تحميل',
    'نسخ', 'مشاركة', 'الرئيسية', 'تسجيل الخروج', 'حسابي',
    'شهادة السجل التجاري', 'السجل التجاري الإلكتروني',

    // Section headings.
    //
    // These are the worst kind of line to leave in: they are not values, but
    // they are not labels either, so a column block that runs
    //
    //     بيانات السجل التجاري ← heading
    //     اسم المنشأة          ← label
    //     نوع المنشأة          ← label
    //     …
    //
    // has a non-label sitting where the tokenizer expects one, and the whole
    // block fails to zip. Dropping them makes the labels contiguous, which is
    // the condition column recovery is built on.
    'بيانات السجل التجاري', 'بيانات المنشأة', 'بيانات الاتصال',
    'معلومات الاتصال', 'بيانات التواصل', 'البيانات الأساسية',
    'بيانات النشاط', 'بيانات العنوان', 'العنوان الوطني للمنشأة',
    'تفاصيل السجل', 'معلومات السجل التجاري',
  ]),
])

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------
/**
 * Words that appear in sentences and never in a value.
 *
 * A commercial registration page ends with a disclaimer — «المركز السعودي
 * للتنافسية والأعمال غير مسؤول عن أي نقص أو اختلاف في البيانات…» — and that
 * sentence contains «مركز», which is one of the words that makes a phrase read
 * like an organisation. So it scored as a company name and won, and the actual
 * company was replaced by the footer of the page it came from.
 *
 * The fix is not a list containing that one sentence. It is a test for what
 * that sentence *is*: prose. Verbs, negations and connectives below never occur
 * inside a registered name, an address, or a manager's name, so any candidate
 * carrying one is refused whatever else it scored.
 *
 * Folded on load, like every other vocabulary here.
 */
export const PROSE_MARKERS = F([
  'غير مسؤول', 'غير مسئول', 'لا يتحمل', 'إخلاء مسؤولية', 'تنويه',
  'يتم استرجاع', 'يتم الحصول', 'بالتكامل مع', 'الجهات المعنية',
  'يرجى', 'يجب على', 'يمكنك', 'للاستفسار', 'في حال', 'عند الحاجة',
  'هذه الوثيقة', 'هذا المستند', 'هذه الشهادة', 'صادرة عن', 'تم إصدار',
  'وفقاً لنظام', 'بموجب نظام', 'لا يعد', 'لا تعد', 'لا يعتبر',
  'أي نقص', 'أو اختلاف', 'جميع الحقوق', 'يخضع لأحكام',
])

/** Structural limits. Past these a value is a sentence, not a field. */
export const PROSE = {
  /** A registered Saudi name is long, but not this long. */
  maxNameChars: 120,
  maxNameWords: 14,
  /** An address can ramble; a paragraph cannot. */
  maxAddressChars: 160,
  /** A person's name. */
  maxPersonWords: 6,
}

/** Lines that are noise by shape rather than by exact text. */
export const NOISE_LINES = [
  /^الاصدار\b/,
  /^تطوير\b/,
  /^جميع الحقوق/,
  /^حقوق النشر/,
  /^copyright/i,
  /^©/,
  // Punctuation or symbols only. Written with Unicode properties, not \W:
  // \W is ASCII-based, so every Arabic letter counts as a non-word character
  // and /^\W+$/ silently deletes the entire document.
  /^[^\p{L}\p{N}]+$/u,
  /^صفحه \d+/,
  /^\d+\s*\/\s*\d+$/,     // "1 / 4" pagers

  // The portal's disclaimer, dropped before it can be scored at all. The prose
  // test in the scorers is the general defence; this is the specific line that
  // sits on every page of the source people paste most, and there is no reason
  // to let it reach a scorer in the first place.
  /غير مس(ؤ|ئ)ول عن/,
  /يتم استرجاع البيانات/,
  /بالتكامل مع الجهات/,
  /اخلاء (المس(ؤ|ئ)وليه|مس(ؤ|ئ)وليه)/,
]

// ---------------------------------------------------------------------------
// Saudi identifiers
// ---------------------------------------------------------------------------
// Deliberately loose. The registry's numbering has changed before, and a rule
// that refuses an unfamiliar shape turns a redesign into a total failure. Each
// of these is a *signal* — the scorers lower a score when a shape does not fit
// rather than discarding the candidate.

/** Any standalone run of digits, with the separators people paste around. */
export const DIGIT_RUN = /\d[\d\s\-—]*\d|\d/g

export const RE = {
  /** 10 digits starting with 7 — the unified number (الرقم الموحد). */
  unified10: /^7\d{9}$/,
  /** 10 digits not starting with 7 — a commercial registration. */
  cr10: /^\d{10}$/,
  /** 15 digits opening and closing with 3 — the VAT number. */
  vat15: /^3\d{13}3$/,
  /** Saudi mobile, in every form people paste it. */
  phone: /^(?:\+?9665\d{8}|009665\d{8}|05\d{8}|5\d{8})$/,
  /** Landline: 01x + 7 digits. */
  landline: /^0(?:1[1-7]|1)\d{7}$/,
  postal: /^\d{5}$/,
  /** National short address: four Latin letters then four digits. */
  shortAddress: /^[A-Z]{4}\d{4}$/i,
  /** A bare four-digit year — never a registration number. */
  year: /^(?:19|20)\d{2}$/,
  hijriYear: /^1[3-5]\d{2}$/,
  /** ISIC activity code: four digits or more, usually six. */
  isic: /^\d{4,7}$/,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  url: /(?:https?:\/\/|www\.)[^\s،]+/i,
  /** Money: digits with optional grouping and decimals. */
  amount: /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/,
}

/** Currency words that mark a number as capital rather than a code. */
export const CURRENCY = F(['ريال', 'ر.س', 'رس', 'sar', 'sr', 'ريال سعودي'])

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
// Order matters within a field: the longest, most specific wording is listed
// first so that «تاريخ انتهاء السجل التجاري» is not matched by the shorter
// «تاريخ انتهاء» belonging to a different field.

export const LABELS = Object.fromEntries(
  Object.entries({
  company_name_ar: ['اسم المنشأة', 'اسم الشركة', 'الاسم التجاري', 'اسم السجل التجاري', 'اسم السجل', 'الاسم بالعربي', 'الاسم التجاري للمنشأة', 'الاسم'],
  company_name_en: ['الاسم بالإنجليزي', 'الاسم التجاري بالإنجليزية', 'الاسم بالإنجليزية', 'english name', 'trade name', 'company name'],
  cr_number: ['رقم السجل التجاري', 'رقم السجل', 'السجل التجاري', 'رقم القيد', 'رقم السجل الرئيسي'],
  unified_number: ['الرقم الوطني الموحد للمنشأة', 'الرقم الوطني الموحد', 'الرقم الموحد للمنشأة', 'الرقم الموحد', 'المعرف الموحد', 'رقم 700'],
  vat_number: ['الرقم الضريبي', 'رقم التسجيل الضريبي', 'ضريبة القيمة المضافة', 'الرقم الضريبي للمنشأة'],
  entity_type: ['نوع المنشأة', 'الكيان القانوني', 'نوع الكيان', 'كيان المنشأة'],
  // Separate from entity_type. A registration prints both — «نوع المنشأة: شركة»
  // and «نوع الشركة: ذات مسؤولية محدودة» — and they answer different questions.
  company_type: ['نوع الشركة', 'الشكل القانوني للشركة', 'الشكل القانوني'],
  cr_status: ['حالة السجل التجاري', 'حالة السجل', 'حالة المنشأة', 'الحالة'],
  capital: ['قيمة رأس المال الكلي', 'رأس المال المدفوع', 'رأس مال الشركة', 'رأس المال الكلي', 'رأس المال'],
  manager_name: ['اسم المدير', 'المدير', 'المديرين', 'المديرون', 'المدراء', 'مدير الشركة', 'الملاك والمديرين', 'قائمة المديرين', 'أعضاء مجلس الإدارة'],
  establishment_date: ['تاريخ قيد السجل التجاري', 'تاريخ قيد السجل', 'تاريخ التأسيس', 'تاريخ القيد', 'تاريخ التسجيل', 'تاريخ الإصدار', 'تاريخ إصدار السجل'],
  cr_expiry_date: ['تاريخ انتهاء السجل التجاري', 'تاريخ انتهاء السجل', 'تاريخ الانتهاء', 'صالح حتى', 'تاريخ نهاية السجل'],
  annual_confirmation_date: ['تاريخ التأكيد السنوي للسجل التجاري', 'تاريخ التأكيد السنوي', 'التأكيد السنوي', 'تاريخ التأكيد'],
  main_activity: ['النشاط الرئيسي', 'النشاط الأساسي', 'نشاط المنشأة الرئيسي'],
  sub_activities: ['قائمة أنشطة السجل التجاري', 'أنشطة السجل التجاري', 'الأنشطة التجارية', 'الأنشطة الفرعية', 'أنشطة السجل', 'الأنشطة', 'النشاط'],
  city: ['مدينة عنوان الأعمال المعتمد للمنشأة', 'مدينة عنوان الأعمال', 'عنوان الأعمال المعتمد', 'مدينة المقر', 'مقر المنشأة', 'المدينة'],
  region: ['المنطقة الإدارية', 'المنطقة'],
  national_address: ['العنوان الوطني', 'عنوان المنشأة', 'عنوان الأعمال', 'العنوان', 'الحي'],
  postal_code: ['الرمز البريدي'],
  short_address: ['العنوان المختصر', 'الرمز المختصر'],
  email: ['البريد الإلكتروني', 'الإيميل', 'البريد'],
  website: ['عنوان الموقع الإلكتروني', 'الموقع الإلكتروني', 'الموقع', 'الرابط'],
  phone: ['رقم الجوال', 'رقم الهاتف', 'رقم التواصل', 'الجوال', 'الهاتف', 'رقم الاتصال'],
  entity_size: ['حجم المنشأة', 'حجم الشركة', 'فئة المنشأة', 'تصنيف المنشأة'],
  company_traits: ['صفات الشركة', 'صفة الشركة', 'صفات المنشأة'],
  cr_version: ['رقم نسخة السجل التجاري', 'رقم نسخة السجل', 'نسخة السجل', 'رقم النسخة'],
  cr_type: ['نوع السجل التجاري', 'نوع السجل'],
  // Recognised so it can be claimed and then ignored. A national ID is ten
  // digits and so is a commercial registration; without a label of its own the
  // number would be a strong candidate for cr_number and could win it.
  national_id: ['رقم الهوية', 'رقم هوية المالك', 'الهوية الوطنية', 'رقم الإقامة'],
  // Usually derived from the activity rather than printed — but some documents
  // do state it, and a field the engine can produce must be a field it can also
  // read, or `sector` would exist in the output and nowhere in the vocabulary.
  sector: ['القطاع', 'قطاع النشاط', 'مجال العمل'],
  }).map(([k, v]) => [k, F(v)]))

/** Every label, longest first — so the longest wording claims a line. */
export const ALL_LABELS = Object.entries(LABELS)
  .flatMap(([field, list]) => list.map((label) => ({ field, label })))
  .sort((a, b) => b.label.length - a.label.length)

/** Fast membership test for "is this line just a label?" */
export const LABEL_SET = new Set(ALL_LABELS.map((l) => l.label))

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------
// A value that must come from a known list is far more reliable than one
// matched by shape, so these are scored highest when they hit.

export const ENTITY_TYPES = F([
  'شركه ذات مسئوليه محدوده',
  'شركه مساهمه مقفله',
  'شركه مساهمه مبسطه',
  'شركه مساهمه',
  'شركه شخص واحد',
  'شركه تضامنيه',
  'شركه توصيه بسيطه',
  'مؤسسه فرديه',
  'مؤسسه',
  'جمعيه',
  'فرع شركه اجنبيه',
  'فرع',
  'شركه',
])

/**
 * The legal forms, without the «شركة» that usually precedes them.
 *
 * The real page splits the question in two: «نوع المنشأة» answers «شركة», and
 * «نوع الشركة» answers «ذات مسؤولية محدودة» — bare, because the word «شركة» was
 * already spent on the line above. Every entry in ENTITY_TYPES carries that
 * prefix, so none of them matched the bare form and the legal type came back as
 * a low-confidence guess.
 */
export const LEGAL_FORMS = F([
  'ذات مسؤولية محدودة',
  'مساهمة مقفلة',
  'مساهمة مبسطة',
  'مساهمة عامة',
  'مساهمة',
  'شخص واحد',
  'تضامنية',
  'تضامن',
  'توصية بسيطة',
  'توصية',
  'مهنية',
  'قابضة',
  'أجنبية',
  'فردية',
])

export const CR_STATUSES = F(['نشط', 'ساري', 'قائم', 'موقوف', 'معلق', 'منتهي', 'ملغي', 'تحت التصفيه', 'مشطوب'])

/** Words that make an Arabic phrase read as an organisation, not a person. */
export const ENTITY_WORDS = F([
  'شركه', 'مؤسسه', 'مجموعه', 'مصنع', 'مكتب', 'مستشفي', 'مدارس', 'مدرسه',
  'صيدليه', 'مركز', 'معهد', 'جمعيه', 'وكاله', 'محلات', 'متجر', 'مطعم',
  'مقاولات', 'تجاره', 'التجاريه', 'القابضه', 'للتجاره', 'للمقاولات',
])

export const COMPANY_TRAITS = F(['شخص واحد', 'عائليه', 'مهنيه', 'غير ربحيه', 'قابضه', 'تابعه'])

/** Sizes are never guessed — this list exists only to recognise an explicit one. */
export const ENTITY_SIZES = F(['متناهيه الصغر', 'صغيره', 'متوسطه', 'كبيره'])

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
// Folded on the way in like every other vocabulary — «أبريل» and «جمادى» carry
// characters that fold, and a month spelled the other way would never match.
export const AR_MONTHS = [
  ['يناير', 1], ['فبراير', 2], ['مارس', 3], ['أبريل', 4], ['مايو', 5], ['يونيو', 6],
  ['يوليو', 7], ['أغسطس', 8], ['سبتمبر', 9], ['أكتوبر', 10], ['نوفمبر', 11], ['ديسمبر', 12],
  ['محرم', 1], ['صفر', 2], ['ربيع الأول', 3], ['ربيع الثاني', 4], ['جمادى الأولى', 5],
  ['جمادى الآخرة', 6], ['رجب', 7], ['شعبان', 8], ['رمضان', 9], ['شوال', 10],
  ['ذو القعدة', 11], ['ذو الحجة', 12],
].map(([name, n]) => [fold(name), n])

/** Numeric dates in any separator and either field order. */
export const RE_DATE_NUMERIC = /\b(\d{1,4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,4})\b/
/** "12 مارس 2026" */
export const RE_DATE_WORDS = new RegExp(`\\b(\\d{1,2})\\s+(${AR_MONTHS.map(([m]) => m).join('|')})\\s+(\\d{3,4})`)
/** The hijri marker, in the several ways it is written. */
export const RE_HIJRI_MARK = /\b(?:ه|هـ|هجري)\b/

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
/** What separates a label from its value on one line. */
export const INLINE_SEPARATOR = /\s*[:：]\s*|\t+|\s{3,}|\s*\|\s*/

/** Scores, in one place, so the scale can be read at a glance. */
export const SCORE = {
  closedList: 96,      // matched a known vocabulary
  strongPattern: 98,   // an unmistakable Saudi identifier
  columnZip: 95,       // label block aligned to value block
  labelSameLine: 94,   // "label: value"
  labelNextLine: 86,   // label alone, value on the line below
  labelNearby: 70,     // label a couple of lines away
  weakPattern: 62,     // right shape, no label to confirm it
  inference: 75,       // derived, never read
}

/** The bands the UI shows. */
export const THRESHOLD = { confirmed: 85, inferred: 60 }
