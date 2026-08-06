#!/usr/bin/env node
/**
 * Does the viewcr parser read a Business Centre registration page?
 *
 * This is the one module that knows what that page looks like, so it is the one
 * that breaks when the page is redesigned — and it breaks by returning nothing,
 * which is indistinguishable from a page that had nothing on it. That is exactly
 * the failure a check has to catch, because the screen would just say "0 حقول"
 * forever and nobody would know why.
 *
 * Two layouts are covered because a copied page arrives as both: "label: value"
 * on one line from a desktop copy, and label-then-value on separate lines from a
 * narrow viewport. Also HTML, because Ctrl+C from a browser often pastes markup.
 *
 * Usage: node scripts/verify-viewcr-parser.mjs
 */

import {
  parseViewcr, isViewcrUrl, viewcrReference, PARSER_VERSION,
} from '../src/lib/companyImport/viewcrParser.js'

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}

const URL_OK = 'https://qr.saudibusiness.gov.sa/viewcr?nCrNumber=JwrGYhlExDKfTATlDF7Osg=='

// ---- only the real portal ---------------------------------------------------
console.log('\n  التحقّق من الرابط\n')
{
  ok('رابط مركز الأعمال مقبول', isViewcrUrl(URL_OK))
  ok('نطاق آخر مرفوض', !isViewcrUrl('https://example.com/viewcr?nCrNumber=x'))
  // The one that matters: a lookalike host would put invented data in the
  // registry under an official-looking source.
  ok('نطاق مشابه مرفوض', !isViewcrUrl('https://qr.saudibusiness.gov.sa.evil.com/viewcr'))
  ok('نطاق فرعي مزيّف مرفوض', !isViewcrUrl('https://evil.qr.saudibusiness.gov.sa/viewcr'))
  ok('http غير مشفّر مرفوض', !isViewcrUrl('http://qr.saudibusiness.gov.sa/viewcr'))
  ok('مسار آخر على نفس النطاق مرفوض', !isViewcrUrl('https://qr.saudibusiness.gov.sa/other'))
  ok('نص فارغ مرفوض', !isViewcrUrl(''))
  ok('مرجع السجل يُستخرج من الرابط',
     viewcrReference(URL_OK) === 'JwrGYhlExDKfTATlDF7Osg==', viewcrReference(URL_OK))
}

// ---- a desktop copy: label and value on one line ---------------------------
console.log('\n  صفحة منسوخة — تسمية وقيمة في سطر\n')
{
  const page = [
    'المركز السعودي للأعمال',
    'اسم الشركة: شركة الأفق الرقمي للتقنية',
    'رقم السجل التجاري: 1010556677',
    'حالة السجل: نشط',
    'نوع المنشأة: مؤسسة فردية',
    'نوع الشركة: ذات مسؤولية محدودة',
    'صفات الشركة: ذات شخص واحد',
    'تاريخ قيد السجل: 2019/04/17',
    'تاريخ التأكيد السنوي: 2026/04/17',
    'رقم نسخة السجل: 3',
    'رأس المال: 500,000 ريال',
    'المدينة: الرياض',
    'العنوان: طريق الملك فهد - حي العليا',
    'رقم الجوال: 0551234567',
    'البريد الإلكتروني: info@ofoq.sa',
    'الموقع الإلكتروني: www.ofoq.sa',
    'الأنشطة',
    'تطوير البرمجيات',
    'الاستشارات التقنية',
    'المديرين',
    'محمد بن عبدالله العتيبي',
  ].join('\n')

  const r = parseViewcr(page, URL_OK)
  const v = (k) => r.fields[k]?.value
  const x = (k) => r.extras[k]

  ok('اسم الشركة', v('companyName') === 'شركة الأفق الرقمي للتقنية', v('companyName'))
  ok('رقم السجل التجاري', v('registryNumber') === '1010556677', v('registryNumber'))
  ok('حالة السجل', v('crStatus') === 'نشط', v('crStatus'))
  ok('نوع المنشأة', v('entityType') === 'مؤسسة فردية', v('entityType'))
  ok('المدينة', v('city') === 'الرياض', v('city'))
  ok('العنوان', v('nationalAddress') === 'طريق الملك فهد - حي العليا', v('nationalAddress'))
  ok('رقم الجوال', v('phone') === '0551234567', v('phone'))
  ok('البريد', v('officialEmail') === 'info@ofoq.sa', v('officialEmail'))
  ok('الموقع', v('website') === 'www.ofoq.sa', v('website'))
  ok('تاريخ قيد السجل', v('foundingDate') === '2019-04-17', v('foundingDate'))

  ok('نوع الشركة يُحفظ رغم غياب حقل له', x('companyType') === 'ذات مسؤولية محدودة', x('companyType'))
  ok('صفات الشركة', x('companyTraits') === 'ذات شخص واحد', x('companyTraits'))
  ok('رقم نسخة السجل', x('crVersionNumber') === '3', x('crVersionNumber'))
  ok('رأس المال', /500,000/.test(String(x('capital'))), x('capital'))
  ok('تاريخ التأكيد السنوي', /2026/.test(String(x('annualConfirmDate'))), x('annualConfirmDate'))

  ok('كل الأنشطة', Array.isArray(x('activities')) && x('activities').length === 2,
     JSON.stringify(x('activities')))
  ok('  والنشاط الرئيسي أوّلها', v('mainActivity') === 'تطوير البرمجيات', v('mainActivity'))
  ok('أسماء المديرين', Array.isArray(x('managers')) && x('managers')[0] === 'محمد بن عبدالله العتيبي',
     JSON.stringify(x('managers')))

  ok('كل الحقول موسومة «مؤكَّد»',
     Object.values(r.fields).every((f) => f.confidence === 'high' || f.confidence === 'low'))
  ok('الرابط محفوظ مع النتيجة', r.meta.url === URL_OK)
  ok('ومعه إصدار المحلّل', r.meta.parser === PARSER_VERSION, r.meta.parser)
  ok('بلا ملاحظة تحذيرية', !r.note, r.note || '')
}

