import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const baseStyles: React.CSSProperties = {
      fontFamily: 'Tajawal, sans-serif',
      fontWeight: 800,
      borderRadius: '10px',
      border: 'none',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: fullWidth ? '100%' : 'auto',
      opacity: disabled || loading ? 0.7 : 1,
    }

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        backgroundColor: '#16A34A',
        color: '#fff',
      },
      secondary: {
        backgroundColor: '#F8FAFC',
        color: '#1E2A52',
        border: '1.5px solid #E2E8F0',
      },
      danger: {
        backgroundColor: '#DC2626',
        color: '#fff',
      },
    }

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: '8px 14px', fontSize: '13px' },
      md: { padding: '11px 24px', fontSize: '14px' },
      lg: { padding: '14px 28px', fontSize: '15px' },
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={{ ...baseStyles, ...variantStyles[variant], ...sizeStyles[size] }}
        className={className}
        {...props}
      >
        {loading && <span>⏳</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
