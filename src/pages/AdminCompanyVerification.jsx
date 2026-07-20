import { useState } from 'react'

export default function AdminCompanyVerification() {
  const [verificationRequests, setVerificationRequests] = useState([
    {
      id: 1,
      company: 'الشركة السريعة',
      crNumber: '1010067890',
      submittedDate: '2026-07-14',
      status: 'pending',
      documents: ['شهادة السجل التجاري', 'هوية المالك'],
      reviewer: null,
    },
    {
      id: 2,
      company: 'مجموعة التطوير',
      crNumber: '1010023456',
      submittedDate: '2026-07-12',
      status: 'reviewing',
      documents: ['شهادة السجل التجاري', 'ترخيص البلدية', 'هوية المالك'],
      reviewer: 'محمد علي',
    },
    {
      id: 3,
      company: 'شركة النمو',
      crNumber: '1010098765',
      submittedDate: '2026-07-10',
      status: 'approved',
      documents: ['شهادة السجل التجاري', 'هوية المالك'],
      reviewer: 'فاطمة خالد',
    },
    {
      id: 4,
      company: 'الشركة القديمة',
      crNumber: '1010011111',
      submittedDate: '2026-07-08',
      status: 'rejected',
      documents: ['شهادة السجل التجاري'],
      reviewer: 'أحمد سالم',
      rejectionReason: 'مستندات ناقصة',
    },
  ])

  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewNotes, setReviewNotes] = useState('')

  const statusConfig = {
    pending: { label: 'قيد الانتظار', bg: '#FEF3C7', color: '#B45309' },
    reviewing: { label: 'قيد المراجعة', bg: '#E0F2FE', color: '#0369A1' },
    approved: { label: 'موافق', bg: '#DCFCE7', color: '#15803D' },
    rejected: { label: 'مرفوض', bg: '#FEE2E2', color: '#DC2626' },
  }

  const handleApprove = (id) => {
    setVerificationRequests(
      verificationRequests.map(r =>
        r.id === id ? { ...r, status: 'approved', reviewer: 'أنت' } : r
      )
    )
    setSelectedRequest(null)
  }

  const handleReject = (id) => {
    setVerificationRequests(
      verificationRequests.map(r =>
        r.id === id ? { ...r, status: 'rejected', reviewer: 'أنت', rejectionReason: reviewNotes } : r
      )
    )
    setSelectedRequest(null)
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          التحقق من الشركات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          مراجعة والموافقة على طلبات التحقق
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FEF3C7', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#78350F', margin: '0 0 8px 0', textAlign: 'right' }}>قيد الانتظار</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#B45309', margin: 0, textAlign: 'right' }}>
            {verificationRequests.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div style={{ background: '#E0F2FE', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#0C4A6E', margin: '0 0 8px 0', textAlign: 'right' }}>قيد المراجعة</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>
            {verificationRequests.filter(r => r.status === 'reviewing').length}
          </p>
        </div>
        <div style={{ background: '#DCFCE7', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#15803D', margin: '0 0 8px 0', textAlign: 'right' }}>موافق عليه</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>
            {verificationRequests.filter(r => r.status === 'approved').length}
          </p>
        </div>
        <div style={{ background: '#FEE2E2', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '12px', color: '#7F1D1D', margin: '0 0 8px 0', textAlign: 'right' }}>مرفوض</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#DC2626', margin: 0, textAlign: 'right' }}>
            {verificationRequests.filter(r => r.status === 'rejected').length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>السجل التجاري</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>التاريخ</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {verificationRequests.map(request => {
              const config = statusConfig[request.status]
              return (
                <tr key={request.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                    {request.company}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0', fontFamily: 'monospace' }}>
                    {request.crNumber}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                    {request.submittedDate}
                  </td>
                  <td style={{ padding: '16px', borderLeft: '1px solid #E2E8F0' }}>
                    <span style={{
                      padding: '4px 10px',
                      background: config.bg,
                      color: config.color,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      {config.label}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    {request.status === 'pending' || request.status === 'reviewing' ? (
                      <button
                        onClick={() => setSelectedRequest(request)}
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
                        راجع
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        {request.reviewer}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {selectedRequest && (
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
            maxWidth: '550px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <div style={{ marginBottom: '20px', flexDirection: 'row-reverse' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>
                {selectedRequest.company}
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, textAlign: 'right' }}>
                {selectedRequest.crNumber}
              </p>
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المستندات المرفوعة:</p>
              <ul style={{ margin: 0, paddingRight: '20px', textAlign: 'right' }}>
                {selectedRequest.documents.map((doc, idx) => (
                  <li key={idx} style={{ fontSize: '13px', color: '#0F172A', marginBottom: '4px' }}>
                    ✓ {doc}
                  </li>
                ))}
              </ul>
            </div>

            <textarea
              placeholder="ملاحظات المراجعة..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px 14px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
                marginBottom: '16px',
              }}
            />

            <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
              <button
                onClick={() => handleApprove(selectedRequest.id)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#16A34A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✓ الموافقة
              </button>
              <button
                onClick={() => handleReject(selectedRequest.id)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✗ الرفض
              </button>
              <button
                onClick={() => {
                  setSelectedRequest(null)
                  setReviewNotes('')
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
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
