import { useState } from 'react'

export default function AdminFraudDetection() {
  const [alerts, setAlerts] = useState([
    { id: 1, company: 'الشركة السريعة', riskScore: 87, type: 'تقرير مشبوه', status: 'active', date: '2026-07-15' },
    { id: 2, company: 'مجموعة النمو', riskScore: 62, type: 'نمط غير عادي', status: 'active', date: '2026-07-14' },
    { id: 3, company: 'الشركة الجديدة', riskScore: 45, type: 'بيانات ناقصة', status: 'resolved', date: '2026-07-10' },
    { id: 4, company: 'الشركة الدولية', riskScore: 78, type: 'تحويل حسابات مريب', status: 'active', date: '2026-07-13' },
  ])

  const [suspiciousActivities] = useState([
    { id: 1, activity: 'تعديل البيانات المالية', count: 5, severity: 'high' },
    { id: 2, activity: 'تنزيل بيانات كثيفة', count: 12, severity: 'medium' },
    { id: 3, activity: 'محاولات دخول فاشلة', count: 8, severity: 'high' },
    { id: 4, activity: 'تغيير إعدادات الحساب', count: 3, severity: 'low' },
  ])

  const getRiskColor = (score) => {
    if (score >= 75) return { bg: '#FEE2E2', color: '#DC2626' }
    if (score >= 50) return { bg: '#FEF3C7', color: '#B45309' }
    return { bg: '#E0F2FE', color: '#0369A1' }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          كشف الاحتيال والمخاطر
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          مراقبة وتحليل الأنشطة المريبة
        </p>
      </div>

      {/* Risk Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FEE2E2', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#7F1D1D', margin: '0 0 8px 0', textAlign: 'right' }}>تنبيهات عالية</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#DC2626', margin: 0, textAlign: 'right' }}>2</p>
        </div>
        <div style={{ background: '#FEF3C7', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#78350F', margin: '0 0 8px 0', textAlign: 'right' }}>تنبيهات متوسطة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#B45309', margin: 0, textAlign: 'right' }}>1</p>
        </div>
        <div style={{ background: '#DCFCE7', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#15803D', margin: '0 0 8px 0', textAlign: 'right' }}>محلولة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>1</p>
        </div>
        <div style={{ background: '#E0F2FE', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#0C4A6E', margin: '0 0 8px 0', textAlign: 'right' }}>مراقبة عامة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>12</p>
        </div>
      </div>

      {/* Active Alerts */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          التنبيهات النشطة
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {alerts.filter(a => a.status === 'active').map(alert => {
            const riskColor = getRiskColor(alert.riskScore)
            return (
              <div key={alert.id} style={{
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexDirection: 'row-reverse',
              }}>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0' }}>
                    {alert.company}
                  </p>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                    {alert.type} • {alert.date}
                  </p>
                </div>
                <div style={{
                  minWidth: '80px',
                  textAlign: 'center',
                  padding: '8px 12px',
                  background: riskColor.bg,
                  color: riskColor.color,
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}>
                  {alert.riskScore}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Suspicious Activities */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          الأنشطة المريبة
        </h2>
        <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>النشاط</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>العدد</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569' }}>الخطورة</th>
              </tr>
            </thead>
            <tbody>
              {suspiciousActivities.map(activity => {
                const severityConfig = {
                  high: { color: '#DC2626', bg: '#FEE2E2' },
                  medium: { color: '#B45309', bg: '#FEF3C7' },
                  low: { color: '#15803D', bg: '#DCFCE7' },
                }
                const config = severityConfig[activity.severity]
                return (
                  <tr key={activity.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                      {activity.activity}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                      {activity.count}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: config.bg,
                        color: config.color,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {activity.severity === 'high' && 'عالية'}
                        {activity.severity === 'medium' && 'متوسطة'}
                        {activity.severity === 'low' && 'منخفضة'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
          إعدادات الكشف
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '13px', color: '#475569' }}>تفعيل الكشف التلقائي</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '13px', color: '#475569' }}>إرسال تنبيهات البريد الإلكتروني</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '13px', color: '#475569' }}>حظر الحسابات ذات المخاطر العالية تلقائياً</span>
          </label>
        </div>
        <button style={{
          marginTop: '16px',
          padding: '10px 16px',
          background: '#16A34A',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}>
          حفظ الإعدادات
        </button>
      </div>
    </div>
  )
}
