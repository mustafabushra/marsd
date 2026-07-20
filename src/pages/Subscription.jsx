import { useState } from 'react'

export default function Subscription() {
  const [invoices] = useState([
    { no: 'INV-2026-001', date: '2026-06-15', amount: '1,499 ر.س', status: 'مدفوعة' },
    { no: 'INV-2026-002', date: '2026-05-15', amount: '1,499 ر.س', status: 'مدفوعة' },
    { no: 'INV-2026-003', date: '2026-04-15', amount: '1,499 ر.س', status: 'مدفوعة' }
  ])

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <div style={{ background: 'linear-gradient(135deg,#1E2A52,#2A3B6E)', borderRadius: '16px', padding: '26px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '13.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>باقتك الحالية</div>
              <div style={{ fontSize: '30px', fontWeight: 900 }}>الاحترافية</div>
            </div>
            <span style={{ background: '#16A34A', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>نشطة</span>
          </div>
          <div style={{ fontSize: '13.5px', color: '#CBD5E1', margin: '14px 0 22px' }}>تتجدد تلقائياً في 14 يوليو 2026 · 1,499 ر.س / شهرياً</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>ترقية الباقة</button>
            <button style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>إدارة الفوترة</button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>استهلاك الباقة</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>عمليات البحث</span>
                <span>72 / 200</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '36%', height: '100%', background: '#16A34A', borderRadius: '5px' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>المستخدمون</span>
                <span>4 / 8</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '50%', height: '100%', background: '#1E2A52', borderRadius: '5px' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', flexDirection: 'row-reverse' }}>
                <span>قوائم المراقبة</span>
                <span>9 / 25</span>
              </div>
              <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '36%', height: '100%', background: '#7C3AED', borderRadius: '5px' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الفواتير</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1fr 0.8fr', padding: '13px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>رقم الفاتورة</span>
          <span>التاريخ</span>
          <span>المبلغ</span>
          <span>الحالة</span>
          <span></span>
        </div>
        {invoices.map((inv, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1fr 0.8fr', padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{inv.no}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{inv.date}</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>{inv.amount}</span>
            <span>
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{inv.status}</span>
            </span>
            <span style={{ fontSize: '13px', color: '#16A34A', fontWeight: 800, cursor: 'pointer' }}>تحميل PDF</span>
          </div>
        ))}
      </div>
    </main>
  )
}
