/**
 * Companies Table Component
 * Displays companies with trust scores, pagination, and sorting
 */

import React, { useState } from 'react'
import { CompaniesTableProps } from '../../types'
import Button from '../common/Button'

const CompaniesTable: React.FC<CompaniesTableProps> = ({
  companies,
  isLoading = false,
  pagination,
  onRowClick,
  onPageChange,
  sortBy,
  sortOrder = 'asc',
}) => {
  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return '#16A34A'
    if (score >= 60) return '#F59E0B'
    return '#DC2626'
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'approved':
        return '#ECFDF5'
      case 'pending':
        return '#FEF3C7'
      case 'rejected':
        return '#FEE2E2'
      default:
        return '#F8FAFC'
    }
  }

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'موافق'
      case 'pending':
        return 'قيد الانتظار'
      case 'rejected':
        return 'مرفوض'
      default:
        return 'نشط'
    }
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
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  }

  const rowStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    height: '60px',
  }

  const headerRowStyles: React.CSSProperties = {
    backgroundColor: '#F8FAFC',
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

  const scoreStyles = (score: number): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: getTrustScoreColor(score) + '20',
    color: getTrustScoreColor(score),
    fontWeight: 700,
    fontSize: '14px',
  })

  if (isLoading) {
    return (
      <div style={loadingStyles}>
        <div>جاري التحميل...</div>
      </div>
    )
  }

  if (!companies || companies.length === 0) {
    return (
      <div style={emptyStyles}>
        <div>لا توجد شركات لعرضها</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyles}>
          <thead style={headerRowStyles}>
            <tr>
              <th style={thStyles}>اسم الشركة</th>
              <th style={thStyles}>القطاع</th>
              <th style={thStyles}>المدينة</th>
              <th style={thStyles}>درجة الثقة</th>
              <th style={thStyles}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company, idx) => (
              <tr
                key={company.id}
                style={rowStyles}
                onClick={() => onRowClick?.(company)}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#fff'
                }}
              >
                <td style={tdStyles}>{company.name}</td>
                <td style={tdStyles}>{company.sector}</td>
                <td style={tdStyles}>{company.city}</td>
                <td style={tdStyles}>
                  {company.trust_score ? (
                    <div style={scoreStyles(company.trust_score.score)}>
                      {company.trust_score.score}
                    </div>
                  ) : (
                    <span style={{ color: '#94A3B8' }}>-</span>
                  )}
                </td>
                <td style={tdStyles}>
                  <div
                    style={{
                      ...badgeStyles(getStatusColor(company.status)),
                      color:
                        company.status === 'approved'
                          ? '#15803D'
                          : company.status === 'pending'
                            ? '#92400E'
                            : company.status === 'rejected'
                              ? '#991B1B'
                              : '#064E3B',
                    }}
                  >
                    {getStatusText(company.status)}
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
            {pagination.total} شركة
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

export default CompaniesTable
