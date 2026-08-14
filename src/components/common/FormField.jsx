import { LIMITS } from '../../lib/validate.js'

/**
 * الحدّ الافتراضي حسب نوع الحقل.
 *
 * مكوّنٌ عامّ لا يعرف أيّ عمود يكتب فيه، فيأخذ أضيق حدٍّ معقول لنوعه. ومن
 * يعرف أكثر يمرّر maxLength صراحةً — الخاصية توضع قبل \u200E{...props}\u200E كي يعلوها
 * ما يمرّره المنادي.
 */
const defaultLimit = (type) => {
  if (type === 'textarea') return LIMITS.description
  if (type === 'email') return LIMITS.email
  if (type === 'tel') return LIMITS.phone
  if (type === 'url') return LIMITS.website
  return LIMITS.name
}

export default function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  error,
  helperText,
  fullWidth = true,
  ...props
}) {
  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <label
          htmlFor={name}
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#334155',
            display: 'block',
            marginBottom: '7px'
          }}
        >
          {label}
          {required && <span style={{ color: '#DC2626' }}>*</span>}
        </label>
      )}

      {type === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: '100%',
            border: error ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '15px',
            outline: 'none',
            minHeight: '120px',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            color: '#0F172A'
          }}
          required={required}
          maxLength={defaultLimit('textarea')}
          {...props}
        />
      ) : (
        <input
          id={name}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: '100%',
            border: error ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '15px',
            outline: 'none',
            boxSizing: 'border-box',
            color: '#0F172A'
          }}
          required={required}
          maxLength={defaultLimit(type)}
          {...props}
        />
      )}

      {error && (
        <div style={{
          fontSize: '12px',
          color: '#DC2626',
          marginTop: '4px',
          fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {helperText && !error && (
        <div style={{
          fontSize: '12px',
          color: '#64748B',
          marginTop: '4px'
        }}>
          {helperText}
        </div>
      )}
    </div>
  )
}
