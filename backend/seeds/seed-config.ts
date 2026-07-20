/**
 * Seed Configuration
 * ==================
 * Configuration settings for seeding process
 */

export const seedConfig = {
  /**
   * Seed Environment
   */
  environment: {
    development: {
      enabled: true,
      clearBefore: false,
      logLevel: 'info',
    },
    test: {
      enabled: true,
      clearBefore: true,
      logLevel: 'warn',
    },
    production: {
      enabled: false,
      clearBefore: false,
      logLevel: 'error',
    },
  },

  /**
   * Default Quantities
   */
  quantities: {
    plans: 4,
    adminUsers: 3,
    tenants: 6,
    usersPerTenant: 2,
    targetCompanies: 10,
    reportsPerTenant: 4,
    watchlistsPerTenant: 3,
    auditLogs: 20,
    businessRequests: 5,
    notifications: 10,
    invoicesPerSubscription: 3,
  },

  /**
   * Plan Configuration
   */
  plans: {
    free: {
      name: 'مجاني',
      priceMonthly: 0,
      features: [
        'basic_search',
        'view_reports_limited',
        'watchlist_1',
        'community_reports',
      ],
      limits: {
        views: 50,
        users: 1,
        watchlists: 1,
        reports_per_month: 2,
        api_calls: 0,
      },
    },
    basic: {
      name: 'أساسي',
      priceMonthly: 99,
      features: [
        'advanced_search',
        'view_reports',
        'watchlist_3',
        'export_reports',
        'email_alerts',
      ],
      limits: {
        views: 500,
        users: 3,
        watchlists: 3,
        reports_per_month: 20,
        api_calls: 1000,
      },
    },
    pro: {
      name: 'احترافي',
      priceMonthly: 299,
      features: [
        'advanced_search',
        'view_reports_unlimited',
        'watchlist_unlimited',
        'export_reports',
        'api_access',
        'custom_alerts',
        'priority_support',
      ],
      limits: {
        views: 5000,
        users: 10,
        watchlists: 999,
        reports_per_month: 200,
        api_calls: 50000,
      },
    },
    enterprise: {
      name: 'مؤسسات',
      priceMonthly: 999,
      features: [
        'advanced_search',
        'view_reports_unlimited',
        'watchlist_unlimited',
        'export_reports',
        'api_access',
        'custom_alerts',
        'dedicated_support',
        'sso',
        'audit_logs',
        'custom_branding',
      ],
      limits: {
        views: 999999,
        users: 999,
        watchlists: 999,
        reports_per_month: 9999,
        api_calls: 999999,
      },
    },
  },

  /**
   * Default Credentials
   */
  credentials: {
    admin: {
      email: 'admin@marsad.sa',
      password: 'Admin@123456',
      description: 'Platform Administrator',
    },
    reviewer: {
      email: 'reviewer@marsad.sa',
      password: 'Admin@123456',
      description: 'Report Reviewer',
    },
    support: {
      email: 'support@marsad.sa',
      password: 'Admin@123456',
      description: 'Support Staff',
    },
    testUser: {
      password: 'User@123456',
      description: 'Test User (for all tenant users)',
    },
  },

  /**
   * Business Sectors
   */
  sectors: [
    'مقاولات',
    'تجارة عامة',
    'استشارات',
    'لوجستيات',
    'صناعة',
    'تطوير عقاري',
    'تكنولوجيا',
    'خدمات مالية',
    'الرعاية الصحية',
    'التعليم',
  ],

  /**
   * Saudi Cities
   */
  cities: [
    'الرياض',
    'جدة',
    'الدمام',
    'الخبر',
    'الكويت',
    'المدينة المنورة',
    'القصيم',
    'الأحساء',
    'ينبع',
    'تبوك',
  ],

  /**
   * Report Status Workflow
   */
  reportStatuses: {
    draft: {
      canTransitionTo: ['pending_review', 'cancelled'],
      requiresReview: false,
    },
    pending_review: {
      canTransitionTo: ['approved', 'rejected', 'request_info', 'cancelled'],
      requiresReview: true,
    },
    approved: {
      canTransitionTo: [],
      requiresReview: true,
    },
    rejected: {
      canTransitionTo: [],
      requiresReview: true,
    },
    request_info: {
      canTransitionTo: ['pending_review', 'cancelled'],
      requiresReview: true,
    },
    cancelled: {
      canTransitionTo: [],
      requiresReview: false,
    },
  },

  /**
   * Deal Amount Ranges
   */
  dealAmountRanges: [
    '0-50k',
    '50k-100k',
    '100k-500k',
    '500k+',
  ],

  /**
   * Payment Commitment Types
   */
  paymentCommitments: [
    'full',
    'partial',
    'late',
    'default',
  ],

  /**
   * Risk Bands
   */
  riskBands: [
    'low',
    'medium',
    'high',
  ],

  /**
   * Audit Log Actions
   */
  auditActions: [
    'report:create',
    'report:update',
    'report:submit',
    'report:approve',
    'report:reject',
    'report:delete',
    'user:login',
    'user:logout',
    'user:create',
    'user:update',
    'user:delete',
    'subscription:create',
    'subscription:update',
    'subscription:cancel',
    'settings:change',
    'company:claim',
    'watchlist:add',
    'watchlist:remove',
  ],

  /**
   * Notification Types
   */
  notificationTypes: [
    'report_approved',
    'report_rejected',
    'score_changed',
    'request_received',
    'watchlist_alert',
    'subscription_expiring',
    'new_review',
  ],

  /**
   * User Roles
   */
  userRoles: {
    platform_admin: {
      canManageUsers: true,
      canApproveReports: false,
      canViewAllReports: true,
      canManagePlans: true,
      canAccessAnalytics: true,
    },
    reviewer: {
      canManageUsers: false,
      canApproveReports: true,
      canViewAllReports: true,
      canManagePlans: false,
      canAccessAnalytics: false,
    },
    company_admin: {
      canManageUsers: true,
      canApproveReports: false,
      canViewAllReports: false,
      canManagePlans: false,
      canAccessAnalytics: true,
    },
    company_member: {
      canManageUsers: false,
      canApproveReports: false,
      canViewAllReports: false,
      canManagePlans: false,
      canAccessAnalytics: false,
    },
  },

  /**
   * Batch Processing
   */
  batchProcessing: {
    chunkSize: 100,
    delayMs: 100,
    transactional: true,
  },

  /**
   * Testing Scenarios
   */
  testScenarios: {
    multiTenant: {
      tenants: 3,
      usersPerTenant: 2,
      reportsPerTenant: 3,
    },
    largeBatch: {
      tenants: 10,
      usersPerTenant: 5,
      reportsPerTenant: 10,
    },
    minimal: {
      tenants: 2,
      usersPerTenant: 1,
      reportsPerTenant: 1,
    },
  },

  /**
   * Validation Rules
   */
  validation: {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    crNumber: /^\d{10}$/,
    phone: /^\+966\d{9}$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    companyName: /^[ا-ي\s]{2,100}$|^[a-zA-Z\s]{2,100}$/,
  },

  /**
   * Logging Configuration
   */
  logging: {
    enabled: true,
    verbose: process.env.SEED_VERBOSE === 'true',
    logFile: 'seed.log',
    maxLogSize: 10 * 1024 * 1024, // 10MB
  },

  /**
   * Performance Configuration
   */
  performance: {
    maxParallelInserts: 5,
    connectionPoolSize: 10,
    queryTimeout: 30000, // 30 seconds
  },

  /**
   * Feature Flags
   */
  features: {
    generateAuditLogs: true,
    generateNotifications: true,
    generateBusinessRequests: true,
    calculateTrustScores: true,
    createInvoices: true,
  },
}

export default seedConfig
