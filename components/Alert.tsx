import { ReactNode } from 'react'
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react'
import clsx from 'clsx'

interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info'
  title?: string
  children: ReactNode
  onClose?: () => void
  className?: string
}

const variants = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: <CheckCircle size={20} className="text-green-600" />,
    text: 'text-green-800',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <AlertCircle size={20} className="text-red-600" />,
    text: 'text-red-800',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: <AlertTriangle size={20} className="text-yellow-600" />,
    text: 'text-yellow-800',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Info size={20} className="text-blue-600" />,
    text: 'text-blue-800',
  },
}

export default function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
}: AlertProps) {
  const { bg, border, icon, text } = variants[variant]

  return (
    <div
      className={clsx(
        'rounded-lg border p-4 flex gap-4 animate-fade-up',
        bg,
        border,
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>

      <div className="flex-1">
        {title && <h3 className={clsx('font-medium mb-1', text)}>{title}</h3>}
        <div className={clsx('text-sm', text)}>{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={clsx('flex-shrink-0 p-1 hover:bg-opacity-50 rounded', text)}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
