/**
 * Modal Component
 * Reusable modal dialog with customizable title, content, and footer
 */

import React from 'react'
import { ModalProps } from '../../types'

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
}) => {
  if (!isOpen) return null

  const sizeMap = {
    sm: '400px',
    md: '600px',
    lg: '800px',
  }

  const backdropStyles: React.CSSProperties = {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  }

  const modalStyles: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow:
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    maxWidth: sizeMap[size],
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative' as const,
    zIndex: 1001,
  }

  const headerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px',
    borderBottom: '1px solid #E2E8F0',
  }

  const titleStyles: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1E2A52',
    fontFamily: 'Tajawal, sans-serif',
    margin: 0,
  }

  const descriptionStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#475569',
    fontFamily: 'Tajawal, sans-serif',
    marginTop: '4px',
    marginBottom: 0,
  }

  const closeButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#94A3B8',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  }

  const contentStyles: React.CSSProperties = {
    padding: '24px',
  }

  const footerStyles: React.CSSProperties = {
    padding: '16px 24px',
    borderTop: '1px solid #E2E8F0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  }

  return (
    <div
      style={backdropStyles}
      onClick={e => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div style={modalStyles}>
        {/* Header */}
        {(title || description) && (
          <div style={headerStyles}>
            <div>
              {title && <h2 style={titleStyles}>{title}</h2>}
              {description && <p style={descriptionStyles}>{description}</p>}
            </div>
            <button
              style={closeButtonStyles}
              onClick={onClose}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#1E2A52'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#94A3B8'
              }}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        )}

        {/* Content */}
        {children && <div style={contentStyles}>{children}</div>}

        {/* Footer */}
        {footer && <div style={footerStyles}>{footer}</div>}
      </div>
    </div>
  )
}

export default Modal
