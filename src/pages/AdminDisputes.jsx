import { useState } from 'react'

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([
    {
      id: 'DSP001',
      plaintiff: 'شركة الراجحي',
      defendant: 'شركة النور',
      category: 'دقة بيانات',
      status: 'open',
      priority: 'high',
      date: '2026-07-14',
      daysOpen: 2,
      description: 'عدم دقة البيانات المالية في التقرير',
    },
    {
      id: 'DSP002',
      plaintiff: 'مجموعة المختار',
      defendant: 'شركة زهرة',
      category: 'تأخر تقرير',
      status: 'in_review',
      priority: 'medium',
      date: '2026-07-08',
      daysOpen: 7,
      description: 'تأخر بـ 5 أيام في إصدار التقرير المطلوب',
    },
    {
      id: 'DSP003',
      plaintiff: 'شركة الروابي',
      defendant: 'شركة الوادي',
      category: 'شكوى عامة',
      status: 'resolved',
      priority: 'low',
      date: '2026-06-28',
      daysOpen: 17,
      description: 'استفسار عام عن خدمات التقييم',
    },
  ])

  const [selectedDispute, setSelectedDispute] = useState(null)
  const [resolution, setResolution] = useState('')

  const statusConfig = {
    open: { label: 'مفتوح', color: '#FEE2E2', textColor: '#DC2626' },
    in_review: { label: 'قيد المراجعة', color: '#FEF3C7', textColor: '#B45309' },
    resolved: { label: 'تم الحل', color: '#DCFCE7', textColor: '#15803D' },
  }

  const priorityConfig = {
    low: { label: 'منخفضة', color: '#E0F2FE' },
    medium: { label: 'متوسطة', color: '#FEF3C7' },
    high: { label: 'عالية', color: '#FEE2E2' },
  }

  const handleResolve = (id) => {
    if (!resolution) return
    setDisputes(disputes.map(d => d.id === id ? { ...d, status: 'resolved' } : d))
    setSelectedDispute(null)
    setResolution('')
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          النزاعات والشكاوى
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة ومعالجة نزاعات العملاء
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المجموع</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#1E2A52', margin: 0, textAlign: 'right' }}>
            {disputes.length}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المفتوحة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#DC2626', margin: 0, textAlign: 'right' }}>
            {disputes.filter(d => d.status === 'open').length}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>قيد المراجعة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#F59E0B', margin: 0, textAlign: 'right' }}>
            {disputes.filter(d => d.status === 'in_review').length}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المحلولة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>
            {disputes.filter(d => d.status === 'resolved').length}
          </p>
        </div>
      </div>

      {/* Disputes Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الرقم</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المشتكي</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الفئة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الأولوية</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map(dispute => {
              const statusInfo = statusConfig[dispute.status]
              const priorityInfo = priorityConfig[dispute.priority]
              return (
                <tr key={dispute.id} style={{ borderBottom: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0', fontFamily: 'monospace' }}>
                    {dispute.id}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                    {dispute.plaintiff}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                    {dispute.category}
                  </td>
                  <td style={{ padding: '16px', borderLeft: '1px solid #E2E8F0' }}>
                    <span style={{
                      padding: '4px 10px',
                      background: statusInfo.color,
                      color: statusInfo.textColor,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '16px', borderLeft: '1px solid #E2E8F0' }}>
                    <span style={{
                      padding: '4px 10px',
                      background: priorityInfo.color,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {priorityInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <button
                      onClick={() => setSelectedDispute(dispute)}
                      style={{
                        padding: '6px 12px',
                        background: '#E0F2FE',
                        color: '#0369A1',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      عرض
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedDispute && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexDirection: 'row-reverse' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {selectedDispute.id}
              </h2>
              <button
                onClick={() => {
                  setSelectedDispute(null)
                  setResolution('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>الوصف:</p>
              <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, textAlign: 'right', lineHeight: 1.6 }}>
                {selectedDispute.description}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 4px 0', textAlign: 'right' }}>المشتكي:</p>
                <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, fontWeight: 600, textAlign: 'right' }}>
                  {selectedDispute.plaintiff}
                </p>
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 4px 0', textAlign: 'right' }}>المشكو منه:</p>
                <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, fontWeight: 600, textAlign: 'right' }}>
                  {selectedDispute.defendant}
                </p>
              </div>
            </div>

            {selectedDispute.status !== 'resolved' && (
              <div style={{ marginBottom: '16px' }}>
                <textarea
                  placeholder="أدخل قرار الحل..."
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px 14px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'Tajawal',
                    textAlign: 'right',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
              {selectedDispute.status !== 'resolved' && (
                <button
                  onClick={() => handleResolve(selectedDispute.id)}
                  disabled={!resolution}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: !resolution ? '#CCCCCC' : '#16A34A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: !resolution ? 'not-allowed' : 'pointer',
                  }}
                >
                  حفظ القرار
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedDispute(null)
                  setResolution('')
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F8FAFC',
                  color: '#1E2A52',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
