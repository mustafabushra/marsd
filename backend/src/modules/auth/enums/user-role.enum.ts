export enum UserRole {
  COMPANY_MEMBER = 'company_member',
  COMPANY_ADMIN = 'company_admin',
  PLATFORM_ADMIN = 'platform_admin',
  REVIEWER = 'reviewer',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.COMPANY_MEMBER]: 'موظف الشركة',
  [UserRole.COMPANY_ADMIN]: 'مدير الشركة',
  [UserRole.PLATFORM_ADMIN]: 'مسؤول النظام',
  [UserRole.REVIEWER]: 'مراجع',
}
