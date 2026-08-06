/**
 * Eight pastes, written before the scorers were.
 *
 * These are the specification. Each one is a shape people actually arrive with,
 * and each has an `expect` block stating what a correct reading produces — not
 * what the current code happens to produce. When a fixture fails, the question
 * is which of the two is wrong, and the answer is usually the code.
 *
 * `layout` records which path the tokenizer should take, so a regression that
 * silently drops column recovery shows up as a layout failure rather than as a
 * vague drop in field count.
 *
 * `shuffle` says how the determinism test may reorder this text:
 *   'lines'  — every line is self-contained; shuffle them all.
 *   'pairs'  — the text has label/value blocks; shuffling individual lines
 *              destroys information no reader could recover, so this one is
 *              only checked for idempotency.
 */

export const FIXTURES = [

  // -------------------------------------------------------------------------
  {
    name: 'منصة الأعمال — لصق عمودي',
    layout: 'column',
    shuffle: 'pairs',
    text: `منصة الأعمال
الأسئلة الشائعة
اسم المنشأة
رقم السجل التجاري
الرقم الموحد
حالة السجل
نوع المنشأة
تاريخ قيد السجل
تاريخ انتهاء السجل
رأس المال
المدينة
العنوان
رقم الجوال
البريد الإلكتروني
مجموعة ظهران التجارية شركة شخص واحد
4030304834
7004309873
نشط
شركة ذات مسؤولية محدودة
2018-06-06
2027-04-03
50000 ريال
جدة
حي الأندلس
0555000142
ibraheem.m.almahdi@gmail.com
الأنشطة
561010 المطاعم مع الخدمة
561031 محلات الوجبات السريعة
563011 محلات تقديم المشروبات
جميع الحقوق محفوظة`,
    expect: {
      company_name_ar: 'مجموعة ظهران التجارية شركة شخص واحد',
      cr_number: '4030304834',
      unified_number: '7004309873',
      cr_status: 'نشط',
      entity_type: 'شركة ذات مسؤولية محدودة',
      establishment_date: '2018-06-06',
      cr_expiry_date: '2027-04-03',
      city: 'جدة',
      national_address: 'حي الأندلس',
      phone: '0555000142',
      email: 'ibraheem.m.almahdi@gmail.com',
      region: 'منطقة مكة المكرمة',
    },
    minFields: 14,
  },

  // -------------------------------------------------------------------------
  {
    name: 'شهادة السجل التجاري — سطري',
    layout: 'inline',
    shuffle: 'lines',
    text: `المملكة العربية السعودية
وزارة التجارة
اسم الشركة: شركة الأفق الذهبي للمقاولات
رقم السجل التجاري: 1010567890
الرقم الموحد: 7001234567
حالة السجل: نشط
نوع المنشأة: مؤسسة فردية
تاريخ التأسيس: 2015-03-12
تاريخ انتهاء السجل: 2028-03-11
رأس المال: 500000 ريال
المدينة: الرياض
البريد الإلكتروني: info@alofuq.com.sa
الموقع الإلكتروني: https://alofuq.com.sa
رقم الجوال: 0501234567
الرقم الضريبي: 300012345600003`,
    expect: {
      company_name_ar: 'شركة الأفق الذهبي للمقاولات',
      cr_number: '1010567890',
      unified_number: '7001234567',
      cr_status: 'نشط',
      entity_type: 'مؤسسة فردية',
      establishment_date: '2015-03-12',
      cr_expiry_date: '2028-03-11',
      city: 'الرياض',
      email: 'info@alofuq.com.sa',
      website: 'https://alofuq.com.sa',
      phone: '0501234567',
      vat_number: '300012345600003',
      region: 'منطقة الرياض',
    },
    minFields: 14,
  },

  // -------------------------------------------------------------------------
  {
    name: 'نص مستخرج من PDF — مختلط',
    layout: 'mixed',
    shuffle: 'pairs',
    text: `شهادة تسجيل
اسم المنشأة : مصنع النور للبلاستيك
رقم السجل التجاري : 2050998877
المدينة
الحي
الدمام
الفيصلية
حالة السجل : نشط
تاريخ قيد السجل : 12/07/2019
رأس المال : 2,000,000 ريال
النشاط الرئيسي : 222010 صناعة المنتجات البلاستيكية
رقم الهاتف : 0138123456`,
    expect: {
      company_name_ar: 'مصنع النور للبلاستيك',
      cr_number: '2050998877',
      city: 'الدمام',
      cr_status: 'نشط',
      region: 'المنطقة الشرقية',
      sector: 'الصناعة',
    },
    minFields: 8,
  },

  // -------------------------------------------------------------------------
  {
    name: 'OCR مكسور — مسافات وتشكيل وأرقام عربية',
    layout: 'inline',
    shuffle: 'lines',
    text: `اسـم الشـركة  :  شركـة الرِيّان التجاريـة
رقم السجل التجاري : ٤٠٣٠١١٢٢٣٣
المدينـة : جده
حالة السجل : نشـط
رقم الجوال : ٠٥٠٥٥٥٤٤٣٣`,
    expect: {
      cr_number: '4030112233',
      city: 'جده',
      phone: '0505554433',
      region: 'منطقة مكة المكرمة',
    },
    minFields: 5,
  },

  // -------------------------------------------------------------------------
  {
    name: 'نص إنجليزي بالكامل',
    layout: 'inline',
    shuffle: 'lines',
    text: `Commercial Registration Certificate
Trade Name: Golden Horizon Contracting Co.
CR Number: 1010223344
Status: Active
City: Riyadh`,
    // Nothing is claimed. The engine reads Arabic documents; an English page
    // should come back nearly empty rather than half-guessed, and the test
    // exists to prove it does not quietly invent Arabic values.
    expect: {},
    minFields: 0,
    maxFields: 4,
  },

  // -------------------------------------------------------------------------
  {
    name: 'نص قصير جداً',
    layout: 'inline',
    shuffle: 'lines',
    text: 'شركة الوفاء',
    expect: {},
    minFields: 0,
    maxFields: 2,
  },

  // -------------------------------------------------------------------------
  {
    name: 'أرقام كثيرة بلا ليبلات',
    layout: 'inline',
    shuffle: 'lines',
    // Every number here has a shape the engine recognises. Without labels it
    // must still not hand the same digits to two different fields, and must not
    // mistake the year for a registration number.
    text: `4030556677
7009988776
300099887700003
0551234567
2019
11500
RIYA1234`,
    expect: {
      cr_number: '4030556677',
      unified_number: '7009988776',
      vat_number: '300099887700003',
      phone: '0551234567',
    },
    minFields: 4,
  },

  // -------------------------------------------------------------------------
  {
    name: 'صفحة كاملة بتنويه المركز السعودي',
    layout: 'column',
    shuffle: 'pairs',
    // The disclaimer at the foot of every business-platform page. It contains
    // «مركز», one of the words that makes a phrase read like an organisation,
    // so it scored as a company name and replaced the actual company. Reported
    // from real use; kept here so it cannot come back.
    text: `المركز السعودي للتنافسية والأعمال
اسم المنشأة
رقم السجل التجاري
الرقم الوطني الموحد للمنشأة
حالة السجل
نوع المنشأة
نوع السجل
قيمة رأس المال الكلي
مدينة عنوان الأعمال المعتمد للمنشأة
مجموعة ظهران التجارية شركة شخص واحد
4030304834
7004309873
نشط
شركة ذات مسؤولية محدودة
سجل رئيسي
50000
جدة
المركز السعودي للتنافسية والأعمال غير مسؤول عن أي نقص أو اختلاف في البيانات، حيث يتم استرجاع البيانات بالتكامل مع الجهات المعنية.`,
    expect: {
      company_name_ar: 'مجموعة ظهران التجارية شركة شخص واحد',
      cr_number: '4030304834',
      unified_number: '7004309873',
      cr_status: 'نشط',
      entity_type: 'شركة ذات مسؤولية محدودة',
      cr_type: 'سجل رئيسي',
      city: 'جدة',
      region: 'منطقة مكة المكرمة',
    },
    minFields: 8,
  },

  // -------------------------------------------------------------------------
  {
    name: 'منصة الأعمال — الصفحة الكاملة بأقسامها',
    layout: 'column',
    shuffle: 'pairs',
    // The page exactly as it is laid out, section headings and all. Two things
    // here had to be fixed before it read correctly:
    //
    //   the headings — «بيانات السجل التجاري», «بيانات الاتصال» — sat inside
    //   what should have been a run of labels and broke column recovery;
    //
    //   «نوع الشركة» is its own line with its own value, and used to be listed
    //   as another way of writing «نوع المنشأة», so the two competed for one
    //   field and the legal form was lost entirely.
    text: `بيانات السجل التجاري
اسم المنشأة
نوع المنشأة
نوع الشركة
صفات الشركة
نوع السجل
حالة السجل
الرقم الوطني الموحد للمنشأة
رقم السجل التجاري
تاريخ قيد السجل التجاري
تاريخ التأكيد السنوي للسجل التجاري
مدينة عنوان الأعمال المعتمد للمنشأة
رقم نسخة السجل التجاري
قيمة رأس المال الكلي
مجموعة ظهران التجارية شركة شخص واحد
شركة
ذات مسؤولية محدودة
شخص واحد
سجل رئيسي
نشط
7004309873
4030304834
2018-06-06
2027-04-03
جدة
1
50000
بيانات الاتصال
رقم الجوال
البريد الإلكتروني
عنوان الموقع الإلكتروني
0555000142
ibraheem.m.almahdi@gmail.com
https://dhahran-group.com.sa
قائمة أنشطة السجل التجاري
561010 المطاعم مع الخدمة
561031 محلات الوجبات السريعة
563011 محلات تقديم المشروبات
قائمة المديرين
هيفاء احمد سعيد ظهران
المركز السعودي للتنافسية والأعمال غير مسؤول عن أي نقص أو اختلاف في البيانات، حيث يتم استرجاع البيانات بالتكامل مع الجهات المعنية.`,
    expect: {
      company_name_ar: 'مجموعة ظهران التجارية شركة شخص واحد',
      entity_type: 'شركة',
      company_type: 'ذات مسؤولية محدودة',
      company_traits: 'شخص واحد',
      cr_type: 'سجل رئيسي',
      cr_status: 'نشط',
      unified_number: '7004309873',
      cr_number: '4030304834',
      establishment_date: '2018-06-06',
      annual_confirmation_date: '2027-04-03',
      city: 'جدة',
      cr_version: '1',
      capital: '50000',
      phone: '0555000142',
      email: 'ibraheem.m.almahdi@gmail.com',
      website: 'https://dhahran-group.com.sa',
      main_activity: '561010 المطاعم مع الخدمة',
      region: 'منطقة مكة المكرمة',
      sector: 'الأغذية والمشروبات',
    },
    minFields: 19,
  },

  // -------------------------------------------------------------------------
  {
    name: 'منشأتان في لصق واحد',
    layout: 'inline',
    shuffle: 'lines',
    text: `اسم المنشأة : شركة الأولى للتجارة
رقم السجل التجاري : 1010111111
المدينة : الرياض
اسم المنشأة : شركة الثانية للتجارة
رقم السجل التجاري : 4030222222
المدينة : جدة`,
    // One record goes in the form. Which one is arbitrary, so nothing asserts
    // it — what must happen is the warning, so the person is told rather than
    // silently given half of each.
    expect: {},
    warnings: ['multiple_companies_detected'],
    minFields: 3,
  },
]

/** Deterministic shuffle — a fixed seed, so a failure can be reproduced. */
export function shuffle(arr, seed) {
  const a = [...arr]
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
