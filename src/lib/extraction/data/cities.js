/**
 * Saudi cities, their regions, and the ways people actually type them.
 *
 * Two jobs:
 *   1. recognise a city in free text — so a bare «جدة» on its own line is not
 *      mistaken for a company name or a manager;
 *   2. derive the region — one of only two fields this engine is allowed to
 *      infer, and always marked `inferred` when it does.
 *
 * Keys are **folded** (see normalizeText.js): hamza flattened, taa-marbuta to
 * haa, so «جده» and «جدة» are the same key and both find the entry. The `name`
 * field carries the properly spelled form, but it is used for display only —
 * a city read from the document is returned exactly as the document wrote it.
 */

export const REGIONS = [
  'منطقة الرياض',
  'منطقة مكة المكرمة',
  'منطقة المدينة المنورة',
  'منطقة القصيم',
  'المنطقة الشرقية',
  'منطقة عسير',
  'منطقة تبوك',
  'منطقة حائل',
  'منطقة الحدود الشمالية',
  'منطقة جازان',
  'منطقة نجران',
  'منطقة الباحة',
  'منطقة الجوف',
]

const R = {
  riyadh: 'منطقة الرياض',
  makkah: 'منطقة مكة المكرمة',
  madinah: 'منطقة المدينة المنورة',
  qassim: 'منطقة القصيم',
  eastern: 'المنطقة الشرقية',
  asir: 'منطقة عسير',
  tabuk: 'منطقة تبوك',
  hail: 'منطقة حائل',
  northern: 'منطقة الحدود الشمالية',
  jazan: 'منطقة جازان',
  najran: 'منطقة نجران',
  bahah: 'منطقة الباحة',
  jawf: 'منطقة الجوف',
}

/**
 * city (folded) → { name, region }
 *
 * Every spelling variant gets its own key rather than being derived at match
 * time: the variants are irregular (الخبر / الخُبر, ابها / أبها, الاحساء /
 * الأحساء) and a lookup table is both faster and easier to correct than a rule
 * that tries to predict them.
 */
