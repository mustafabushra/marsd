#!/usr/bin/env node
/**
 * Does the document parser actually read a commercial registration?
 *
 * The scanners (camera, tesseract, pdfjs) need a browser, but everything that
 * decides what a document *means* is pure text handling — and that is where the
 * mistakes live. A parser that silently returns nothing looks exactly like a
 * document that had nothing in it, so the failure mode here is a screen that
 * says "0 حقول" forever and nobody knowing why.
 *
 * The fixtures are the shapes these documents actually arrive in: clean text
 * from a digital PDF, OCR output with its spacing destroyed and Arabic-Indic
 * digits, a Hijri expiry date, and a QR that is just a verification URL.
 *
 * Usage: node scripts/verify-company-import.mjs
 */

import { parseDocumentText, parseQrPayload, mergeExtractions } from '../src/lib/companyImport/normalize.js'

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}

// ---- a digital PDF's embedded text -----------------------------------------
console.log('\n  سجل تجاري — نص مضمّن\n')
{
  const doc = [
    'المملكة العربية السعودية',
    'وزارة التجارة — شهادة السجل التجاري',
    'اسم الشركة:  شركة الرياض للتجارة المحدودة',
    'رقم السجل التجاري:  1010457821',
    'الرقم الموحد للمنشأة:  7001234567',
    'نوع الكيان:  شركة ذات مسؤولية محدودة',
    'حالة السجل:  نشط',
    'تاريخ الانتهاء:  2027/03/14',
    'النشاط الرئيسي:  تجارة الجملة',
    'المدينة:  الرياض',
    'المنطقة:  منطقة الرياض',
    'الهاتف:  0112345678',
    'info@riyadh-trading.com',
  ].join('\n')

  const r = parseDocumentText(doc, 'pdf')
  const v = (k) => r.fields[k]?.value

  ok('اسم الشركة', v('companyName') === 'شركة الرياض للتجارة المحدودة', v('companyName'))
  ok('رقم السجل', v('registryNumber') === '1010457821', v('registryNumber'))
  ok('الرقم الموحّد', v('unifiedNumber') === '7001234567', v('unifiedNumber'))
  ok('نوع الكيان', v('entityType') === 'شركة ذات مسؤولية محدودة', v('entityType'))
  ok('حالة السجل', v('crStatus') === 'نشط', v('crStatus'))
  ok('تاريخ الانتهاء بصيغة الجدول', v('crExpiryDate') === '2027-03-14', v('crExpiryDate'))
  ok('النشاط الرئيسي', v('mainActivity') === 'تجارة الجملة', v('mainActivity'))
  ok('المدينة', v('city') === 'الرياض', v('city'))
  ok('الهاتف', (v('phone') || '').replace(/\s/g, '') === '0112345678', v('phone'))
  ok('البريد', v('officialEmail') === 'info@riyadh-trading.com', v('officialEmail'))
  ok('لا ملاحظة تحذيرية', !r.note, r.note || '')
}

// ---- what OCR really hands over ---------------------------------------------
console.log('\n  صورة ممسوحة — مخرجات OCR\n')
{
  // Arabic-Indic digits, collapsed spacing, and a Hijri expiry — all three are
  // routine on a photographed certificate.
  const noisy = [
    'شهادة   مركز   الأعمال',
    'اسم المنشأة :   مؤسسة القصيم للأغذية',
    'رقم السجل التجاري :   ١١٢٨٤٥٦٧٩٠',
    'حالة السجل :   نشط',
    'تاريخ الانتهاء :   ١٤٤٧/٠٦/٢٢',
    'المدينة :   بريدة',
  ].join('\n')

  const r = parseDocumentText(noisy, 'image')
  const f = (k) => r.fields[k]

  ok('الأرقام العربية تُحوَّل', f('registryNumber')?.value === '1128456790', f('registryNumber')?.value)
  ok('الاسم رغم المسافات', f('companyName')?.value === 'مؤسسة القصيم للأغذية', f('companyName')?.value)
  ok('المدينة', f('city')?.value === 'بريدة', f('city')?.value)

  // The important one: a Hijri date must not be stored as if it were Gregorian.
  // 1447-06-22 as a Gregorian date is the year 1447 — a company founded before
  // the printing press, saved without anybody noticing.
  ok('التاريخ الهجري لا يُحفظ كميلادي', f('crExpiryDate')?.value === '',
     f('crExpiryDate')?.value || '(فارغ)')
  ok('  ويُعرض خامّاً ليصححه المستخدم', /هجري/.test(f('crExpiryDate')?.raw || ''),
     f('crExpiryDate')?.raw || '')
  ok('  ومعلَّم بثقة منخفضة', f('crExpiryDate')?.confidence === 'low')

  ok('كل المستخرَج من نص موسوم بثقة متوسطة',
     ['companyName', 'city'].every((k) => f(k)?.confidence === 'medium'))
}

// ---- a photograph where the label was lost ----------------------------------
console.log('\n  رقم سجل بلا عنوان\n')
{
  const r = parseDocumentText('وزارة التجارة\n1010457821\nنشط', 'image')
  ok('يُلتقط الرقم العاري', r.fields.registryNumber?.value === '1010457821')
  ok('  لكن كتخمين لا كحقيقة', r.fields.registryNumber?.confidence === 'low',
     r.fields.registryNumber?.confidence)
}

