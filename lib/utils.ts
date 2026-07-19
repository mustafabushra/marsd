import clsx, { type ClassValue } from 'clsx'

// Combine class names
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Format currency
export function formatCurrency(amount: number, locale: string = 'ar-SA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'SAR',
  }).format(amount)
}

// Format date
export function formatDate(date: string | Date, locale: string = 'ar-SA'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Format time ago
export function formatTimeAgo(date: string | Date, locale: string = 'ar-SA'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((new Date().getTime() - d.getTime()) / 1000)

  let interval = seconds / 31536000
  if (interval > 1) return `منذ ${Math.floor(interval)} سنة`

  interval = seconds / 2592000
  if (interval > 1) return `منذ ${Math.floor(interval)} شهر`

  interval = seconds / 86400
  if (interval > 1) return `منذ ${Math.floor(interval)} يوم`

  interval = seconds / 3600
  if (interval > 1) return `منذ ${Math.floor(interval)} ساعة`

  interval = seconds / 60
  if (interval > 1) return `منذ ${Math.floor(interval)} دقيقة`

  return 'للتو'
}

// Validate email
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

// Validate phone number
export function validatePhoneNumber(phone: string): boolean {
  const re = /^(\+?\d{1,3}[-.\s]?)?\d{1,14}$/
  return re.test(phone)
}

// Validate URL
export function validateURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Generate random ID
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Get trust score color
export function getTrustScoreColor(score: number): {
  bg: string
  text: string
  badge: string
} {
  if (score >= 80) {
    return {
      bg: 'bg-green-50',
      text: 'text-green-600',
      badge: 'bg-green-100 text-green-800',
    }
  }
  if (score >= 60) {
    return {
      bg: 'bg-yellow-50',
      text: 'text-yellow-600',
      badge: 'bg-yellow-100 text-yellow-800',
    }
  }
  return {
    bg: 'bg-red-50',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-800',
  }
}

// Get status badge variant
export function getStatusBadgeVariant(
  status: string
): 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'pending':
      return 'warning'
    case 'inactive':
    case 'suspended':
      return 'error'
    default:
      return 'info'
  }
}

// Truncate text
export function truncate(text: string, length: number = 100): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Deep merge objects
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const output = Object.assign({}, target) as any

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }

  return output
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item)
}

// Parse error message
export function parseError(error: any): string {
  if (typeof error === 'string') return error
  if (error?.message) return error.message
  if (error?.data?.message) return error.data.message
  return 'حدث خطأ غير متوقع'
}

// Safe JSON parse
export function safeJsonParse<T = any>(json: string, fallback: T): T {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Convert to slug
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '')
}
