/**
 * Input Component
 * Reusable input field with support for labels, errors, icons, and various states
 */

import React from 'react'
import { InputProps } from '../../types'

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      helperText,
      disabled = false,
      type = 'text',
      placeholder,
      className,
      ...props
    },
    ref
  ) => {
    const baseStyles: React.CSSProperties = {
      width: fullWidth ? '100%' : 'auto',
      padding: iconPosition ? `12px 12px 12px ${icon ? '40px' : '12px'}` : '12px',
      borderRadius: '8px',
      border: error ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
      fontSize: '14px',
      fontFamily: 'Tajawal, sans-serif',
      transition: 'all 0.2s ease',
      boxSizing: 'border-box' as const,
      backgroundColor: disabled ? '#F8FAFC' : '#fff',
      color: '#1E2A52',
      outlineColor: '#16A34A',
    }

    const containerStyles: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      width: fullWidth ? '100%' : 'auto',
    }

    const wrapperStyles: React.CSSProperties = {
      position: 'relative' as const,
      display: 'flex',
      alignItems: 'center',
      width: '100%',
    }

    const iconWrapperStyles: React.CSSProperties = {
      position: 'absolute' as const,
      left: iconPosition === 'left' ? '12px' : 'auto',
      right: iconPosition === 'right' ? '12px' : 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '20px',
      color: '#94A3B8',
      pointerEvents: 'none',
    }

    const labelStyles: React.CSSProperties = {
      fontSize: '14px',
      fontWeight: 600,
      color: '#1E2A52',
      fontFamily: 'Tajawal, sans-serif',
    }

    const helperStyles: React.CSSProperties = {
      fontSize: '12px',
      color: error ? '#DC2626' : '#94A3B8',
      fontFamily: 'Tajawal, sans-serif',
    }

    return (
      <div style={containerStyles}>
        {label && <label style={labelStyles}>{label}</label>}

        <div style={wrapperStyles}>
          {icon && <span style={iconWrapperStyles}>{icon}</span>}
          <input
            ref={ref}
            type={type}
            disabled={disabled}
            placeholder={placeholder}
            style={{
              ...baseStyles,
              paddingLeft: iconPosition === 'left' && icon ? '40px' : '12px',
              paddingRight: iconPosition === 'right' && icon ? '40px' : '12px',
            }}
            {...props}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#16A34A'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.1)'
              props.onFocus?.(e)
            }}
            onBlur={e => {
              if (!error) {
                e.currentTarget.style.borderColor = '#E2E8F0'
              }
              e.currentTarget.style.boxShadow = 'none'
              props.onBlur?.(e)
            }}
          />
        </div>

        {(helperText || error) && <span style={helperStyles}>{error || helperText}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
