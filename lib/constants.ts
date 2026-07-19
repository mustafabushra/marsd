// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api'
export const API_TIMEOUT = 30000 // 30 seconds

// App Configuration
export const APP_NAME = 'Marsad'
export const APP_DESCRIPTION = 'منصة تقييم موثوقية الأعمال'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Pagination
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

// Search
export const MIN_SEARCH_LENGTH = 2
export const MAX_SEARCH_LENGTH = 255
export const SEARCH_DEBOUNCE_DELAY = 500

// Trust Score
export const MIN_TRUST_SCORE = 0
export const MAX_TRUST_SCORE = 100
export const TRUST_SCORE_LEVELS = {
  EXCELLENT: 80,
  GOOD: 60,
  POOR: 0,
}

// Rating
export const MIN_RATING = 1
export const MAX_RATING = 5

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
}

export const PLAN_FEATURES = {
  free: {
    name: 'مجاني',
    price: 0,
    searchLimit: 5,
    reportLimit: 0,
    compareEnabled: false,
    advancedReportsEnabled: false,
  },
  professional: {
    name: 'احترافي',
    price: 99,
    searchLimit: 100,
    reportLimit: 50,
    compareEnabled: true,
    advancedReportsEnabled: true,
  },
  enterprise: {
    name: 'مؤسسي',
    price: 499,
    searchLimit: -1, // unlimited
    reportLimit: -1, // unlimited
    compareEnabled: true,
    advancedReportsEnabled: true,
  },
}

// Report Types
export const REPORT_TYPES = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
}

export const REPORT_TYPE_LABELS = {
  positive: '✓ إيجابي',
  negative: '✗ سلبي',
  neutral: '○ محايد',
}

// Status
export const STATUS_ACTIVE = 'active'
export const STATUS_INACTIVE = 'inactive'
export const STATUS_PENDING = 'pending'
export const STATUS_SUSPENDED = 'suspended'

export const STATUS_LABELS = {
  active: 'نشط',
  inactive: 'غير نشط',
  pending: 'قيد الانتظار',
  suspended: 'معلق',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
}

// User Roles
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  STAFF: 'staff',
}

export const ROLE_LABELS = {
  admin: 'مسؤول',
  user: 'مستخدم',
  staff: 'موظف',
}

// Industries
export const INDUSTRIES = [
  { value: 'technology', label: 'تكنولوجيا' },
  { value: 'retail', label: 'التجارة' },
  { value: 'services', label: 'الخدمات' },
  { value: 'manufacturing', label: 'التصنيع' },
  { value: 'healthcare', label: 'الصحة' },
  { value: 'education', label: 'التعليم' },
  { value: 'finance', label: 'المالية' },
  { value: 'real_estate', label: 'العقارات' },
  { value: 'transportation', label: 'النقل' },
  { value: 'hospitality', label: 'الضيافة' },
  { value: 'construction', label: 'البناء' },
  { value: 'other', label: 'أخرى' },
]

// Error Messages
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: 'هذا الحقل مطلوب',
  INVALID_EMAIL: 'البريد الإلكتروني غير صحيح',
  INVALID_PHONE: 'رقم الهاتف غير صحيح',
  PASSWORD_TOO_SHORT: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
  PASSWORDS_NOT_MATCH: 'كلمات المرور غير متطابقة',
  INVALID_URL: 'عنوان URL غير صحيح',
  NETWORK_ERROR: 'حدث خطأ في الاتصال. حاول مرة أخرى.',
  SERVER_ERROR: 'حدث خطأ في الخادم. حاول لاحقاً.',
  UNAUTHORIZED: 'يجب تسجيل الدخول أولاً',
  FORBIDDEN: 'ليس لديك صلاحيات كافية',
  NOT_FOUND: 'لم يتم العثور على الموارد المطلوبة',
  VALIDATION_ERROR: 'يرجى التحقق من البيانات المدخلة',
}

// Success Messages
export const SUCCESS_MESSAGES = {
  CREATED: 'تم الإنشاء بنجاح',
  UPDATED: 'تم التحديث بنجاح',
  DELETED: 'تم الحذف بنجاح',
  SAVED: 'تم الحفظ بنجاح',
  LOGIN_SUCCESS: 'تم تسجيل الدخول بنجاح',
  LOGOUT_SUCCESS: 'تم تسجيل الخروج بنجاح',
  REGISTER_SUCCESS: 'تم إنشاء الحساب بنجاح',
}

// Validation Rules
export const VALIDATION = {
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_PATTERN: /^(\+?\d{1,3}[-.\s]?)?\d{1,14}$/,
  URL_PATTERN: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
  PASSWORD_MIN_LENGTH: 8,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 5000,
}

// Date and Time
export const DATE_FORMAT = 'YYYY-MM-DD'
export const TIME_FORMAT = 'HH:mm:ss'
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

// Pagination
export const PAGINATION_OPTIONS = [10, 25, 50, 100]

// Cache
export const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

// Feature Flags
export const FEATURES = {
  BULK_IMPORT: true,
  ADVANCED_SEARCH: true,
  REPORTS: true,
  WATCHLIST: true,
  ADMIN_PANEL: true,
  SUBSCRIPTIONS: true,
}

// Navigation
export const NAVIGATION_ITEMS = [
  { label: 'لوحة التحكم', href: '/dashboard' },
  { label: 'الشركات', href: '/companies' },
  { label: 'التقارير', href: '/reports' },
  { label: 'قائمة المراقبة', href: '/watchlist' },
  { label: 'الاشتراكات', href: '/subscriptions' },
]

// Admin Navigation
export const ADMIN_NAVIGATION_ITEMS = [
  { label: 'لوحة التحكم', href: '/admin/dashboard' },
  { label: 'المستخدمون', href: '/admin/users' },
  { label: 'سجلات التدقيق', href: '/admin/audit-logs' },
  { label: 'الإعدادات', href: '/admin/settings' },
]