export const CITIES = new Map(Object.entries({
  // منطقة الرياض
  'الرياض': { name: 'الرياض', region: R.riyadh },
  'الخرج': { name: 'الخرج', region: R.riyadh },
  'الدرعيه': { name: 'الدرعية', region: R.riyadh },
  'المجمعه': { name: 'المجمعة', region: R.riyadh },
  'الزلفي': { name: 'الزلفي', region: R.riyadh },
  'وادي الدواسر': { name: 'وادي الدواسر', region: R.riyadh },
  'الدوادمي': { name: 'الدوادمي', region: R.riyadh },
  'شقراء': { name: 'شقراء', region: R.riyadh },
  'حوطه بني تميم': { name: 'حوطة بني تميم', region: R.riyadh },
  'الافلاج': { name: 'الأفلاج', region: R.riyadh },
  'ثادق': { name: 'ثادق', region: R.riyadh },
  'رماح': { name: 'رماح', region: R.riyadh },

  // منطقة مكة المكرمة
  'جده': { name: 'جدة', region: R.makkah },
  'مكه': { name: 'مكة المكرمة', region: R.makkah },
  'مكه المكرمه': { name: 'مكة المكرمة', region: R.makkah },
  'الطائف': { name: 'الطائف', region: R.makkah },
  'رابغ': { name: 'رابغ', region: R.makkah },
  'القنفذه': { name: 'القنفذة', region: R.makkah },
  'الليث': { name: 'الليث', region: R.makkah },
  'خليص': { name: 'خليص', region: R.makkah },
  'الجموم': { name: 'الجموم', region: R.makkah },
  'تربه': { name: 'تربة', region: R.makkah },

  // منطقة المدينة المنورة
  'المدينه المنوره': { name: 'المدينة المنورة', region: R.madinah },
  'المدينه': { name: 'المدينة المنورة', region: R.madinah },
  'ينبع': { name: 'ينبع', region: R.madinah },
  'العلا': { name: 'العلا', region: R.madinah },
  'بدر': { name: 'بدر', region: R.madinah },
  'خيبر': { name: 'خيبر', region: R.madinah },
  'مهد الذهب': { name: 'مهد الذهب', region: R.madinah },

  // منطقة القصيم
  'بريده': { name: 'بريدة', region: R.qassim },
  'عنيزه': { name: 'عنيزة', region: R.qassim },
  'الرس': { name: 'الرس', region: R.qassim },
  'المذنب': { name: 'المذنب', region: R.qassim },
  'البكيريه': { name: 'البكيرية', region: R.qassim },
  'رياض الخبراء': { name: 'رياض الخبراء', region: R.qassim },

  // المنطقة الشرقية
  'الدمام': { name: 'الدمام', region: R.eastern },
  'الخبر': { name: 'الخبر', region: R.eastern },
  'الظهران': { name: 'الظهران', region: R.eastern },
  'الاحساء': { name: 'الأحساء', region: R.eastern },
  'الهفوف': { name: 'الهفوف', region: R.eastern },
  'المبرز': { name: 'المبرز', region: R.eastern },
  'الجبيل': { name: 'الجبيل', region: R.eastern },
  'القطيف': { name: 'القطيف', region: R.eastern },
  'سيهات': { name: 'سيهات', region: R.eastern },
  'صفوي': { name: 'صفوى', region: R.eastern },
  'راس تنوره': { name: 'رأس تنورة', region: R.eastern },
  'حفر الباطن': { name: 'حفر الباطن', region: R.eastern },
  'الخفجي': { name: 'الخفجي', region: R.eastern },
  'النعيريه': { name: 'النعيرية', region: R.eastern },
  'بقيق': { name: 'بقيق', region: R.eastern },

  // منطقة عسير
  'ابها': { name: 'أبها', region: R.asir },
  'خميس مشيط': { name: 'خميس مشيط', region: R.asir },
  'بيشه': { name: 'بيشة', region: R.asir },
  'محايل عسير': { name: 'محايل عسير', region: R.asir },
  'محايل': { name: 'محايل عسير', region: R.asir },
  'النماص': { name: 'النماص', region: R.asir },
  'سراه عبيده': { name: 'سراة عبيدة', region: R.asir },
  'ظهران الجنوب': { name: 'ظهران الجنوب', region: R.asir },
  'رجال المع': { name: 'رجال ألمع', region: R.asir },

  // منطقة تبوك
  'تبوك': { name: 'تبوك', region: R.tabuk },
  'ضباء': { name: 'ضباء', region: R.tabuk },
  'الوجه': { name: 'الوجه', region: R.tabuk },
  'حقل': { name: 'حقل', region: R.tabuk },
  'املج': { name: 'أملج', region: R.tabuk },
  'تيماء': { name: 'تيماء', region: R.tabuk },

  // منطقة حائل
  'حائل': { name: 'حائل', region: R.hail },
  'بقعاء': { name: 'بقعاء', region: R.hail },
  'الشنان': { name: 'الشنان', region: R.hail },

  // منطقة الحدود الشمالية
  'عرعر': { name: 'عرعر', region: R.northern },
  'رفحاء': { name: 'رفحاء', region: R.northern },
  'طريف': { name: 'طريف', region: R.northern },

  // منطقة جازان
  'جازان': { name: 'جازان', region: R.jazan },
  'جيزان': { name: 'جازان', region: R.jazan },
  'صبيا': { name: 'صبيا', region: R.jazan },
  'ابو عريش': { name: 'أبو عريش', region: R.jazan },
  'صامطه': { name: 'صامطة', region: R.jazan },
  'فرسان': { name: 'فرسان', region: R.jazan },

  // منطقة نجران
  'نجران': { name: 'نجران', region: R.najran },
  'شروره': { name: 'شرورة', region: R.najran },

  // منطقة الباحة
  'الباحه': { name: 'الباحة', region: R.bahah },
  'بلجرشي': { name: 'بلجرشي', region: R.bahah },
  'المندق': { name: 'المندق', region: R.bahah },

  // منطقة الجوف
  'سكاكا': { name: 'سكاكا', region: R.jawf },
  'القريات': { name: 'القريات', region: R.jawf },
  'دومه الجندل': { name: 'دومة الجندل', region: R.jawf },
}))

/** Longest first, so «مكه المكرمه» wins over «مكه» inside the same line. */
export const CITY_KEYS = [...CITIES.keys()].sort((a, b) => b.length - a.length)

/** Region names, folded, for recognising one written explicitly. */
export const REGION_BY_FOLDED = new Map(
  REGIONS.map((r) => [r.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي'), r]),
)
