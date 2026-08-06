/**
 * Activity → sector.
 *
 * Sector is one of only two fields this engine may derive rather than read, and
 * it is always returned as `inferred`. Two routes, in order of trust:
 *
 *   1. the ISIC code, when the document printed one. The first two digits are
 *      the ISIC Rev.4 division, which is a published international standard —
 *      this is a lookup, not a guess about meaning.
 *   2. keywords in the activity's Arabic text, when there is no code. Weaker,
 *      and scored lower, because «مركز» appears in a shopping centre and a
 *      medical centre alike.
 *
 * The output is constrained to the sector list the add-company form offers, so
 * that an inferred sector lands on an existing option instead of creating a
 * one-off value nobody else's record uses. That list lives in AddCompany.jsx;
 * if it changes, the right-hand side of DIVISIONS has to change with it.
 */

/** Must stay in sync with SECTORS in src/pages/AddCompany.jsx. */
export const SECTORS = [
  'تقنية المعلومات', 'المقاولات والإنشاءات', 'التجارة', 'الصناعة',
  'النقل واللوجستيات', 'الخدمات', 'الرعاية الصحية', 'التعليم', 'العقارات',
  'المالية والتأمين', 'الطاقة', 'الأغذية والمشروبات', 'السياحة والضيافة',
  'الإعلام والتسويق', 'الزراعة',
]

/**
 * ISIC Rev.4 division (first two digits) → sector.
 * Ranges are inclusive; the first match wins.
 */
const DIVISIONS = [
  [1, 3, 'الزراعة'],
  [5, 9, 'الطاقة'],                 // extraction of coal, oil and gas
  [10, 12, 'الأغذية والمشروبات'],
  [13, 33, 'الصناعة'],
  [35, 35, 'الطاقة'],
  [36, 39, 'الخدمات'],              // water, sewerage, waste
  [41, 43, 'المقاولات والإنشاءات'],
  [45, 47, 'التجارة'],
  [49, 53, 'النقل واللوجستيات'],
  [55, 55, 'السياحة والضيافة'],
  [56, 56, 'الأغذية والمشروبات'],   // restaurants and catering
  [58, 60, 'الإعلام والتسويق'],
  [61, 63, 'تقنية المعلومات'],
  [64, 66, 'المالية والتأمين'],
  [68, 68, 'العقارات'],
  [69, 72, 'الخدمات'],
  [73, 73, 'الإعلام والتسويق'],     // advertising and market research
  [74, 82, 'الخدمات'],
  [84, 84, 'الخدمات'],
  [85, 85, 'التعليم'],
  [86, 88, 'الرعاية الصحية'],
  [90, 93, 'السياحة والضيافة'],
  [94, 96, 'الخدمات'],
]

/**
 * The sector an ISIC code belongs to, or null.
 *
 * Codes shorter than four digits are refused: two digits alone could be a
 * division or the start of anything, and the caller cannot tell which.
 */
export function sectorFromIsic(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length < 4) return null
  const division = Number(digits.slice(0, 2))
  const hit = DIVISIONS.find(([lo, hi]) => division >= lo && division <= hi)
  return hit ? hit[2] : null
}

/**
 * Keywords, checked against **folded** activity text.
 *
 * Ordered most specific first — «تقنيه المعلومات» has to be tested before the
 * bare «تجاره», or a software trading company lands in retail.
 */
const KEYWORDS = [
  [['تقنيه المعلومات', 'برمجه', 'برمجيات', 'حاسب', 'شبكات', 'اتصالات', 'سيبراني', 'تطبيقات'], 'تقنية المعلومات'],
  [['مقاولات', 'انشاءات', 'بناء', 'تشييد', 'ترميم', 'هدم', 'سباكه', 'كهرباء المباني'], 'المقاولات والإنشاءات'],
  [['مطاعم', 'وجبات', 'مشروبات', 'مخبز', 'حلويات', 'اغذيه', 'تموين', 'قهوه', 'كافيه'], 'الأغذية والمشروبات'],
  [['مستشفي', 'صيدل', 'طبي', 'عيادات', 'اسنان', 'مختبر', 'رعايه صحيه', 'تمريض'], 'الرعاية الصحية'],
  [['مدارس', 'تعليم', 'تدريب', 'حضانه', 'جامعه', 'معهد', 'روضه'], 'التعليم'],
  [['عقار', 'اراضي', 'تطوير عقاري', 'وساطه عقاريه', 'ايجار مباني'], 'العقارات'],
  [['تامين', 'تمويل', 'صرافه', 'استثمار', 'مصرفي', 'محفظه'], 'المالية والتأمين'],
  [['نقل', 'شحن', 'لوجست', 'توصيل', 'تخزين', 'مستودعات', 'ملاحه'], 'النقل واللوجستيات'],
  [['فندق', 'ضيافه', 'سياح', 'سفر', 'منتجع', 'شقق مفروشه'], 'السياحة والضيافة'],
  [['اعلان', 'تسويق', 'دعايه', 'اعلام', 'انتاج فني', 'علاقات عامه'], 'الإعلام والتسويق'],
  [['زراع', 'مزارع', 'مواشي', 'دواجن', 'اسماك', 'نخيل'], 'الزراعة'],
  [['طاقه', 'بترول', 'نفط', 'غاز', 'تعدين', 'كهرباء', 'شمسيه'], 'الطاقة'],
  [['مصنع', 'تصنيع', 'صناع', 'انتاج'], 'الصناعة'],
  [['تجاره', 'بيع', 'تجزئه', 'جمله', 'استيراد', 'تصدير', 'محلات'], 'التجارة'],
  [['خدمات', 'صيانه', 'نظافه', 'استشار', 'محاماه', 'محاسبه'], 'الخدمات'],
]

/** The sector an activity's wording suggests, or null. Input must be folded. */
export function sectorFromText(folded) {
  const t = String(folded ?? '')
  if (!t) return null
  for (const [words, sector] of KEYWORDS) {
    if (words.some((w) => t.includes(w))) return sector
  }
  return null
}
