// Form Validation Utilities

export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

// Email validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Phone validation
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^(\+?\d{1,3}[-.\s]?)?\d{1,14}$/
  return phoneRegex.test(phone)
}

// URL validation
export function validateURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Password validation
export function validatePassword(password: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف كبير')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف صغير')
  }

  if (!/\d/.test(password)) {
    errors.push('يجب أن تحتوي على رقم')
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('يجب أن تحتوي على رمز خاص (!@#$%^&*)')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// Name validation
export function validateName(name: string): boolean {
  return name.trim().length >= 2
}

// Company name validation
export function validateCompanyName(name: string): boolean {
  return name.trim().length >= 3
}

// Login form validation
export function validateLoginForm(email: string, password: string): ValidationResult {
  const errors: Record<string, string> = {}

  if (!email) {
    errors.email = 'البريد الإلكتروني مطلوب'
  } else if (!validateEmail(email)) {
    errors.email = 'البريد الإلكتروني غير صحيح'
  }

  if (!password) {
    errors.password = 'كلمة المرور مطلوبة'
  } else if (password.length < 6) {
    errors.password = 'كلمة المرور قصيرة جداً'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Registration form validation
export function validateRegistrationForm(data: {
  fullName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
  companyName: string
}): ValidationResult {
  const errors: Record<string, string> = {}

  if (!data.fullName || !validateName(data.fullName)) {
    errors.fullName = 'الاسم الكامل مطلوب (حد أدنى حرفين)'
  }

  if (!data.companyName || !validateCompanyName(data.companyName)) {
    errors.companyName = 'اسم الشركة مطلوب (حد أدنى 3 أحرف)'
  }

  if (!data.email) {
    errors.email = 'البريد الإلكتروني مطلوب'
  } else if (!validateEmail(data.email)) {
    errors.email = 'البريد الإلكتروني غير صحيح'
  }

  if (!data.phone) {
    errors.phone = 'رقم الهاتف مطلوب'
  } else if (!validatePhone(data.phone)) {
    errors.phone = 'رقم الهاتف غير صحيح'
  }

  const passwordValidation = validatePassword(data.password)
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.errors[0]
  }

  if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'كلمات المرور غير متطابقة'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Company form validation
export function validateCompanyForm(data: {
  name: string
  industry: string
  email: string
  phone: string
  website?: string
  address?: string
}): ValidationResult {
  const errors: Record<string, string> = {}

  if (!data.name || !validateCompanyName(data.name)) {
    errors.name = 'اسم الشركة مطلوب'
  }

  if (!data.industry) {
    errors.industry = 'القطاع مطلوب'
  }

  if (!data.email) {
    errors.email = 'البريد الإلكتروني مطلوب'
  } else if (!validateEmail(data.email)) {
    errors.email = 'البريد الإلكتروني غير صحيح'
  }

  if (!data.phone) {
    errors.phone = 'رقم الهاتف مطلوب'
  } else if (!validatePhone(data.phone)) {
    errors.phone = 'رقم الهاتف غير صحيح'
  }

  if (data.website && !validateURL(data.website)) {
    errors.website = 'عنوان الموقع غير صحيح'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Report form validation
export function validateReportForm(data: {
  company: string
  type: string
  rating: string
  title: string
  description: string
  transactionDate: string
}): ValidationResult {
  const errors: Record<string, string> = {}

  if (!data.company) {
    errors.company = 'اختيار الشركة مطلوب'
  }

  if (!data.type) {
    errors.type = 'نوع التقرير مطلوب'
  }

  if (!data.rating) {
    errors.rating = 'التقييم مطلوب'
  }

  if (!data.title || data.title.trim().length < 5) {
    errors.title = 'العنوان مطلوب (حد أدنى 5 أحرف)'
  }

  if (!data.description || data.description.trim().length < 10) {
    errors.description = 'الوصف مطلوب (حد أدنى 10 أحرف)'
  }

  if (!data.transactionDate) {
    errors.transactionDate = 'تاريخ التعاملية مطلوب'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Batch validation for multiple fields
export function validateMultipleFields(
  data: Record<string, any>,
  validators: Record<string, (value: any) => boolean | string>
): ValidationResult {
  const errors: Record<string, string> = {}

  Object.entries(validators).forEach(([field, validator]) => {
    const result = validator(data[field])
    if (typeof result === 'string') {
      errors[field] = result
    } else if (!result) {
      errors[field] = 'القيمة غير صحيحة'
    }
  })

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

// Sanitize input to prevent XSS
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// Trim and normalize whitespace
export function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}
