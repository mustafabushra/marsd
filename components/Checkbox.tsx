import { InputHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          type="checkbox"
          className={clsx(
            'w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1 flex-shrink-0',
            error && 'border-red-300',
            className
          )}
          {...props}
        />
        {label && (
          <label className="text-sm text-slate-700 cursor-pointer flex-1">
            {label}
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </label>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export default Checkbox
