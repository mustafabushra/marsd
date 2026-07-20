import React from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  padding?: number
  border?: boolean
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  padding = 24,
  border = true,
  children,
  header,
  footer,
  className,
}) => {
  const containerStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '16px',
    border: border ? '1px solid #E2E8F0' : 'none',
    padding: `${padding}px`,
    boxShadow: border ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
  }

  const headerStyles: React.CSSProperties = {
    marginBottom: '16px',
    borderBottom: '1px solid #F1F5F9',
    paddingBottom: '16px',
  }

  const titleStyles: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 900,
    color: '#0F172A',
    margin: '0 0 4px 0',
    fontFamily: 'Tajawal, sans-serif',
  }

  const subtitleStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#64748B',
    margin: '0',
    fontFamily: 'Tajawal, sans-serif',
  }

  const footerStyles: React.CSSProperties = {
    marginTop: '16px',
    borderTop: '1px solid #F1F5F9',
    paddingTop: '16px',
  }

  return (
    <div style={containerStyles} className={className}>
      {(header || title) && (
        <div style={headerStyles}>
          {header}
          {title && <h3 style={titleStyles}>{title}</h3>}
          {subtitle && <p style={subtitleStyles}>{subtitle}</p>}
        </div>
      )}
      {children}
      {footer && <div style={footerStyles}>{footer}</div>}
    </div>
  )
}

export default Card
