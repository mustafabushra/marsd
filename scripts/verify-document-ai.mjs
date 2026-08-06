/**
 * The reply from the vision model is not schema-enforced — Groq offers
 * json_schema on its text models only. `sanitise()` in api/extract-document.js
 * is therefore the entire schema, and if it leaks, an invented value lands in a
 * company record wearing a confidence badge.
 *
 * Every case below is a shape a model actually produces when asked for JSON.
 *
 *   node scripts/verify-document-ai.mjs
 */

import { sanitise } from '../api/extract-document.js'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ---------------------------------------------------------------------------
// The happy shape still works
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    document_type: 'commercial_registration',
    is_company_document: true,
    company_name_ar: { value: 'مجموعة ظهران التجارية', confidence: 0.97 },
    commercial_registration: { value: '4030304834', confidence: 0.95 },
    sub_activities: ['تجارة الجملة', 'تجارة التجزئة'],
    managers: ['أحمد العتيبي'],
    notes: null,
  })
  check('الشكل السليم يمرّ كما هو',
    r.company_name_ar?.value === 'مجموعة ظهران التجارية'
    && r.commercial_registration?.confidence === 0.95
    && r.sub_activities.length === 2
    && r.document_type === 'commercial_registration',
    JSON.stringify(r).slice(0, 200))
}

// ---------------------------------------------------------------------------
// A field the schema never had
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    company_name_ar: { value: 'شركة', confidence: 0.9 },
    owner_national_id: { value: '1012345678', confidence: 0.99 },
    bank_iban: { value: 'SA0380000000608010167519', confidence: 0.99 },
  })
  check('الحقل المخترع يُرمى',
    !('owner_national_id' in r) && !('bank_iban' in r),
    Object.keys(r).join(', '))
}

// ---------------------------------------------------------------------------
// A bare string where the pair belongs
// ---------------------------------------------------------------------------
{
  const r = sanitise({ city: 'الرياض', phone: '0501234567' })
  check('النص المجرّد يُقبل بثقة غير مرتفعة',
    r.city?.value === 'الرياض' && r.city.confidence === 0.5 && r.phone?.confidence === 0.5,
    JSON.stringify(r))
  check('ولا يُعرض كأنه مؤكَّد', r.city.confidence < 0.9)
}

// ---------------------------------------------------------------------------
// Confidence that is not a number in 0..1
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    company_name_ar: { value: 'أ', confidence: 7 },
    city: { value: 'جدة', confidence: -3 },
    region: { value: 'مكة', confidence: '95%' },
    sector: { value: 'تجزئة', confidence: '0.8' },
    phone: { value: '0500000000', confidence: 'عالية' },
    email: { value: 'a@b.com', confidence: NaN },
  })
  check('الثقة تُحصر بين 0 و 1',
    r.company_name_ar.confidence === 1 && r.city.confidence === 0,
    `${r.company_name_ar.confidence} / ${r.city.confidence}`)
  check('النسبة المئوية تتحوّل', Math.abs(r.region.confidence - 0.95) < 1e-9, String(r.region.confidence))
  check('الرقم النصّي يتحوّل', Math.abs(r.sector.confidence - 0.8) < 1e-9, String(r.sector.confidence))
  check('الثقة الكلامية تسقط لغير المرتفع', r.phone.confidence === 0.5, String(r.phone.confidence))
  check('NaN لا يمرّ', Number.isFinite(r.email.confidence), String(r.email.confidence))
}

// ---------------------------------------------------------------------------
// The many ways a model writes "null"
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    company_name_ar: { value: 'غير متوفر', confidence: 1 },
    company_name_en: { value: 'N/A', confidence: 1 },
    city: { value: '—', confidence: 1 },
    region: { value: 'لا يوجد', confidence: 1 },
    sector: { value: '   ', confidence: 1 },
    phone: { value: null, confidence: 1 },
    email: { value: 'null', confidence: 1 },
  })
  const leaked = ['company_name_ar', 'company_name_en', 'city', 'region', 'sector', 'phone', 'email']
    .filter((k) => k in r)
  check('«غير متوفر» و N/A و null لا تُخزَّن كقيم', leaked.length === 0, leaked.join(', '))
}

