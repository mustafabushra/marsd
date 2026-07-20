export default function Button({
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  ...props
}) {
  const baseStyles = {
    border: 0,
    borderRadius: '11px',
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    fontSize: size === 'sm' ? '14px' : size === 'lg' ? '17px' : '16px',
    padding: size === 'sm' ? '10px 16px' : size === 'lg' ? '16px 40px' : '14px 32px',
    opacity: disabled ? 0.6 : 1
  }

  const variants = {
    primary: {
      background: '#16A34A',
      color: '#fff'
    },
    secondary: {
      background: '#fff',
      color: '#1E2A52',
      border: '1.5px solid #CBD5E1'
    },
    dark: {
      background: '#1E2A52',
      color: '#fff'
    },
    danger: {
      background: '#DC2626',
      color: '#fff'
    }
  }

  const buttonStyle = { ...baseStyles, ...variants[variant] }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle}
      onMouseEnter={e => !disabled && (e.target.style.opacity = '0.9')}
      onMouseLeave={e => !disabled && (e.target.style.opacity = '1')}
      {...props}
    >
      {children}
    </button>
  )
}
