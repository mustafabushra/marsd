import { useState } from 'react'

export default function AdminPayments() {
  const [payments, setPayments] = useState([
    { id: 1, company: 'أكمل للمقاولات', amount: 5000, status: 'completed', date: '2026-07-12', method: 'بطاقة ائتمان', reference: 'TXN001' },
    { id: 2, company: 'نوفا للتسويق', amount: 1500, status: 'completed', date: '2026-07-10', method: 'تحويل بنكي', reference: 'TXN002' },
    { id: 3, company: 'إسمنت المملكة', amount: 3000, status: 'pending', date: '2026-07-15', method: 'بطاقة ائتمان', reference: 'TXN003' },
    { id: 4, company: 'ديكورا للتصميم', amount: 500, status: 'failed', date: '2026-07-08', method: 'محفظة رقمية', reference: 'TXN004' },
  ])

  const [paymentConfig, setPaymentConfig] = useState({
    stripe_key: 'sk_live_*****',
    payfort_merchant: 'MERCHANT_ID',
    bank_transfer_account: '123456789',
    wallet_threshold: 100,
    retry_failed: true,
  })

  const [showConfig, setShowConfig] = useState(false)

  const statusColors = {
    completed: { bg: '#DCFCE7', color: '#15803D', label: 'مكتمل' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'قيد الانتظار' },
    failed: { bg: '#FEE2E2', color: '#DC2626', label: 'فشل' },
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            إدارة المدفوعات
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            تتبع ومراقبة المدفوعات والمعاملات المالية
          </p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          style={{
            padding: '10px 20px',
            background: '#1E2A52',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⚙️ إعدادات الدفع
        </button>
      </div>

      {/* Payment Config */}
      {showConfig && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            إعدادات البوابات المالية
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <input
              type="password"
              placeholder="مفتاح Stripe API"
              value={paymentConfig.stripe_key}
              onChange={(e) => setPaymentConfig({ ...paymentConfig, stripe_key: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <input
              type="text"
              placeholder="معرف التاجر PayFort"
              value={paymentConfig.payfort_merchant}
              onChange={(e) => setPaymentConfig({ ...paymentConfig, payfort_merchant: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <input
              type="text"
              placeholder="رقم حساب التحويل البنكي"
              value={paymentConfig.bank_transfer_account}
              onChange={(e) => setPaymentConfig({ ...paymentConfig, bank_transfer_account: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
                gridColumn: '1 / -1',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#475569' }}>
              <input
                type="checkbox"
                checked={paymentConfig.retry_failed}
                onChange={(e) => setPaymentConfig({ ...paymentConfig, retry_failed: e.target.checked })}
                style={{ width: '16px', height: '16px' }}
              />
              إعادة محاولة المدفوعات الفاشلة تلقائيًا
            </label>
          </div>
          <button
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              background: '#16A34A',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            حفظ الإعدادات
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', textAlign: 'right' }}>إجمالي المدفوعات</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16A34A' }}>87,500 ر.س</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', textAlign: 'right' }}>المكتملة</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1E2A52' }}>2</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', textAlign: 'right' }}>قيد الانتظار</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#B45309' }}>1</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', textAlign: 'right' }}>فاشلة</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#DC2626' }}>1</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المبلغ</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الطريقة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>التاريخ</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>المرجع</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => {
              const statusInfo = statusColors[payment.status]
              return (
                <tr key={payment.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                    {payment.company}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                    {payment.amount.toLocaleString()} ر.س
                  </td>
                  <td style={{ padding: '16px', borderLeft: '1px solid #E2E8F0' }}>
                    <span style={{
                      padding: '4px 10px',
                      background: statusInfo.bg,
                      color: statusInfo.color,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                    {payment.method}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                    {payment.date}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', fontFamily: 'monospace' }}>
                    {payment.reference}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
