export enum Permission {
  // Company Data Permissions
  VIEW_COMPANY_DATA = 'view:company_data',
  MANAGE_COMPANY_DATA = 'manage:company_data',
  UPDATE_COMPANY_PROFILE = 'update:company_profile',

  // Report Permissions
  VIEW_REPORTS = 'view:reports',
  CREATE_REPORTS = 'create:reports',
  EDIT_REPORTS = 'edit:reports',
  DELETE_REPORTS = 'delete:reports',
  REVIEW_REPORTS = 'review:reports',
  REQUEST_REPORT_INFO = 'request:report_info',

  // User Management
  VIEW_USERS = 'view:users',
  MANAGE_USERS = 'manage:users',
  MANAGE_TEAM = 'manage:team',
  CREATE_USERS = 'create:users',
  DELETE_USERS = 'delete:users',

  // Settings
  MANAGE_SETTINGS = 'manage:settings',
  MANAGE_SUBSCRIPTIONS = 'manage:subscriptions',
  VIEW_ANALYTICS = 'view:analytics',

  // Admin Permissions
  VIEW_ALL_DATA = 'view:all_data',
  MANAGE_ALL_USERS = 'manage:all_users',
  MANAGE_ALL_COMPANIES = 'manage:all_companies',
  MANAGE_REPORTS = 'manage:reports',
  MANAGE_PLANS = 'manage:plans',
  MANAGE_SUPPORT_TICKETS = 'manage:support_tickets',
  VIEW_AUDIT_LOGS = 'view:audit_logs',
  MANAGE_INTEGRATIONS = 'manage:integrations',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.VIEW_COMPANY_DATA]: 'عرض بيانات الشركة',
  [Permission.MANAGE_COMPANY_DATA]: 'إدارة بيانات الشركة',
  [Permission.UPDATE_COMPANY_PROFILE]: 'تحديث ملف الشركة',
  [Permission.VIEW_REPORTS]: 'عرض التقارير',
  [Permission.CREATE_REPORTS]: 'إنشاء تقارير',
  [Permission.EDIT_REPORTS]: 'تعديل التقارير',
  [Permission.DELETE_REPORTS]: 'حذف التقارير',
  [Permission.REVIEW_REPORTS]: 'مراجعة التقارير',
  [Permission.REQUEST_REPORT_INFO]: 'طلب معلومات إضافية عن التقرير',
  [Permission.VIEW_USERS]: 'عرض المستخدمين',
  [Permission.MANAGE_USERS]: 'إدارة المستخدمين',
  [Permission.MANAGE_TEAM]: 'إدارة الفريق',
  [Permission.CREATE_USERS]: 'إنشاء مستخدمين',
  [Permission.DELETE_USERS]: 'حذف مستخدمين',
  [Permission.MANAGE_SETTINGS]: 'إدارة الإعدادات',
  [Permission.MANAGE_SUBSCRIPTIONS]: 'إدارة الاشتراكات',
  [Permission.VIEW_ANALYTICS]: 'عرض التحليلات',
  [Permission.VIEW_ALL_DATA]: 'عرض جميع البيانات',
  [Permission.MANAGE_ALL_USERS]: 'إدارة جميع المستخدمين',
  [Permission.MANAGE_ALL_COMPANIES]: 'إدارة جميع الشركات',
  [Permission.MANAGE_REPORTS]: 'إدارة التقارير',
  [Permission.MANAGE_PLANS]: 'إدارة الخطط',
  [Permission.MANAGE_SUPPORT_TICKETS]: 'إدارة تذاكر الدعم',
  [Permission.VIEW_AUDIT_LOGS]: 'عرض سجلات التدقيق',
  [Permission.MANAGE_INTEGRATIONS]: 'إدارة التكاملات',
}
