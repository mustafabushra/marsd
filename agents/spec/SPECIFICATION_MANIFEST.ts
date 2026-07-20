/**
 * Marsad Project Specification Manifest
 * Source of Truth for all agents
 *
 * Extracted directly from MARSAD_PROJECT_SPEC.md
 * Last Updated: 2026-07-13
 */

export const MARSAD_SPECIFICATION = {
  // Project Metadata
  projectName: 'مرصد — Marsad',
  projectType: 'B2B SaaS — Multi-Tenant',
  targetMarket: 'Kingdom of Saudi Arabia',
  deadline: '2026-08-03',
  version: '1.0',
  language: 'Arabic (RTL)',
  currency: 'Saudi Riyal (SAR)',

  // Core Product Definition
  product: {
    description: 'منصة تقييم موثوقية الأعمال — Business Reliability Assessment Platform',
    model: 'Subscription SaaS with 4 tiers',
    mechanism: {
      officialData: 'حالة السجل التجاري + عمر الشركة (30%)',
      communityData: 'تقارير من شركات تعاملت فعلياً (70%)',
      trustScore: 'مؤشر ثقة محسوب خوارزمياً من بيانات معتمدة فقط',
    },
    protection: 'كل تقرير يخضع لمراجعة إدارية إلزامية — هوية المُبلِّغ محمية تماماً',
  },

  // Subscription Plans
  plans: [
    {
      id: 'free',
      name: 'مجانية',
      priceMonthly: 0,
      limits: {
        viewsPerMonth: 'limited',
        usersAllowed: 1,
        watchlists: 0,
        features: ['basicSearch', 'officialDataOnly'],
        trustScoreVisible: false,
        trustScoreAppearance: 'blurred_with_upgrade_prompt',
      },
    },
    {
      id: 'basic',
      name: 'أساسية',
      priceMonthly: 299,
      limits: {
        viewsPerMonth: 25,
        usersAllowed: 2,
        watchlists: 1,
        reportsPerMonth: 25,
        features: ['fullSearch', 'communityData', 'watchlist', 'reports'],
      },
    },
    {
      id: 'pro',
      name: 'احترافية',
      priceMonthly: 799,
      limits: {
        viewsPerMonth: 100,
        usersAllowed: 10,
        watchlists: 'unlimited',
        reportsPerMonth: 100,
        features: ['fullSearch', 'communityData', 'watchlist', 'reports', 'compare', 'businessRequests'],
      },
    },
    {
      id: 'enterprise',
      name: 'مؤسسات',
      priceMonthly: 'custom',
      limits: {
        viewsPerMonth: 'unlimited',
        usersAllowed: 'unlimited',
        watchlists: 'unlimited',
        reportsPerMonth: 'unlimited',
        features: ['all', 'apiAccess', 'sla', 'accountManager'],
      },
    },
  ],

  // Functional Requirements (FR)
  functionalRequirements: {
    FR01: 'Registration & verification (company data + CR number)',
    FR02: 'Authentication (JWT Access + Refresh rotation)',
    FR03: 'Multi-tenancy (complete isolation per tenant)',
    FR04: 'RBAC (5 roles with defined permissions)',
    FR05: 'Company search (name/CR/sector/city with filters)',
    FR06: 'Company report page (4 display states)',
    FR07: 'Add new company request (admin approval)',
    FR08: 'Report wizard (4-step form)',
    FR09: 'Report review queue (approve/reject/request info)',
    FR10: 'Trust Score engine (auto-calculation from approved reports)',
    FR11: 'Reporter anonymity (no identity exposure ever)',
    FR12: 'Watchlists (add/monitor/notify on changes)',
    FR13: 'Compare up to 3 companies (side-by-side)',
    FR14: 'Business requests (inter-company)',
    FR15: 'Company user management (invite/roles/disable)',
    FR16: 'Subscriptions & billing (payment gateway integration)',
    FR17: 'Document upload (S3 with presigned URLs)',
    FR18: 'Notifications (in-app + email)',
    FR19: 'Audit logs (immutable record of all sensitive ops)',
    FR20: 'System settings (dashboard configurable)',
  },

  // Non-Functional Requirements (NFR)
  nonFunctionalRequirements: {
    NFR01: 'Performance: API response ≤300ms (P95), page load ≤2.5s',
    NFR02: 'Availability: 99.5% monthly in v1',
    NFR03: 'Scalability: Support 10k companies + 100 req/sec without redesign',
    NFR04: 'Security: TLS 1.3, AES-256, OWASP Top 10, tenant isolation',
    NFR05: 'Privacy: Reporter identity impossible to infer (architectural)',
    NFR06: 'Maintainability: ≥70% test coverage, Clean Architecture',
    NFR07: 'Compatibility: Last 2 versions Chrome/Safari/Edge/Firefox, 360px+',
    NFR08: 'Accessibility: AA contrast, keyboard support for core forms',
    NFR09: 'RTL: Complete RTL support in all screens (no exceptions)',
    NFR10: 'Compliance: PDPL readiness (personal data handling)',
  },

  // User Types & Roles
  userTypes: {
    visitor: { name: 'الزائر', accessPoints: ['marketing_website'] },
    companyMember: { name: 'موظف شركة', permissions: ['search', 'viewReports', 'submitReports', 'watchlist'] },
    companyAdmin: { name: 'مدير الشركة', permissions: ['all_company_member', 'manageUsers', 'billing', 'subscription'] },
    reviewer: { name: 'مراجع', permissions: ['reviewReports', 'approveCo'] },
    platformAdmin: { name: 'إدارة المنصة', permissions: ['all'] },
  },

  // Critical Business Rules (BR)
  businessRules: {
    BR01: 'No report counts until administratively approved',
    BR02: 'Reporter identity NEVER exposed — aggregated statistics only',
    BR03: 'Less than 5 approved reports = "insufficient data" (configurable)',
    BR04: 'No single report dominates: cap at 15% of community layer weight',
    BR05: 'One company: 1 report per 90 days to same target',
    BR06: '2-4 reports = preliminary rating (warning, no final number)',
    BR07: 'Free tier: official data visible, trust score + community data LOCKED',
    BR08: 'Rejected report: returned to sender with reason, one re-submit allowed',
    BR10: 'Exceeding plan limits = upgrade prompt, NO auto-charge',
    BR11: 'Every sensitive operation in immutable Audit Log',
  },

  // Trust Score Specification
  trustScoreEngine: {
    version: 'v1',
    formula: 'TrustScore = clamp(W_official × S_official + W_community × S_community, 0, 100)',
    defaultWeights: {
      W_official: 0.30,
      W_community: 0.70,
    },
    officialDataComponents: {
      registryStatus: { weight: 0.50, maxScore: 100 },
      companyAge: { weight: 0.30, maxScore: 100, threshold: 10 },
      dataCompleteness: { weight: 0.20, maxScore: 100 },
    },
    communityDataScoring: {
      fullCompliance: 100,
      delay_0_30days: 60,
      delay_31_90days: 35,
      delay_over_90days: 10,
      defaulted: 0,
    },
    recencyDecay: 'exponential: 0.5^(months/12)',
    capPerReport: 0.15, // 15% max contribution
    riskBands: {
      green: { range: '70-100', label: 'مخاطر منخفضة', color: '#15803D', bg: '#ECFDF5' },
      orange: { range: '40-69', label: 'مخاطر متوسطة', color: '#B45309', bg: '#FFFBEB' },
      red: { range: '0-39', label: 'مخاطر مرتفعة', color: '#B91C1C', bg: '#FEF2F2' },
    },
    minimumApprovedReports: 5, // Configurable via admin
    tiers: {
      full: { minReports: 5, displayScore: true, displayStats: true },
      preliminary: { minReports: 2, displayScore: false, displayCategory: true, warning: true },
      none: { minReports: 0, displayMessage: 'BR-03 message' },
      locked: { plan: 'free', displayScore: 'blurred', displayStats: false },
    },
  },

  // Report Lifecycle States
  reportStates: {
    draft: 'المسودة — locally unsent',
    pending_review: 'قيد المراجعة — awaiting admin decision',
    approved: 'معتمد — counts in stats',
    rejected: 'مرفوض — returned to sender',
    awaiting_info: 'بانتظار استكمال — request for more info',
    approval_revoked: 'ملغى الاعتماد — exceptional case',
  },

  // Screens (25 total: 7 marketing + 12 company + 6 admin)
  screens: {
    marketing: [
      { id: 1, name: 'الرئيسية', path: '/' },
      { id: 2, name: 'عن المنصة', path: '/about' },
      { id: 3, name: 'الباقات والأسعار', path: '/pricing' },
      { id: 4, name: 'الأسئلة الشائعة', path: '/faq' },
      { id: 5, name: 'تواصل معنا', path: '/contact' },
      { id: 6, name: 'إنشاء حساب', path: '/register' },
      { id: 7, name: 'تسجيل الدخول', path: '/login' },
    ],
    company: [
      { id: 8, name: 'لوحة التحكم', path: '/company/dashboard' },
      { id: 9, name: 'البحث', path: '/company/search' },
      { id: 10, name: 'تقرير الشركة', path: '/company/company/:id', states: '4 display variants' },
      { id: 11, name: 'إضافة شركة جديدة', path: '/company/add-company' },
      { id: 12, name: 'معالج إضافة تقرير', path: '/company/reports/new', steps: 4 },
      { id: 13, name: 'تقاريري المرسلة', path: '/company/reports/mine' },
      { id: 14, name: 'قوائم المراقبة', path: '/company/watchlist' },
      { id: 15, name: 'مقارنة الشركات', path: '/company/compare' },
      { id: 16, name: 'طلبات الأعمال', path: '/company/business-requests' },
      { id: 17, name: 'إدارة المستخدمين', path: '/company/team' },
      { id: 18, name: 'الاشتراك والفوترة', path: '/company/billing' },
      { id: 19, name: 'الملف الشخصي والإشعارات', path: '/company/profile' },
    ],
    admin: [
      { id: 20, name: 'لوحة الإدارة', path: '/admin/dashboard' },
      { id: 21, name: 'طابور المراجعة', path: '/admin/review-queue' },
      { id: 22, name: 'إدارة الشركات', path: '/admin/companies' },
      { id: 23, name: 'إدارة المشتركين والباقات', path: '/admin/subscriptions' },
      { id: 24, name: 'سجل العمليات', path: '/admin/audit-logs' },
      { id: 25, name: 'إعدادات النظام', path: '/admin/settings' },
    ],
  },

  // Design System (from Marsad.dc)
  designSystem: {
    font: { name: 'Tajawal', weights: [400, 500, 700, 800, 900], fallback: 'system-ui, sans-serif' },
    direction: 'rtl',
    colors: {
      navy: { value: '#1E2A52', usage: 'sidebar, headings, score number' },
      brandGreen: { value: '#16A34A', usage: 'buttons, logo, score fill' },
      greenDark: { value: '#15803D', usage: 'success badges' },
      greenBg: { value: '#ECFDF5', usage: 'success badge bg' },
      ink: { value: '#0F172A', usage: 'primary text' },
      slate600: { value: '#475569', usage: 'secondary text' },
      border: { value: '#E2E8F0', usage: 'card borders, most used' },
      surface: { value: '#FFFFFF', usage: 'card bg' },
      bg: { value: '#F8FAFC', usage: 'page bg' },
      bgMuted: { value: '#F1F5F9', usage: 'secondary bg' },
      warning: { value: '#F59E0B', text: '#B45309', bg: '#FFFBEB' },
      danger: { value: '#DC2626', text: '#B91C1C', bg: '#FEF2F2' },
    },
    components: {
      sidebar: { width: '268px', bg: 'navy', sticky: true },
      card: { border: '1px solid #E2E8F0', borderRadius: '12-18px', shadow: 'minimal' },
      badge: { borderRadius: '7px or 999px (pills)', weight: 800, size: '12.5-13.5px' },
      trustGauge: { diameter: '140px', innerDiameter: '108px', numberSize: '42px', weight: 900 },
      button: { borderRadius: '10px', weight: 800, bg: 'brandGreen', text: 'white' },
      input: { borderRadius: '10px', border: '1px solid #E2E8F0', bg: 'bgMuted or white' },
    },
  },

  // Security Requirements (no negotiation)
  security: {
    owasp: [
      'SQL Injection Prevention (Prisma parameterized)',
      'XSS Prevention (React.createElement, no innerHTML)',
      'CSRF Prevention (SameSite cookies)',
      'SSRF Prevention (whitelist URLs)',
      'XXE Prevention (disable XXE parsing)',
      'LDAP Injection Prevention',
      'Command Injection Prevention',
      'Template Injection Prevention',
      'Path Traversal Prevention',
      'IDOR Prevention (tenant_id validation)',
    ],
    authentication: {
      passwordHashing: 'Argon2id',
      accessToken: { ttl: '15 minutes' },
      refreshToken: { ttl: '7 days', rotation: true },
      accountLockout: 'after 5 failed attempts',
      adminMFA: 'TOTP required',
    },
    encryption: {
      transit: 'TLS 1.3 mandatory (HSTS)',
      storage: 'AES-256 (RDS, S3)',
      secrets: 'AWS Secrets Manager',
    },
    multiTenant: {
      isolation: 'RLS on all tenant_id columns',
      enforcement: 'Set LOCAL app.tenant_id in Middleware',
      bypass: 'NO BYPASSRLS for app role',
      dbLevel: 'Cannot leak even with app error',
    },
    privacy: {
      reporterIdentity: 'NEVER exposed (architectural, not just filtering)',
      dataMin: 'minimum aggregation to prevent inference',
      documentAccess: 'reviewers only, never shared',
    },
    auditTrail: {
      immutable: 'append-only, no UPDATE/DELETE',
      scope: 'all sensitive ops: approve, reject, suspend, settings change',
      recording: 'who, what, when, IP, User-Agent',
    },
  },

  // Infrastructure & Tech Stack
  techStack: {
    frontend: { framework: 'Next.js (App Router)', library: 'React', language: 'TypeScript' },
    backend: { framework: 'NestJS', orm: 'Prisma', language: 'TypeScript' },
    database: { engine: 'PostgreSQL 16 (AWS RDS)', rls: true },
    cache: { engine: 'Redis (ElastiCache)', queue: 'BullMQ' },
    storage: { service: 'AWS S3', presignedUrls: true, maxFileSize: '10MB' },
    email: { service: 'AWS SES' },
    payment: { gateway: 'Moyasar or Tap (TBD week 1)' },
    edge: { service: 'Cloudflare (WAF, CDN, DDoS)' },
    containers: { runtime: 'Docker', orchestration: 'ECS Fargate' },
    cicd: { platform: 'GitHub Actions', registry: 'ECR', deploymentStrategy: 'Rolling (zero-downtime)' },
    monitoring: { logs: 'CloudWatch', errors: 'Sentry', metrics: 'CloudWatch' },
  },

  // Timeline (4 weeks, immovable)
  timeline: {
    week1: {
      period: '2026-07-03 to 2026-07-10',
      name: 'م1 — التأسيس',
      deliverable: 'Staging operational: signup, login, marketing site',
      critical: 'Deploy infra, CI/CD, Prisma schema, Auth',
    },
    week2: {
      period: '2026-07-11 to 2026-07-18',
      name: 'م2 — قلب المنتج',
      deliverable: 'Golden journey: search → report → upload',
      critical: 'Company search, report page (4 states), report wizard, Trust Score engine',
    },
    week3: {
      period: '2026-07-19 to 2026-07-26',
      name: 'م3 — الإدارة والتجارة',
      deliverable: 'Full cycle: paid subscription + admin approval changes score',
      critical: 'Review queue, subscriptions, payments, watchlists, compare, business requests',
    },
    week4: {
      period: '2026-07-27 to 2026-08-03',
      name: 'م4 — الصقل والإطلاق',
      deliverable: 'Production launch (GO LIVE)',
      critical: 'E2E tests, security audit, UAT, performance tuning, launch',
    },
  },

  // Success Criteria (Launch Checklist)
  launchChecklist: [
    '✔ All 25 screens operational per approved design',
    '✔ Golden journey complete and tested',
    '✔ Trust Score calculated accurately',
    '✔ Reporter identity protected (0% exposure)',
    '✔ RLS enforced: Tenant A cannot access Tenant B data',
    '✔ OWASP Top 10 coverage verified',
    '✔ Audit Log immutable and comprehensive',
    '✔ E2E tests passing',
    '✔ No 5xx errors',
    '✔ UAT sign-off from client',
  ],

  // Post-Launch (Phase 2 & 3 — out of scope for v1)
  futurePhases: {
    phase2: ['Government registry integration', 'Public API', 'SMS/WhatsApp alerts', 'PDF reports'],
    phase3: ['Mobile app', 'Sector benchmarks', 'AI analysis', 'Gulf expansion'],
  },
} as const

export type MarsadSpec = typeof MARSAD_SPECIFICATION
