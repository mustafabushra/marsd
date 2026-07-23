/**
 * ⚠️ DEPRECATED كنقطة تعريف — القيم انتقلت إلى `enums.ts` (المصدر الوحيد للحقيقة).
 *
 * هذا الملف يعيد التصدير فقط للحفاظ على توافق الاستيرادات القديمة:
 *   import { COMPANY_STATUS } from '../lib/constants'
 *
 * للكود الجديد: استورد مباشرةً من `../lib/enums`.
 */

export {
  COMPANY_STATUS,
  COMPANY_STATUS_VALUES,
} from './enums'

export type { CompanyStatus, CompanyStatus as CompanyStatusType } from './enums'
