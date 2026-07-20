/**
 * Stat Card Component
 * Displays KPI with icon, label, value, and trend
 */

import React from 'react'
import { StatCardProps } from '../../types'
import Card from '../common/Card'

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtitle,
  color = 'green',
  trend,
  className,
}) => {
  const colorMap = {
    green: { bg: '#ECFDF5', text: '#16A34A', border: '#BBF7D0' },
    blue: { bg: '#EFF6FF', text: '#3B82F6', border: '#BFDBFE' },
    orange: { bg: '#FEF3C7', text: '#F59E0B', border: '#FDE68A' },
    red: { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  }

  const theme = colorMap[color]

  const containerStyles: React.CSSProperties = {
    padding: '20px',
    backgroundColor: theme.bg,
    borderLeft: `4px solid ${theme.text}`,
    borderRadius: '8px',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  }

  const headerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  }

  const iconWrapperStyles: React.CSSProperties = {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: theme.text + '15',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.text,
    fontSize: '24px',
  }

  const trendStyles: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: trend && trend > 0 ? '#16A34A' : trend && trend < 0 ? '#DC2626' : '#94A3B8',
  }

  const labelStyles: React.CSSProperties = {
    fontSize: '13px',
    color: '#64748B',
    fontFamily: 'Tajawal, sans-serif',
    marginBottom: '4px',
  }

  const valueStyles: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    color: theme.text,
    fontFamily: 'Tajawal, sans-serif',
    margin: '0',
  }

  const subtitleStyles: React.CSSProperties = {
    fontSize: '12px',
    color: '#94A3B8',
    fontFamily: 'Tajawal, sans-serif',
    marginTop: '4px',
  }

  return (
    <div style={containerStyles} className={className}>
      <div style={headerStyles}>
        <div>
          <div style={labelStyles}>{label}</div>
          <div style={valueStyles}>{value}</div>
          {subtitle && <div style={subtitleStyles}>{subtitle}</div>}
        </div>
        {icon && <div style={iconWrapperStyles}>{icon}</div>}
      </div>
      {trend !== undefined && (
        <div style={trendStyles}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

export default StatCard