// ---------------------------------------------------------------------------
// The model started narrating
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    city: { value: 'ا'.repeat(401), confidence: 0.9 },
    region: { value: 'ا'.repeat(399), confidence: 0.9 },
  })
  check('القيمة الطويلة جداً تُرمى ولا تُقتطع', !('city' in r) && r.region?.value.length === 399,
    `city=${'city' in r} region=${r.region?.value.length}`)
}

// ---------------------------------------------------------------------------
// Arabic-Indic digits, whatever the prompt asked for
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    commercial_registration: { value: '٤٠٣٠٣٠٤٨٣٤', confidence: 0.9 },
    unified_number: { value: '۷۰۰۴۳۰۹۸۷۳', confidence: 0.9 },
  })
  check('الأرقام العربية تتحوّل للاتينية',
    r.commercial_registration?.value === '4030304834' && r.unified_number?.value === '7004309873',
    `${r.commercial_registration?.value} / ${r.unified_number?.value}`)
}

// ---------------------------------------------------------------------------
// The lists, in every form they arrive
// ---------------------------------------------------------------------------
{
  const r = sanitise({
    sub_activities: 'تجارة الجملة، تجارة التجزئة، المقاولات',
    managers: [{ name: 'أحمد' }, { value: 'سعد' }, 'أحمد', '', null],
  })
  check('القائمة النصّية تُقسَّم', r.sub_activities.length === 3, JSON.stringify(r.sub_activities))
  check('عناصر الكائنات تُقرأ والمكرّر والفارغ يسقطان',
    r.managers.length === 2 && r.managers[0] === 'أحمد' && r.managers[1] === 'سعد',
    JSON.stringify(r.managers))
}
{
  const r = sanitise({ sub_activities: { unexpected: true }, managers: 42 })
  check('القائمة بشكل خاطئ تصير فارغة لا تنهار',
    Array.isArray(r.sub_activities) && r.sub_activities.length === 0
    && Array.isArray(r.managers) && r.managers.length === 0)
}

// ---------------------------------------------------------------------------
// document_type must be one we know, or nothing
// ---------------------------------------------------------------------------
{
  check('نوع مستند مخترع يصير null',
    sanitise({ document_type: 'passport' }).document_type === null)
  check('نوع مستند معروف يمرّ',
    sanitise({ document_type: 'zakat' }).document_type === 'zakat')
}

// ---------------------------------------------------------------------------
// is_company_document — silence is not rejection
// ---------------------------------------------------------------------------
{
  check('false صريحة تُحترَم', sanitise({ is_company_document: false }).is_company_document === false)
  check('غياب المفتاح لا يُفسَّر رفضاً', sanitise({}).is_company_document === true)
  check('"false" نصّاً ليست false', sanitise({ is_company_document: 'false' }).is_company_document === true)
}

// ---------------------------------------------------------------------------
// Nothing at all
// ---------------------------------------------------------------------------
{
  for (const junk of [null, undefined, 'مرحبا', 42, [], { fields: {} }]) {
    const r = sanitise(junk)
    const ok = r && Array.isArray(r.sub_activities) && r.notes === null
      && !Object.keys(r).some((k) => !['document_type', 'is_company_document', 'sub_activities', 'managers', 'notes'].includes(k))
    if (!ok) check(`ردّ فارغ/خاطئ (${JSON.stringify(junk)}) لا ينتج حقولاً`, false, JSON.stringify(r))
  }
  check('الردّ الفارغ أو الخاطئ لا ينتج أي حقل', true)
}

// ---------------------------------------------------------------------------
// notes reaches the reviewer
// ---------------------------------------------------------------------------
{
  check('الملاحظة تصل كنص',
    sanitise({ notes: 'الصورة ضبابية' }).notes === 'الصورة ضبابية')
  check('الملاحظة ككائن تُقرأ أيضاً',
    sanitise({ notes: { value: 'الختم يغطي الرقم', confidence: 0.9 } }).notes === 'الختم يغطي الرقم')
}

console.log(failed ? `\n❌ ${failed} فحص فشل` : '\n✅ كل الفحوصات نجحت')
process.exit(failed ? 1 : 0)
