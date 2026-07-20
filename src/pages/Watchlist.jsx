import { useState } from 'react'
import { AlertIcon } from '../components/icons'

export default function Watchlist() {
  const [companies] = useState([
    { name: 'مؤسسة الخليج للتجارة', score: '82', gaugeBg: 'conic-gradient(#16A34A 0% 82%,#E2E8F0 82% 100%)', pts: '10,25 20,18 30,22 40,15 50,20 60,12 70,18 80,10', lineColor: '#16A34A', trend: '↑ +2', tBg: '#F0FDF4', tColor: '#15803D' },
    { name: 'شركة واحة الابتكار', score: '75', gaugeBg: 'conic-gradient(#16A34A 0% 75%,#E2E8F0 75% 100%)', pts: '10,20 20,22 30,18 40,24 50,19 60,23 70,20 80,18', lineColor: '#16A34A', trend: '↑ +5', tBg: '#F0FDF4', tColor: '#15803D' },
    { name: 'شركة نجد للمقاولات', score: '78', gaugeBg: 'conic-gradient(#16A34A 0% 78%,#E2E8F0 78% 100%)', pts: '10,18 20,20 30,17 40,19 50,16 60,18 70,17 80,16', lineColor: '#16A34A', trend: '→ ±0', tBg: '#F1F5F9', tColor: '#64748B' }
  ])

  const [alerts] = useState([
    { title: 'انخفض تقييم "مؤسسة الخليج للتجارة" بمقدار 8 نقاط', time: 'قبل 4 ساعات', color: '#DC2626' },
    { title: 'ارتفع تقييم "شركة واحة الابتكار" بمقدار 5 نقاط', time: 'أمس', color: '#16A34A' },
    { title: 'ارتفع تقييم "شركة نجد للمقاولات" بمقدار نقطتين', time: 'قبل يومين', color: '#16A34A' }
  ])

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px' }}>
        {/* Left side: Companies */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexDirection: 'row-reverse' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>الشركات المُتابَعة</h3>
            <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>+ إضافة شركة</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {companies.map((w, idx) => (
              <div key={idx} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: w.gaugeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, color: '#1E2A52' }}>{w.score}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{w.name}</div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>مؤشر الثقة الحالي</div>
                </div>
                <svg viewBox="0 0 90 32" style={{ width: '96px', height: '34px', flex: 'none' }}>
                  <polyline points={w.pts} fill="none" stroke={w.lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></polyline>
                </svg>
                <span style={{ background: w.tBg, color: w.tColor, borderRadius: '8px', padding: '6px 13px', fontSize: '13.5px', fontWeight: 800, flex: 'none' }}>{w.trend}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side: Alerts */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>التنبيهات</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {alerts.map((alert, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '11px', flexDirection: 'row-reverse' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: alert.color, marginTop: '2px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }} title={alert.color === '#DC2626' ? 'انخفاض' : 'ارتفاع'}>
                  <AlertIcon />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{alert.title}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>{alert.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