// ---- QR -----------------------------------------------------------------
console.log('\n  رمز QR\n')
{
  const url = parseQrPayload('https://mc.gov.sa/verify/1010457821')
  ok('رابط التحقّق يُستخرج منه رقم السجل', url.fields.registryNumber?.value === '1010457821')
  ok('  بثقة عالية — قراءة لا تخمين', url.fields.registryNumber?.confidence === 'high')
  ok('  والرابط محفوظ للفتح', url.unparsed === 'https://mc.gov.sa/verify/1010457821')

  const opaque = parseQrPayload('https://verify.example.sa/x/AB93F1')
  ok('رابط بلا بيانات يُعرض للنسخ', opaque.unparsed === 'https://verify.example.sa/x/AB93F1')
  ok('  ويقول ذلك صراحة', /لا يحمل بيانات/.test(opaque.note || ''), opaque.note || '')

  const structured = parseQrPayload(
    'اسم الشركة: شركة نجد الأولى|رقم السجل التجاري: 1010999888|المدينة: الرياض')
  ok('الحمولة المركّبة تُقرأ', structured.fields.companyName?.value === 'شركة نجد الأولى',
     structured.fields.companyName?.value)
  ok('  وكلها عالية الثقة',
     Object.values(structured.fields).every((f) => f.confidence === 'high'))

  ok('الرمز الفارغ لا يكسر شيئاً', parseQrPayload('').note !== null)
}

// ---- merging ----------------------------------------------------------------
console.log('\n  الدمج بين مصدرين\n')
{
  const qr = parseQrPayload('https://mc.gov.sa/verify/1010457821')
  const text = parseDocumentText('رقم السجل التجاري: 9999999999\nالمدينة: جدة', 'image')
  const merged = mergeExtractions(qr, text)

  // The QR read the number exactly; OCR guessed at it. The exact one must win,
  // or scanning a code and photographing the same page makes the result worse.
  ok('القراءة الدقيقة تتقدّم على التخمين',
     merged.fields.registryNumber?.value === '1010457821',
     merged.fields.registryNumber?.value)
  ok('وما انفرد به المصدر الثاني يبقى', merged.fields.city?.value === 'جدة')
}

// ---- text copied from the verification page ---------------------------------
// The Saudi Business Centre page renders in JavaScript and sits behind an Altcha
// challenge, so it cannot be pulled from a server. Copying the rendered page is
// what a scraper extension does, and the characters are exact — so the same
// parser must mark these as read rather than guessed.
console.log('\n  نص ملصوق من صفحة التحقّق\n')
{
  const page = [
    'المركز السعودي للتنافسية والأعمال',
    'بيانات السجل التجاري',
    'اسم الشركة:  شركة نجد الأولى للمقاولات',
    'رقم السجل التجاري:  1010776655',
    'حالة السجل:  نشط',
    'نوع الكيان:  شركة ذات مسؤولية محدودة',
    'المدينة:  الرياض',
    'تاريخ الانتهاء:  2028/11/02',
  ].join('\n')

  const r = parseDocumentText(page, 'paste', true)
  ok('الاسم مطابق', r.fields.companyName?.value === 'شركة نجد الأولى للمقاولات',
     r.fields.companyName?.value)
  ok('رقم السجل مطابق', r.fields.registryNumber?.value === '1010776655')
  ok('التاريخ يُقرأ', r.fields.crExpiryDate?.value === '2028-11-02', r.fields.crExpiryDate?.value)

  // The whole point of the distinction: exact text is a reading, OCR is a guess,
  // and the review screen colours them differently.
  ok('الحقول موسومة «مؤكَّد» لا «مُستخرَج»',
     ['companyName', 'registryNumber', 'crStatus', 'city'].every(
       (k) => r.fields[k]?.confidence === 'high'),
     Object.entries(r.fields).map(([k, v]) => `${k}=${v.confidence}`).join(' '))

  const asOcr = parseDocumentText(page, 'image', false)
  ok('ونفس النص عبر OCR يبقى «مُستخرَج»',
     asOcr.fields.companyName?.confidence === 'medium',
     asOcr.fields.companyName?.confidence)

  // A number with no label is a guess however clean the characters are.
  const bare = parseDocumentText('صفحة تحقّق\n1010776655', 'paste', true)
  ok('والرقم بلا عنوان يبقى تخميناً حتى في نص مطابق',
     bare.fields.registryNumber?.confidence === 'low',
     bare.fields.registryNumber?.confidence)
}

// ---- nothing at all ---------------------------------------------------------
console.log('')
{
  const empty = parseDocumentText('', 'pdf')
  ok('ملف بلا نص يقول ذلك', /لم يُقرأ/.test(empty.note || ''), empty.note || '')

  const junk = parseDocumentText('صورة غير واضحة ولا تحوي بيانات', 'image')
  ok('نص بلا حقول لا يدّعي نجاحاً',
     Object.keys(junk.fields).length === 0 && !!junk.note, junk.note || '')
}

console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ قارئ المستندات يستخرج ما يفهمه ويعترف بما لا يفهمه\n')
process.exit(fail ? 1 : 0)
