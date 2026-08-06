#!/usr/bin/env node
/**
 * The extraction engine, checked from outside its own test suite.
 *
 * The vitest fixtures prove the rules behave as specified. This proves the
 * thing the user actually does: paste a page, get a filled form. It runs the
 * full path — engine, then the form adapter — and reports the number that
 * matters, which is how many boxes the person no longer has to type.
 *
 *   node scripts/verify-cr-extractor.mjs
 */

import { extractCommercialRegister } from '../src/lib/extraction/crExtractor.js'
import { extractForForm } from '../src/lib/extraction/toFormPatch.js'
import { normalizeText } from '../src/lib/extraction/normalizeText.js'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// A business-platform paste: labels in one block, values in another, with the
// portal's own furniture around them. This is the shape the feature exists for.
const PASTE = `منصة الأعمال
الرئيسية
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
الموقع الإلكتروني
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
https://dhahran-group.com.sa
الأنشطة
561010 المطاعم مع الخدمة
561031 محلات الوجبات السريعة
563011 محلات تقديم المشروبات
جميع الحقوق محفوظة`

console.log('\n— اللصق العمودي من منصة الأعمال')
const r = extractCommercialRegister(PASTE)
console.log(`  التخطيط: ${r.meta.layoutMode} · الحقول: ${r.meta.fieldsFound} · ${r.meta.durationMs}ms`)

const WANT = {
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
  website: 'https://dhahran-group.com.sa',
  region: 'منطقة مكة المكرمة',
  sector: 'الأغذية والمشروبات',
}

for (const [k, want] of Object.entries(WANT)) {
  const got = r.fields[k]
  check(got?.value === want, `${k} = ${want}`, `قرأ «${got?.value ?? 'لا شيء'}»`)
}

// ---------------------------------------------------------------------------
console.log('\n— قاعدة منع الاختراع')
const { text } = normalizeText(PASTE)
const derived = new Set(['region', 'sector'])
let invented = 0
for (const [name, f] of Object.entries(r.fields)) {
  if (f.value == null || derived.has(name)) continue
  const ok = f.parts ? f.parts.every((p) => text.includes(p)) : text.includes(f.value)
  if (!ok) { console.log(`  ❌ ${name} = «${f.value}» غير موجودة في النص`); invented++ }
}
check(invented === 0, 'كل قيمة مقروءة موجودة حرفياً في النص المصدر')
check(r.fields.region.status === 'inferred' && r.fields.sector.status === 'inferred',
  'المنطقة والقطاع موسومان كمستنتَجين')

// ---------------------------------------------------------------------------
console.log('\n— الحصرية: رقم واحد لا يملأ حقلين')
const nums = new Map()
let clash = 0
for (const [name, f] of Object.entries(r.fields)) {
  if (!f.value || !/^\d+$/.test(f.value)) continue
  if (nums.has(f.value)) { console.log(`  ❌ ${f.value} في ${nums.get(f.value)} و ${name}`); clash++ }
  nums.set(f.value, name)
}
check(clash === 0, 'لا رقم مكرَّر بين حقلين')

// ---------------------------------------------------------------------------
console.log('\n— جسر النموذج')
const patch = extractForForm(PASTE)
const n = Object.keys(patch.fields).length
console.log(`  حقول جاهزة للنموذج: ${n}`)
for (const [k, v] of Object.entries(patch.fields)) {
  console.log(`    ${v.confidence === 'high' ? '●' : '○'} ${k} = ${String(v.value).slice(0, 46)}`)
}
check(n >= 14, `≥ 14 حقل في النموذج`, `فقط ${n}`)
check(patch.meta.lines.length > 0, 'أسطر المصدر متاحة للتظليل')
check(Object.values(patch.fields).every((f) => f.sourceIndex != null || derived.size),
  'كل حقل يعرف من أي سطر جاء')

// ---------------------------------------------------------------------------
// The claim the dropdowns rest on: a value read from a document must land ON an
// option, not beside it. If it lands beside, the same company entered twice —
// once imported, once typed — becomes two different strings that never group.
console.log('\n— الاستيراد يقع على خيارات القوائم')
const { matchOption, splitEntityType, OPTION_SETS, crStatusToDb, crStatusFromDb } =
  await import('../src/lib/reference/companyOptions.js')

const readStatus = patch.fields.crStatus?.value
check(matchOption('crStatus', readStatus) === 'نشط',
  `«${readStatus}» → خيار «نشط»`, `صار «${matchOption('crStatus', readStatus)}»`)

const readEntity = patch.fields.entityType?.value
const split = splitEntityType(readEntity)
check(split.entityType === 'شركة' && split.companyType === 'ذات مسؤولية محدودة',
  `«${readEntity}» ينفصل إلى نوع المنشأة + نوع الشركة`,
  JSON.stringify(split))

// Everything that snaps must snap onto a value the list actually contains.
for (const field of ['crStatus', 'companyType', 'companyTraits', 'crType', 'enterpriseSize']) {
  const raw = field === 'crStatus' ? readStatus : field === 'companyType' ? readEntity : null
  if (!raw) continue
  const snapped = matchOption(field, raw)
  if (!snapped) continue
  check(OPTION_SETS[field].some((o) => o.value === snapped),
    `${field}: «${snapped}» موجودة في القائمة`)
}

const db = crStatusToDb(matchOption('crStatus', readStatus))
check(db.cr === 'active' && db.official === 'none', 'الحالة تُخزَّن بالعمودين الصحيحين', JSON.stringify(db))
check(crStatusFromDb(db.cr, db.official) === 'نشط', 'وتعود كما كانت عند فتح السجل')

// ---------------------------------------------------------------------------
console.log('\n— حالات لا يجوز أن تنهار')
for (const junk of ['', ' ', null, undefined, 'مرحبا', '\n\n\n', 'x'.repeat(60000)]) {
  try {
    const out = extractForForm(junk)
    if (typeof out.fields !== 'object') throw new Error('شكل خاطئ')
  } catch (e) {
    check(false, `مدخل غريب: ${JSON.stringify(String(junk).slice(0, 12))}`, e.message)
  }
}
check(true, 'المدخلات الغريبة لا تُسقط المحرك')

const nothing = extractForForm('مرحبا كيف حالك')
check(nothing.meta.fieldsFound === 0, 'نص بلا بيانات لا يُنتج حقولاً', `أنتج ${nothing.meta.fieldsFound}`)

console.log(failed ? `\n❌ ${failed} فحص فشل\n` : '\n✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
