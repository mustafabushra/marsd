/**
 * Reports Table Component
 * Displays reports with status, actions, and pagination
 */

import React from 'react'
import { ReportsTableProps } from '../../types'
import Button from '../common/Button'

const ReportsTable: React.FC<ReportsTableProps> = ({
  reports,
  isLoading = false,
  pagination,
  onApprove,
  onReject,
  onView,
  onPageChange,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#ECFDF5'
      case 'rejected':
        return '#FEE2E2'
      case 'pending_review':
        return '#FEF3C7'
      default:
        return '#F8FAFC'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'موافق'
      case 'rejected':
        return 'مرفوض'
      case 'pending_review':
        return 'قيد المراجعة'
      case 'archived':
        return 'مؤرشف'
      default:
        return 'غير معروف'
    }
  }

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#15803D'
      case 'rejected':
        return '#991B1B'
      case 'pending_review':
        return '#92400E'
      default:
        return '#64748B'
    }
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const tableStyles: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'Tajawal, sans-serif',
  }

  const thStyles: React.CSSProperties = {
    padding: '16px',
    textAlign: 'right',
    fontSize: '14px',
    fontWeight: 700,
    color: '#1E2A52',
    borderBottom: '2px solid #E2E8F0',
    backgroundColor: '#F8FAFC',
  }

  const tdStyles: React.CSSProperties = {
    padding: '16px',
    borderBottom: '1px solid #E2E8F0',
    fontSize: '14px',
    color: '#1E2A52',
  }

  const rowStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    height: '70px',
  }

  const loadingStyles: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 16px',
    color: '#94A3B8',
    fontSize: '14px',
  }

  const emptyStyles: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 16px',
    color: '#94A3B8',
    fontSize: '14px',
  }

  const paginationStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderTop: '1px solid #E2E8F0',
    gap: '8px',
  }

  const paginationTextStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#475569',
    fontFamily: 'Tajawal, sans-serif',
  }

  const paginationButtonsStyles: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  }

  const badgeStyles = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: color,
  })

  const actionButtonsStyles: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  }

  if (isLoading) {
    return (
      <div style={loadingStyles}>
        <div>جاري التحميل...</div>
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div style={emptyStyles}>
        <div>لا توجد تقارير لعرضها</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyles}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC' }}>
              <th style={thStyles}>الشركة</th>
              <th style={thStyles}>المقدم</th>
              <th style={thStyles}>الحالة</th>
              <th style={thStyles}>التاريخ</th>
              <th style={thStyles}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report, idx) => (
              <tr
                key={report.id}
                style={rowStyles}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#fff'
                }}
              >
                <td style={tdStyles}>
                  {report.targetCompany?.name || 'غير محدد'}
                </td>
                <td style={tdStyles}>{report.reporterId || '-'}</td>
                <td style={tdStyles}>
                  <div
                    style={{
                      ...badgeStyles(getStatusColor(report.status)),
                      color: getStatusTextColor(report.status),
                    }}
                  >
                    {getStatusText(report.status)}
                  </div>
                </td>
                <td style={tdStyles}>{formatDate(report.submittedAt)}</td>
                <td style={tdStyles}>
                  <div style={actionButtonsStyles}>
                    {report.status === 'pending_review' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onApprove?.(report.id)}
                          disabled={isLoading}
                        >
                          موافقة
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onReject?.(report.id)}
                          disabled={isLoading}
                        >
                          رفض
                        </Button>
                      </>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onView?.(report.id)}
                      disabled={isLoading}
                    >
                      عرض
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div style={paginationStyles}>
          <div style={paginationTextStyles}>
            الصفحة {pagination.page} من {pagination.pages} • إجمالي{' '}
            {pagination.total} تقرير
          </div>
          <div style={paginationButtonsStyles}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page === 1 || isLoading}
            >
              السابق
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages || isLoading}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsTable
