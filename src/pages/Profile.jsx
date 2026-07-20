import { useState } from 'react'

export default function Profile() {
  const [formData] = useState({
    companyName: 'شركة نجد للمقاولات المحدودة',
    commercialNumber: '1010234567',
    sector: 'مقاولات',
    city: 'الرياض',
    phone: '0112345678'
  })

  const [notifications] = useState([
    { type: 'تنبيه تقرير', text: 'تم اعتماد تقرير جديد لشركة من شركاتك', time: 'قبل ساعتين', bg: '#F0FDF4', c: '#15803D' },
    { type: 'تحديث تقييم', text: 'ارتفع تقييم شركة "مؤسسة الخليج" بمقدار 5 نقاط', time: 'أمس', bg: '#F0FDF4', c: '#15803D' }
  ])

  const [toggles, setToggles] = useState({
    approve: true,
    reject: true,
    watch: true,
    request: false
  })

  const handleToggle = (key) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
        {/* Left: Company Data */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '26px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>بيانات الشركة</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1/3' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>اسم الشركة</label>
              <input defaultValue={formData.companyName} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>السجل التجاري</label>
              <input defaultValue={formData.commercialNumber} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>القطاع</label>
              <input defaultValue={formData.sector} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>المدينة</label>
              <input defaultValue={formData.city} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none' }} />
            </div>
            <div style={{ gridColumn: '1/3' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>رقم التواصل</label>
              <input defaultValue={formData.phone} style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none' }} />
            </div>
          </div>
          <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', marginTop: '20px' }}>حفظ التغييرات</button>
        </div>

        {/* Right: Notifications */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>الإشعارات</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
            {notifications.map((n, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '11px', padding: '13px', borderRadius: '11px', background: n.bg, border: '1px solid #F1F5F9' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: n.c, marginTop: '5px', flex: 'none' }}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: n.c }}>{n.type}</div>
                  <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, margin: '2px 0', lineHeight: 1.5 }}>{n.text}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0', textAlign: 'right' }}>تفضيلات الإشعارات</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
            {[
              { key: 'approve', label: 'اعتماد تقرير' },
              { key: 'reject', label: 'رفض تقرير' },
              { key: 'watch', label: 'تغيّر تقييم شركة مراقَبة' },
              { key: 'request', label: 'قبول طلب إضافة شركة' }
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#334155', fontWeight: 600 }}>{item.label}</span>
                <button onClick={() => handleToggle(item.key)} style={{ width: '44px', height: '24px', borderRadius: '999px', border: 0, background: toggles[item.key] ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: toggles[item.key] ? '22px' : '2px', transition: 'left 0.2s' }}></span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
