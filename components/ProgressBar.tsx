import clsx from 'clsx'

interface ProgressBarProps {
  value: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const variants = {
  default: 'bg-blue-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-600',
  danger: 'bg-red-600',
}

const sizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export default function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
}: ProgressBarProps) {
  const percentage = (value / max) * 100

  return (
    <div>
      <div className={clsx('w-full bg-slate-200 rounded-full overflow-hidden', sizes[size])}>
        <div
          className={clsx('h-full rounded-full transition-all', variants[variant])}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      {showLabel && (
        <p className="text-sm text-slate-600 mt-1">
          {value} / {max} ({Math.round(percentage)}%)
        </p>
      )}
    </div>
  )
}
