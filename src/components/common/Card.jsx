export default function Card({
  children,
  variant = 'default',
  shadow = true,
  padding = '32px',
  borderRadius = '18px',
  ...props
}) {
  const variants = {
    default: {
      background: '#fff',
      border: '1px solid #E2E8F0'
    },
    elevated: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      boxShadow: '0 24px 60px rgba(15, 23, 42, 0.1)'
    },
    dark: {
      background: '#1E2A52',
      color: '#fff'
    },
    transparent: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      color: '#fff'
    }
  }

  const variantStyle = variants[variant]
  const boxShadow = shadow && variant === 'default' ? '0 2px 8px rgba(15, 23, 42, 0.05)' : variantStyle.boxShadow

  return (
    <div
      style={{
        ...variantStyle,
        borderRadius,
        padding,
        boxShadow,
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  )
}
