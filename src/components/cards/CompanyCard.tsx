/**
 * Company Card Component
 * Displays company info with trust score and action buttons
 */

import React from 'react'
import { CompanyCardProps } from '../../types'
import Button from '../common/Button'

const CompanyCard: React.FC<CompanyCardProps> = ({
  company,
  trustScore,
  onViewReport,
  onClaimProfile,
  className,
}) => {
  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return '#16A34A'
    if (score >= 60) return '#F59E0B'
    return '#DC2626'
  }

  const getRiskBandLabel = (band: string) => {
    switch (band) {
      case 'low':
        return 'منخفض'
      case 'medium':
        return 'متوسط'
      case 'high':
        return 'مرتفع'
      default:
        return '-'
    }
  }

  const cardStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s',
    cursor: 'pointer',
  }

  const headerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  }

  const infoStyles: React.CSSProperties = {
    flex: 1,
  }

  const nameStyles: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1E2A52',
    fontFamily: 'Tajawal, sans-serif',
    margin: '0 0 8px 0',
  }

  const metaStyles: React.CSSProperties = {
    fontSize: '13px',
    color: '#64748B',
    fontFamily: 'Tajawal, sans-serif',
    margin: '4px 0',
  }

  const scoreContainerStyles: React.CSSProperties = {
    textAlign: 'center',
  }

  const scoreStyles: React.CSSProperties = {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: trustScore
      ? getTrustScoreColor(trustScore.score) + '15'
      : '#F8FAFC',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 8px',
  }

  const scoreValueStyles: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    color: trustScore ? getTrustScoreColor(trustScore.score) : '#94A3B8',
  }

  const scoreLabelStyles: React.CSSProperties = {
    fontSize: '12px',
    color: '#94A3B8',
    fontFamily: 'Tajawal, sans-serif',
  }

  const riskBandStyles: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: trustScore ? getTrustScoreColor(trustScore.score) : '#94A3B8',
  }

  const detailsStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    marginBottom: '16px',
  }

  const detailItemStyles: React.CSSProperties = {
    fontSize: '13px',
  }

  const detailLabelStyles: React.CSSProperties = {
    color: '#64748B',
    fontFamily: 'Tajawal, sans-serif',
    marginBottom: '4px',
  }

  const detailValueStyles: React.CSSProperties = {
    color: '#1E2A52',
    fontWeight: 600,
    fontFamily: 'Tajawal, sans-serif',
  }

  const actionsStyles: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
  }

  return (
    <div
      style={cardStyles}
      className={className}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow =
          '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Header */}
      <div style={headerStyles}>
        <div style={infoStyles}>
          <h3 style={nameStyles}>{company.name}</h3>
          <div style={metaStyles}>رقم السجل: {company.crNumber}</div>
          <div style={metaStyles}>{company.sector}</div>
        </div>

        {trustScore && (
          <div style={scoreContainerStyles}>
            <div style={scoreStyles}>
              <div style={scoreValueStyles}>{trustScore.score}</div>
            </div>
            <div style={scoreLabelStyles}>درجة الثقة</div>
            <div style={riskBandStyles}>{getRiskBandLabel(trustScore.riskBand)}</div>
          </div>
        )}
      </div>

      {/* Details */}
      {trustScore && (
        <div style={detailsStyles}>
          <div style={detailItemStyles}>
            <div style={detailLabelStyles}>التقارير المعتمدة</div>
            <div style={detailValueStyles}>{trustScore.approvedReports}</div>
          </div>
          <div style={detailItemStyles}>
            <div style={detailLabelStyles}>المدينة</div>
            <div style={detailValueStyles}>{company.city}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={actionsStyles}>
        <Button
          variant="primary"
          size="sm"
          fullWidth
          onClick={onViewReport}
        >
          عرض التقرير
        </Button>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={onClaimProfile}
        >
          استعادة الملف
        </Button>
      </div>
    </div>
  )
}

export default CompanyCard
