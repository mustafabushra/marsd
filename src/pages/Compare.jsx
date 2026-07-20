import { useState } from 'react'

export default function Compare() {
  const [companies] = useState([
    { name: 'شركة نجد للمقاولات', city: 'الرياض' },
    { name: 'الرياض للتجارة', city: 'الرياض' },
    { name: 'التقنية المتقدمة', city: 'الرياض' }
  ])

  const [comparisonRows] = useState([
    { label: 'مؤشر الثقة', vals: ['82', '65', '58'] },
    { label: 'عدد التقارير', vals: ['34', '12', '8'] },
    { label: 'حالة السداد', vals: ['94%', '81%', '68%'] },
    { label: 'متوسط التأخير', vals: ['3 أيام', '7 أيام', '12 يوم'] },
    { label: 'حالات التعثّر', vals: ['0', '2', '5'] },
    { label: 'عمر الشركة', vals: ['14 سنة', '9 سنوات', '5 سنوات'] }
  ])

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>مقارنة الشركات</h3>
        <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse' }}>
          <button style={{ background: '#fff', color: '#15803D', border: '1.5px solid #BBF7D0', borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>⬇ تصدير Excel</button>
          <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>⬇ تصدير PDF</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr' }}>
          <div style={{ padding: '20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13.5px', fontWeight: 800, color: '#64748B' }}>المؤشر</div>
          {companies.map((c, idx) => (
            <div key={idx} style={{ padding: '20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', textAlign: 'center' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4 }}>{c.name}</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>{c.city}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {comparisonRows.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ padding: '16px 20px', fontSize: '14px', fontWeight: 700, color: '#334155' }}>{row.label}</div>
            {row.vals.map((val, colIdx) => (
              <div
                key={colIdx}
                style={{
                  padding: '16px 20px',
                  borderRight: '1px solid #F1F5F9',
                  textAlign: 'center',
                  fontSize: '14.5px',
                  fontWeight: colIdx === 0 ? 800 : 700,
                  color: colIdx === 0 ? '#15803D' : '#334155',
                  background: colIdx === 0 ? '#F0FDF4' : '#fff'
                }}
              >
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