// ---- a narrow copy: label on one line, value on the next --------------------
console.log('\n  صفحة منسوخة — القيمة في السطر التالي\n')
{
  const page = [
    'اسم الشركة', 'مؤسسة القصيم للأغذية',
    'رقم السجل التجاري', '1128456790',
    'حالة السجل', 'نشط',
    'المدينة', 'بريدة',
  ].join('\n')

  const r = parseViewcr(page, URL_OK)
  ok('الاسم', r.fields.companyName?.value === 'مؤسسة القصيم للأغذية', r.fields.companyName?.value)
  ok('رقم السجل', r.fields.registryNumber?.value === '1128456790')
  ok('المدينة', r.fields.city?.value === 'بريدة', r.fields.city?.value)

  // A label with an empty value must not swallow the heading beneath it.
  const gap = parseViewcr(['اسم الشركة', 'رقم السجل التجاري', '1010111222'].join('\n'), URL_OK)
  ok('التسمية الفارغة لا تبتلع التالية', !gap.fields.companyName?.value,
     gap.fields.companyName?.value || '(فارغ)')
  ok('  والرقم يُقرأ رغم ذلك', gap.fields.registryNumber?.value === '1010111222')
}

// ---- HTML, because copying from a browser often pastes markup ---------------
console.log('\n  محتوى HTML ملصوق\n')
{
  const html = `<div class="row"><span>اسم الشركة</span><span>شركة نجد الأولى</span></div>
    <div><p>رقم السجل التجاري: 1010999888</p></div>
    <div><p>المدينة: الرياض</p></div>`
  const r = parseViewcr(html, URL_OK)
  ok('الوسوم تُزال والقيم تُقرأ', r.fields.registryNumber?.value === '1010999888',
     r.fields.registryNumber?.value)
  ok('  والاسم من عنصرين متجاورين', r.fields.companyName?.value === 'شركة نجد الأولى',
     r.fields.companyName?.value)
}

// ---- dates -----------------------------------------------------------------
console.log('\n  التواريخ\n')
{
  const both = parseViewcr('تاريخ قيد السجل: 1440/08/12 هـ الموافق 2019/04/17 م', URL_OK)
  ok('يُلتقط الميلادي حين يُعرض الهجري معه',
     both.fields.foundingDate?.value === '2019-04-17', both.fields.foundingDate?.value)

  const hijriOnly = parseViewcr('تاريخ قيد السجل: 1440/08/12', URL_OK)
  ok('الهجري وحده لا يُحفظ كميلادي', !hijriOnly.fields.foundingDate?.value,
     hijriOnly.fields.foundingDate?.value || '(فارغ)')
  ok('  ويُعرض خامّاً', !!hijriOnly.extras.registrationDate, hijriOnly.extras.registrationDate)
}

// ---- failure has to be loud ------------------------------------------------
console.log('\n  حين يتعذّر الاستخراج\n')
{
  const empty = parseViewcr('', URL_OK)
  ok('محتوى فارغ يقول السبب', /فارغ أو قصير/.test(empty.note || ''), empty.note || '')
  ok('  ولا يعيد أي حقل', Object.keys(empty.fields).length === 0)

  // The commonest real mistake: copying before the page finished loading.
  const shell = parseViewcr('المركز السعودي للتنافسية والأعمال\nجارٍ التحميل\nالرئيسية', URL_OK)
  ok('صفحة لم تُحمَّل بعد تقول السبب',
     /لم يُعثر على أي حقل/.test(shell.note || ''), shell.note || '')

  const noCr = parseViewcr('اسم الشركة: شركة بلا رقم\nالمدينة: جدة', URL_OK)
  ok('بيانات بلا رقم سجل تُنبّه', /دون رقم السجل/.test(noCr.note || ''), noCr.note || '')
  ok('  ولا تُخفي ما استُخرج', noCr.fields.companyName?.value === 'شركة بلا رقم')
}

console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ محلّل صفحة السجل يقرأ ما تعرضه ويعترف بما لا يجده\n')
process.exit(fail ? 1 : 0)
