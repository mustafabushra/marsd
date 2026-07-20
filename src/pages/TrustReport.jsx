import { useState } from 'react'
import { DocumentIcon } from '../components/icons'

export default function TrustReport() {
  const [tier, setTier] = useState('full')

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: '#0F172A', borderRadius: '12px', padding: '10px 16px' }}>
        <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700 }}>عرض توضيحي — حالة البيانات:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setTier('full')} style={{ background: tier === 'full' ? '#16A34A' : '#334155', color: '#fff', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>تقييم موثوق</button>
          <button onClick={() => setTier('prelim')} style={{ background: tier === 'prelim' ? '#F59E0B' : '#334155', color: '#fff', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>تقييم أولي</button>
          <button onClick={() => setTier('none')} style={{ background: tier === 'none' ? '#EF4444' : '#334155', color: '#fff', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>بيانات غير كافية</button>
          <button onClick={() => setTier('locked')} style={{ background: tier === 'locked' ? '#3B82F6' : '#334155', color: '#fff', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>باقة مجانية (مقفل)</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '30px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '66px', height: '66px', borderRadius: '16px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 900, flex: 'none' }}>ن</div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>شركة نجد للمقاولات المحدودة</h1>
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>● سجل نشط</span>
            </div>
            <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap', fontSize: '14px', color: '#64748B', fontWeight: 600 }}>
              <span>القطاع: مقاولات</span>
              <span>المدينة: الرياض</span>
              <span>السجل: 1010234567</span>
              <span>عمر الشركة: 14 سنة</span>
            </div>
          </div>

          {tier === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '24px 30px', minWidth: '240px' }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🔒</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>لا توجد بيانات معتمدة كافية<br />لإصدار تقييم موثوق</div>
            </div>
          )}

          {tier === 'full' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: 'conic-gradient(#16A34A 0% 82%,#E2E8F0 82% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>82</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <div style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '999px', padding: '6px 16px', fontSize: '13.5px', fontWeight: 800, marginTop: '12px' }}>● مخاطر منخفضة</div>
            </div>
          )}

          {tier === 'prelim' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: 'conic-gradient(#F59E0B 0% 71%,#E2E8F0 71% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>71</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <div style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '999px', padding: '6px 16px', fontSize: '12.5px', fontWeight: 800, marginTop: '12px' }}>تقييم أولي — ثقة متوسطة</div>
            </div>
          )}

          {tier === 'locked' && (
            <div style={{ textAlign: 'center', flex: 'none', position: 'relative' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: 'conic-gradient(#16A34A 0% 82%,#E2E8F0 82% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'blur(7px)' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff' }}></div>
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px' }}>🔒</div>
              <div style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '999px', padding: '6px 16px', fontSize: '12.5px', fontWeight: 800, marginTop: '12px' }}>متاح في الباقة الأساسية</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '22px', paddingTop: '22px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>مستوى موثوقية التقرير</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A' }}>عالٍ — 34 تقرير معتمد</span>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: '88%', height: '100%', background: 'linear-gradient(90deg,#16A34A,#4ADE80)', borderRadius: '6px' }}></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>⬇ تحميل PDF</button>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>+ قائمة المراقبة</button>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              إضافة تقرير
              <DocumentIcon />
            </button>
          </div>
        </div>
      </div>

      {tier === 'none' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', textAlign: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: 900, color: '#B45309', marginBottom: '8px' }}>⚠ بيانات غير كافية لإصدار تقييم موثوق</div>
          <p style={{ fontSize: '14.5px', color: '#92400E', margin: '0 0 0 0', lineHeight: 1.7, textAlign: 'right' }}>عدد التقارير المعتمدة الحالية (3) أقل من الحد الأدنى المطلوب (5 تقارير). ساهم بتقريرك لمساعدة المجتمع على بناء تقييم دقيق.</p>
        </div>
      )}

      {tier === 'full' && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>تركيبة مؤشر الثقة</h3>
              <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>كيف تم احتساب الدرجة</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', height: '52px' }}>
              <div style={{ width: '30%', background: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>البيانات الرسمية 30%</div>
              <div style={{ width: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>بيانات المجتمع 50%</div>
              <div style={{ width: '20%', background: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>المنصة 20%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '18px' }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>الشركات التي قدّمت تقارير</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>18</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>عدد التقارير المعتمدة</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>34</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '62px', height: '62px', borderRadius: '50%', background: 'conic-gradient(#16A34A 0% 94%,#E2E8F0 94% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 900, color: '#15803D' }}>94%</div>
              </div>
              <div>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700 }}>نسبة الالتزام بالسداد</div>
                <div style={{ fontSize: '13px', color: '#16A34A', fontWeight: 800, marginTop: '3px' }}>ممتازة</div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
