/**
 * ============================================================================
 * DATABASE ENUMS — Single Source of Truth (SSOT)
 * ============================================================================
 *
 * كل قيمة هنا تطابق تماماً CHECK constraint في قاعدة بيانات Supabase.
 * هذا الملف هو المصدر الوحيد للحقيقة لكل الحقول المقيّدة (constrained fields).
 *
 * ⚠️ قاعدة ذهبية: ممنوع كتابة قيمة نصية مباشرة (magic string) لأي حقل مقيّد
 *    في أي مكان في الكود. استورد من هنا دائماً.
 *
 * إذا تغيّر أي CHECK constraint في قاعدة البيانات:
 *   1. عدّل القيم هنا لتطابقه.
 *   2. شغّل `npm run check:enums` للتأكد من عدم وجود انحراف (drift) بين
 *      الكود وقاعدة البيانات.
 *
 * المصدر الرسمي في قاعدة البيانات (تم استخراجه من pg_constraint):
 *   companies.status  → pending | approved | rejected | suspended | active
 *   companies.cr_status → active | suspended | terminated | pending
 *   companies.source  → official | community          ← سبب المشكلة المتكررة
 *   tenants.status    → active | suspended | inactive
 *   users.role        → company_member | company_admin | platform_admin | reviewer
 *   users.status      → active | inactive | pending_email_verification
 *   claim_requests.status / registration_requests.status
 *                     → pending | approved | rejected | expired
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// companies.status
// ---------------------------------------------------------------------------
export const COMPANY_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  ACTIVE: 'active',
} as const
export type CompanyStatus = (typeof COMPANY_STATUS)[keyof typeof COMPANY_STATUS]
export const COMPANY_STATUS_VALUES = Object.values(COMPANY_STATUS) as CompanyStatus[]

// ---------------------------------------------------------------------------
// companies.cr_status
// ---------------------------------------------------------------------------
export const COMPANY_CR_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
  PENDING: 'pending',
} as const
export type CompanyCrStatus = (typeof COMPANY_CR_STATUS)[keyof typeof COMPANY_CR_STATUS]
export const COMPANY_CR_STATUS_VALUES = Object.values(COMPANY_CR_STATUS) as CompanyCrStatus[]

// ---------------------------------------------------------------------------
// companies.source  ← الحقل الذي تسبب في constraint violation المتكرر
// المسموح فقط قيمتان. أي قيمة أخرى (self_registered, from_report,
// manual_addition, bulk_import, admin...) ستفشل حتماً.
// ---------------------------------------------------------------------------
export const COMPANY_SOURCE = {
  /** بيانات رسمية من جهة حكومية / استيراد موثّق */
  OFFICIAL: 'official',
  /** أي إدخال من المستخدمين أو النظام (تسجيل ذاتي، من تقرير، إضافة يدوية...) */
  COMMUNITY: 'community',
} as const
export type CompanySource = (typeof COMPANY_SOURCE)[keyof typeof COMPANY_SOURCE]
export const COMPANY_SOURCE_VALUES = Object.values(COMPANY_SOURCE) as CompanySource[]

// ---------------------------------------------------------------------------
// tenants.status
// ---------------------------------------------------------------------------
export const TENANT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  INACTIVE: 'inactive',
} as const
export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS]
export const TENANT_STATUS_VALUES = Object.values(TENANT_STATUS) as TenantStatus[]

// ---------------------------------------------------------------------------
// users.role
// ---------------------------------------------------------------------------
export const USER_ROLE = {
  COMPANY_MEMBER: 'company_member',
  COMPANY_ADMIN: 'company_admin',
  PLATFORM_ADMIN: 'platform_admin',
  REVIEWER: 'reviewer',
} as const
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]
export const USER_ROLE_VALUES = Object.values(USER_ROLE) as UserRole[]

// ---------------------------------------------------------------------------
// users.status
// ---------------------------------------------------------------------------
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING_EMAIL_VERIFICATION: 'pending_email_verification',
} as const
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS]
export const USER_STATUS_VALUES = Object.values(USER_STATUS) as UserStatus[]

// ---------------------------------------------------------------------------
// claim_requests.status  و  registration_requests.status (نفس القيم)
// ---------------------------------------------------------------------------
export const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const
export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS]
export const REQUEST_STATUS_VALUES = Object.values(REQUEST_STATUS) as RequestStatus[]

// ---------------------------------------------------------------------------
// Runtime validation helper
// ---------------------------------------------------------------------------

/**
 * يتحقق أن القيمة ضمن مجموعة القيم المسموحة قبل الإرسال لقاعدة البيانات.
 * يرمي خطأً واضحاً بالعربية بدل خطأ Postgres الغامض
 * ("violates check constraint ...").
 *
 * @param value القيمة المراد التحقق منها
 * @param allowed مصفوفة القيم المسموحة (من هذا الملف)
 * @param fieldLabel اسم الحقل لعرضه في رسالة الخطأ
 * @returns القيمة نفسها إذا كانت صالحة (مع تضييق النوع)
 */
export function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldLabel: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(
      `❌ قيمة غير صالحة للحقل "${fieldLabel}": "${String(value)}". ` +
        `القيم المسموحة: ${allowed.join(', ')}`
    )
  }
  return value as T
}

/**
 * نسخة لا ترمي خطأً: ترجع القيمة إن كانت صالحة، وإلا ترجع القيمة الافتراضية.
 * مفيدة لتطبيع بيانات قادمة من مصادر خارجية غير موثوقة.
 */
export function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === 'string' && allowed.includes(value as T)
    ? (value as T)
    : fallback
}
