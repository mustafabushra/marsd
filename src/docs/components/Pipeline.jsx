import { DOC } from '../tokens'

/**
 * مسار الملف من المتصفّح إلى التخزين الدائم.
 *
 * ============================================================================
 * لماذا SVG مرسوم لا صورة
 * ============================================================================
 * الرسم يتغيّر مع المسار. وصورةٌ تُصدَّر مرّة تتعفّن عند أول تعديل في
 * البوّابة، ولا يلاحظ أحد لأنها تبدو صحيحة.
 *
 * وهذا نصٌّ وحدود: يُقرأ بقارئ الشاشة، ويُبحث فيه، ويكبر مع الخطّ، ولا
 * يحتاج ملفّاً في `public/`.
 *
 * ============================================================================
 * الاتجاه
 * ============================================================================
 * المسار عمودي لا أفقي — فالعمودي لا ينقلب بين RTL و LTR، ويقرأه الهاتف
 * بلا تمرير جانبي.
 */

const STEPS = [
  { t: 'المتصفّح', s: 'اختيار الملف · فحص مبكر للتوقيع' },
  { t: 'المصادقة', s: 'جلسة Clerk — بلا هويّة لا رفع' },
  { t: 'دلو الحجر', s: 'مجلّد باسم صاحبه · لا قراءة ولا حذف' },
  { t: 'البوّابة', s: 'تُنزّل البايتات بمفتاح خدمة وتفحصها', mark: true },
  { t: 'الفحص', s: 'التوقيع · المحتوى النشط · Polyglot · الأرشيف' },
  { t: 'التعقيم', s: 'إعادة ترميز PNG · تنظيف حاويات JPEG و WEBP' },
  { t: 'SHA-256', s: 'تجزئة تُسجَّل — وما رُفض يُعرف بها' },
  { t: 'تصريح لمرّة واحدة', s: 'حكم نظيف بالمسار والحجم · عشر دقائق', mark: true },
  { t: 'الترقية', s: 'بهويّة الطالب — فتنطبق كل سياسة قائمة' },
  { t: 'التخزين الدائم', s: 'التصريح يُنفَق · الحجر يُفرَّغ', end: true },
]

export default function Pipeline () {
  return (
    <figure style={{
      margin: '22px 0', border: `1px solid ${DOC.border}`,
      borderRadius: '14px', padding: '20px 18px', background: DOC.rail,
    }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {STEPS.map((s, i) => (
          <li key={s.t} style={{ display: 'flex', gap: '13px', alignItems: 'stretch' }}>
            {/* العمود: نقطة وخيط */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: '20px',
            }}>
              <span aria-hidden="true" style={{
                width: s.mark ? '13px' : '9px', height: s.mark ? '13px' : '9px',
                borderRadius: '50%', marginTop: '6px', flex: 'none',
                background: s.end ? DOC.accent : s.mark ? DOC.brand : '#fff',
                border: `2px solid ${s.end ? DOC.accent : s.mark ? DOC.brand : '#CBD5E1'}`,
              }} />
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" style={{
                  width: '2px', flex: 1, minHeight: '22px',
                  background: `linear-gradient(${DOC.border}, ${DOC.border})`,
                }} />
              )}
            </div>

            <div style={{ paddingBottom: i < STEPS.length - 1 ? '16px' : 0, minWidth: 0 }}>
              <div style={{
                fontSize: '14px', fontWeight: 800,
                color: s.end ? '#15803D' : s.mark ? DOC.brand : DOC.ink,
                lineHeight: 1.5,
              }}>
                {s.t}
              </div>
              <div style={{ fontSize: '13px', color: DOC.muted, lineHeight: 1.85, marginTop: '2px' }}>
                {s.s}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <figcaption style={{
        marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${DOC.border}`,
        fontSize: '12.5px', color: DOC.muted, lineHeight: 1.9,
      }}>
        الفشل مُغلَق في كل خطوة: ما لم يُحكم عليه بالنظافة يبقى في الحجر ولا يُرقّى.
      </figcaption>
    </figure>
  )
}
