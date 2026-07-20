/**
 * Admin Reports Management Page
 * View and manage all reports submitted on the platform
 */

import React, { useState, useEffect } from 'react'
import { useApiPaginated } from '../../hooks/useApi'
import { Report, Pagination } from '../../types'
import ReportsTable from '../../components/tables/ReportsTable'
import Button from '../../components/common/Button'

const AdminReports: React.FC = () => {
  const token = localStorage.getItem('accessToken')
  const userRole = localStorage.getItem('userRole')
  const [filters, setFilters] = useState({
    status: 'all',
    dateFrom: '',
    dateTo: '',
  })
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingReportId, setRejectingReportId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!token || userRole !== 'platform_admin') {
      window.location.href = '/login'
    }
  }, [])

  const fetchReports = async (page: number, limit: number) => {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', limit.toString())
    if (filters.status !== 'all') {
      params.append('status', filters.status)
    }
    if (filters.dateFrom) {
      params.append('dateFrom', filters.dateFrom)
    }
    if (filters.dateTo) {
      params.append('dateTo', filters.dateTo)
    }

    const response = await fetch(`/api/admin/reports?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch reports')
    }

    const data = await response.json()
    return {
      data: data.reports || [],
      pagination: data.pagination || { page: 1, limit: 20, total: 0, pages: 1 },
    }
  }

  const { data: reports, loading, error, goToPage, page, pagination, refresh } = useApiPaginated(
    fetchReports,
    1,
    20
  )

  const handleApprove = async (reportId: string) => {
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approvedAt: new Date().toISOString() }),
      })

      if (response.ok) {
        await refresh()
        alert('تمت الموافقة على التقرير')
      }
    } catch (error) {
      alert('فشل في الموافقة على التقرير')
    }
  }

  const handleReject = async () => {
    if (!rejectingReportId) return

    try {
      const response = await fetch(`/api/admin/reports/${rejectingReportId}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewNotes: rejectReason,
          rejectedAt: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        await refresh()
        setShowRejectModal(false)
        setRejectingReportId(null)
        setRejectReason('')
        alert('تم رفض التقرير')
      }
    } catch (error) {
      alert('فشل في رفض التقرير')
    }
  }

  const handleApplyFilters = () => {
    goToPage(1)
  }

  return (
    <div style={containerStyles}>
      <div style={contentWrapperStyles}>
        {/* Header */}
        <div style={headerStyles}>
          <h1 style={titleStyles}>إدارة التقارير</h1>
          <p style={subtitleStyles}>عرض وإدارة جميع التقارير المرسلة على المنصة</p>
        </div>

        {/* Filters */}
        <div style={filterContainerStyles}>
          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>الحالة</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={filterSelectStyles}
            >
              <option value="all">الكل</option>
              <option value="pending_review">قيد المراجعة</option>
              <option value="approved">موافق</option>
              <option value="rejected">مرفوض</option>
              <option value="archived">مؤرشف</option>
            </select>
          </div>

          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>من التاريخ</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              style={filterInputStyles}
            />
          </div>

          <div style={filterGroupStyles}>
            <label style={filterLabelStyles}>إلى التاريخ</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              style={filterInputStyles}
            />
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <Button variant="primary" onClick={handleApplyFilters}>
              تطبيق الفلاتر
            </Button>
          </div>
        </div>

        {/* Reports Table */}
        <div style={tableContainerStyles}>
          {error && (
            <div style={errorBoxStyles}>
              <p style={errorTextStyles}>❌ خطأ: {error}</p>
            </div>
          )}

          <ReportsTable
            reports={reports}
            isLoading={loading}
            pagination={pagination}
            onApprove={handleApprove}
            onReject={(reportId) => {
              setRejectingReportId(reportId)
              setShowRejectModal(true)
            }}
            onView={(reportId) => {
              window.location.href = `/admin/reports/${reportId}`
            }}
            onPageChange={goToPage}
          />
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={modalOverlayStyles} onClick={() => setShowRejectModal(false)}>
          <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyles}>رفض التقرير</h2>
            <p style={modalDescriptionStyles}>أدخل السبب لرفض هذا التقرير:</p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اكتب سبب الرفض هنا..."
              style={textareaStyles}
            />

            <div style={modalButtonsStyles}>
              <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                onClick={handleReject}
                disabled={!rejectReason.trim()}
              >
                رفض التقرير
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Styles
const containerStyles: React.CSSProperties = {
  background: '#F8FAFC',
  minHeight: '100vh',
  padding: '32px',
  fontFamily: 'Tajawal, sans-serif',
}

const contentWrapperStyles: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
}

const headerStyles: React.CSSProperties = {
  marginBottom: '32px',
  textAlign: 'right',
}

const titleStyles: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 8px 0',
}

const subtitleStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
  margin: 0,
}

const filterContainerStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '24px',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '16px',
  alignItems: 'flex-end',
}

const filterGroupStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const filterLabelStyles: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#64748B',
}

const filterSelectStyles: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
  backgroundColor: '#fff',
  cursor: 'pointer',
}

const filterInputStyles: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
}

const tableContainerStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  overflow: 'hidden',
}

const errorBoxStyles: React.CSSProperties = {
  padding: '16px',
  background: '#FEE2E2',
  border: '1px solid #FECACA',
  borderRadius: '8px',
  marginBottom: '16px',
}

const errorTextStyles: React.CSSProperties = {
  color: '#991B1B',
  margin: 0,
  fontSize: '14px',
}

const modalOverlayStyles: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyles: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '500px',
  width: '90%',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
}

const modalTitleStyles: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 12px 0',
  textAlign: 'right',
}

const modalDescriptionStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
  margin: '0 0 16px 0',
  textAlign: 'right',
}

const textareaStyles: React.CSSProperties = {
  width: '100%',
  minHeight: '120px',
  padding: '12px',
  border: '1.5px solid #E2E8F0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Tajawal, sans-serif',
  textAlign: 'right',
  marginBottom: '20px',
  boxSizing: 'border-box',
}

const modalButtonsStyles: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'flex-end',
}

export default AdminReports
