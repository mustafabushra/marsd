import { TextareaHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, required, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
            {required && <span className="text-red-500 mr-1">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          className={clsx(
            'w-full px-4 py-2 border rounded-lg transition-colors resize-none',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'disabled:bg-slate-100 disabled:cursor-not-allowed',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500',
            className
          )}
          {...props}
        />

        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
        {helperText && <p className="text-sm text-slate-500 mt-1">{helperText}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export default Textarea
