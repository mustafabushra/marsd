import { SelectHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  options: Array<{ value: string; label: string }>
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, required, options, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
            {required && <span className="text-red-500 mr-1">*</span>}
          </label>
        )}

        <select
          ref={ref}
          className={clsx(
            'w-full px-4 py-2 border rounded-lg transition-colors appearance-none bg-white',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'disabled:bg-slate-100 disabled:cursor-not-allowed',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500',
            className
          )}
          {...props}
        >
          <option value="">اختر...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        {helperText && <p className="text-sm text-slate-500 mt-1">{helperText}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
