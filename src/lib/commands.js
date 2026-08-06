/**
 * Everything a person can reach or do, as a searchable list.
 *
 * ============================================================================
 * Why this lives in code and not in a table
 * ============================================================================
 * A command is a route plus the words people use to look for it. The route is
 * code — it appears in App.jsx, it is renamed in a commit, it is deleted in a
 * commit. Putting the list in the database splits one fact across two places
 * that are updated at different times, and the failure is silent and permanent:
 * `/admin/roster` gets renamed, the row still says `/admin/roster`, and the
 * palette keeps offering a link to a 404 that nothing will ever flag.
 *
 * Here, a removed route removes its command in the same change, and
 * `verify-commands.mjs` refuses to pass if any `to` is not in the router.
 *
 * The parts that genuinely belong in a database — which are none of these —
 * would be anything an administrator should change without a deploy. A menu of
 * the application's own screens is not that.
 *
 * ============================================================================
 * `keywords`
 * ============================================================================
 * What somebody types when they do not know what the screen is called. Arabic
 * and English both, plurals both, and the words people actually use rather than
 * the words in the heading — «بلاغ» for a report, «مستخدمين» for the team page.
 *
 * Matching folds hamza and taa-marbuta (see fold.js), so «شركه» finds «شركة»
 * without an entry for it. Do not add folded spellings by hand.
 */

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {string} title
 * @property {string} [hint]      one line of what it does
 * @property {string} icon
 * @property {string} category
 * @property {string} to          a route that exists in App.jsx
 * @property {string[]} keywords
 * @property {'admin'|'company'|'any'} scope  who may see it
 */

const QUICK = 'إجراءات سريعة'
const COMPANIES = 'الشركات'
const REPORTS = 'التقارير والبلاغات'
const ACCOUNT = 'حسابي'
const ADMIN_OPS = 'التشغيل'
const ADMIN_DATA = 'البيانات والمراجعة'
const ADMIN_MONEY = 'الاشتراكات والدفع'
const ADMIN_SETTINGS = 'الإعدادات'

/** @type {Command[]} */
export const COMMANDS = [
  // ---- quick actions: the four things people come here to do --------------
  {
    id: 'new-company', title: 'إضافة شركة', hint: 'سجّل شركة غير موجودة في مرصد',
    icon: '🏢', category: QUICK, to: '/add-company', scope: 'company',
    keywords: ['اضافة شركة', 'شركة جديدة', 'تسجيل شركة', 'add company', 'new company'],
  },
  {
    id: 'new-report', title: 'إضافة تقرير', hint: 'قيّم تعاملاً مع شركة',
    icon: '📝', category: QUICK, to: '/add-report', scope: 'company',
    keywords: ['تقرير جديد', 'بلاغ', 'اضافة بلاغ', 'تقييم', 'add report', 'new report'],
  },
  {
    id: 'search', title: 'البحث عن شركة', hint: 'ابحث بالاسم أو رقم السجل',
    icon: '🔍', category: QUICK, to: '/search', scope: 'company',
    keywords: ['بحث', 'ابحث', 'سجل تجاري', 'search', 'find'],
  },
  {
    id: 'invite-user', title: 'دعوة مستخدم', hint: 'أضف زميلاً لحساب شركتك',
    icon: '➕', category: QUICK, to: '/users', scope: 'company',
    keywords: ['اضافة مستخدم', 'دعوة', 'فريق', 'زميل', 'invite', 'add user'],
  },

  // ---- company workspace ---------------------------------------------------
  {
    id: 'dashboard', title: 'لوحتي', icon: '📊', category: COMPANIES,
    to: '/dashboard', scope: 'company',
    keywords: ['الرئيسية', 'لوحة', 'home', 'dashboard'],
  },
  {
    id: 'my-companies', title: 'الشركات التي أضفتها', icon: '🏢', category: COMPANIES,
    to: '/my-companies', scope: 'company',
    keywords: ['شركاتي', 'الشركات', 'اضافاتي', 'my companies'],
  },
  {
    id: 'watchlist', title: 'قائمة المراقبة', hint: 'الشركات التي تتابع تغيّر درجتها',
    icon: '👁', category: COMPANIES, to: '/watchlist', scope: 'company',
    keywords: ['المراقبة', 'متابعة', 'مراقبة الشركات', 'watchlist'],
  },
  {
    id: 'compare', title: 'مقارنة شركات', icon: '⚖️', category: COMPANIES,
    to: '/compare', scope: 'company',
    keywords: ['مقارنة', 'قارن', 'compare'],
  },

  {
    id: 'my-reports', title: 'تقاريري', icon: '📄', category: REPORTS,
    to: '/my-reports', scope: 'company',
    keywords: ['تقاريري', 'بلاغاتي', 'my reports'],
  },
  {
    id: 'reports-about-us', title: 'تقارير عنّا', hint: 'ما كتبه الآخرون عن شركتك',
    icon: '📬', category: REPORTS, to: '/reports-about-us', scope: 'company',
    keywords: ['تقارير عنا', 'عن شركتي', 'ماذا قيل', 'reports about us'],
  },

  {
    id: 'profile', title: 'ملف الشركة', icon: '🪪', category: ACCOUNT,
    to: '/profile', scope: 'company',
    keywords: ['ملفي', 'بياناتي', 'ملف الشركة', 'profile'],
  },
  {
    id: 'users', title: 'المستخدمون', icon: '👥', category: ACCOUNT,
    to: '/users', scope: 'company',
    keywords: ['المستخدمين', 'الفريق', 'الصلاحيات', 'users', 'team'],
  },
  {
    id: 'subscription', title: 'الاشتراك', icon: '💳', category: ACCOUNT,
    to: '/subscription', scope: 'company',
    keywords: ['اشتراكي', 'الباقة', 'الفاتورة', 'ترقية', 'subscription', 'plan'],
  },
  {
    id: 'notifications', title: 'الإشعارات', icon: '🔔', category: ACCOUNT,
    to: '/notifications', scope: 'company',
    keywords: ['اشعارات', 'تنبيهات', 'notifications'],
  },

  // ---- admin: what is waiting -------------------------------------------
  {
    id: 'admin-home', title: 'نظرة عامة', icon: '📊', category: ADMIN_OPS,
    to: '/admin', scope: 'admin',
    keywords: ['لوحة الادارة', 'الرئيسية', 'overview', 'admin'],
  },
  {
    id: 'admin-company-approval', title: 'اعتماد الشركات', hint: 'الشركات المنتظرة',
    icon: '✅', category: ADMIN_OPS, to: '/admin/company-approval', scope: 'admin',
    keywords: ['اعتماد', 'موافقة', 'شركات معلقة', 'approval'],
  },
  {
    id: 'admin-reports', title: 'مراجعة التقارير', icon: '📋', category: ADMIN_OPS,
    to: '/admin/reports', scope: 'admin',
    keywords: ['مراجعة', 'تقارير', 'بلاغات', 'review reports'],
  },
  {
    id: 'admin-claims', title: 'طلبات المطالبة بالملكية', icon: '🔑', category: ADMIN_OPS,
    to: '/admin/claim-requests', scope: 'admin',
    keywords: ['مطالبة', 'ملكية', 'claim'],
  },
  {
    id: 'admin-disputes', title: 'النزاعات', icon: '⚠️', category: ADMIN_OPS,
    to: '/admin/disputes', scope: 'admin',
    keywords: ['نزاع', 'اعتراض', 'خلاف', 'disputes'],
  },
  {
    id: 'admin-requests', title: 'طلبات البيانات', icon: '📨', category: ADMIN_OPS,
    to: '/admin/requests', scope: 'admin',
    keywords: ['طلبات', 'استيضاح', 'requests'],
  },
  {
    id: 'admin-roster', title: 'كشف الشركات', hint: 'ما ينقص كل سجل',
    icon: '📑', category: ADMIN_OPS, to: '/admin/roster', scope: 'admin',
    keywords: ['كشف', 'الناقص', 'اكتمال', 'roster'],
  },

  {
    id: 'admin-companies', title: 'إدارة الشركات', icon: '🏢', category: ADMIN_DATA,
    to: '/admin/companies', scope: 'admin',
    keywords: ['الشركات', 'ادارة الشركات', 'companies'],
  },
  {
    id: 'admin-verification', title: 'توثيق الشركات', icon: '🛡', category: ADMIN_DATA,
    to: '/admin/company-verification', scope: 'admin',
    keywords: ['توثيق', 'موثقة', 'verification'],
  },
  {
    id: 'admin-documents', title: 'المستندات', icon: '📎', category: ADMIN_DATA,
    to: '/admin/documents', scope: 'admin',
    keywords: ['مستندات', 'وثائق', 'مرفقات', 'documents'],
  },
  {
    id: 'admin-bulk-import', title: 'الاستيراد الجماعي', icon: '📥', category: ADMIN_DATA,
    to: '/admin/bulk-import', scope: 'admin',
    keywords: ['استيراد', 'رفع جماعي', 'bulk import'],
  },
  {
    id: 'admin-activities', title: 'دليل الأنشطة', hint: 'تحميل قائمة ISIC4',
    icon: '📚', category: ADMIN_DATA, to: '/admin/activities', scope: 'admin',
    keywords: ['انشطة', 'الانشطة', 'isic', 'دليل', 'activities'],
  },
  {
    id: 'admin-fraud', title: 'كشف التلاعب', icon: '🚨', category: ADMIN_DATA,
    to: '/admin/fraud-detection', scope: 'admin',
    keywords: ['تلاعب', 'احتيال', 'مشبوه', 'fraud'],
  },
  {
    id: 'admin-export', title: 'تصدير البيانات', icon: '⬇️', category: ADMIN_DATA,
    to: '/admin/data-export', scope: 'admin',
    keywords: ['تصدير', 'csv', 'export'],
  },
  {
    id: 'admin-logs', title: 'سجل العمليات', hint: 'من فعل ماذا ومتى',
    icon: '🧾', category: ADMIN_DATA, to: '/admin/logs', scope: 'admin',
    keywords: ['سجل', 'العمليات', 'تدقيق', 'من فعل', 'audit', 'logs'],
  },

  {
    id: 'admin-tenants', title: 'الحسابات', icon: '🏛', category: ADMIN_MONEY,
    to: '/admin/tenants', scope: 'admin',
    keywords: ['حسابات', 'العملاء', 'tenants'],
  },
  {
    id: 'admin-subscriptions', title: 'الاشتراكات', icon: '💳', category: ADMIN_MONEY,
    to: '/admin/subscriptions', scope: 'admin',
    keywords: ['اشتراكات', 'subscriptions'],
  },
  {
    id: 'admin-payments', title: 'المدفوعات', icon: '💰', category: ADMIN_MONEY,
    to: '/admin/payments', scope: 'admin',
    keywords: ['مدفوعات', 'تحويل', 'فواتير', 'payments'],
  },
  {
    id: 'admin-plans', title: 'الباقات', icon: '📦', category: ADMIN_MONEY,
    to: '/admin/plans', scope: 'admin',
    keywords: ['باقات', 'خطط', 'اسعار', 'plans'],
  },
  {
    id: 'admin-partners', title: 'الشركاء', icon: '🤝', category: ADMIN_MONEY,
    to: '/admin/partners', scope: 'admin',
    keywords: ['شركاء', 'شراكة', 'partners'],
  },

  {
    id: 'admin-settings', title: 'إعدادات المنصة', icon: '⚙️', category: ADMIN_SETTINGS,
    to: '/admin/settings', scope: 'admin',
    keywords: ['اعدادات', 'ضبط', 'settings'],
  },
  {
    id: 'admin-trust-score', title: 'قواعد مؤشر الثقة', icon: '🎯', category: ADMIN_SETTINGS,
    to: '/admin/trust-score', scope: 'admin',
    keywords: ['الثقة', 'الدرجة', 'مؤشر', 'trust score'],
  },
  {
    id: 'admin-users', title: 'المستخدمون', icon: '👥', category: ADMIN_SETTINGS,
    to: '/admin/users', scope: 'admin',
    keywords: ['المستخدمين', 'users'],
  },
  {
    id: 'admin-admin-users', title: 'فريق مرصد', hint: 'من يملك صلاحية إدارية',
    icon: '🛡', category: ADMIN_SETTINGS, to: '/admin/admin-users', scope: 'admin',
    keywords: ['المشرفين', 'الادارة', 'صلاحيات', 'admins'],
  },
  {
    id: 'admin-health', title: 'حالة النظام', icon: '💚', category: ADMIN_SETTINGS,
    to: '/admin/system-health', scope: 'admin',
    keywords: ['الصحة', 'الحالة', 'اداء', 'health'],
  },
]

/**
 * The commands this person may actually use.
 *
 * Filtered by role rather than shown-and-refused. Offering an administrator's
 * screen to somebody who will be bounced to /unauthorized is worse than not
 * offering it: it advertises a door, wastes the click, and tells them something
 * about the product they were not meant to know.
 */
export function commandsFor({ isPlatformAdmin, hasTenant }) {
  return COMMANDS.filter((c) => {
    if (c.scope === 'admin') return !!isPlatformAdmin
    if (c.scope === 'company') return !!hasTenant || !!isPlatformAdmin
    return true
  })
}
