/**
 * Marsad Backend Seed Script
 * ============================
 * Comprehensive seed data for production-ready demo and testing
 *
 * Usage:
 *   npm run prisma:seed          # Run all seeds
 *   NODE_ENV=test npm run prisma:seed   # Run test seeds
 */

import { PrismaClient, Decimal } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

const prisma = new PrismaClient()

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  batchSize: 100,
  demoMode: process.env.DEMO_MODE !== 'false',
  testMode: process.env.NODE_ENV === 'test',
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

function generateCRNumber(): string {
  return Math.random().toString().substring(2, 12)
}

// ============================================================================
// SEED MODULES
// ============================================================================

async function seedPlans() {
  console.log('📦 Seeding Plans...')

  const plans = [
    {
      id: 'plan-free',
      name: 'مجاني',
      priceMonthly: new Decimal('0'),
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
      active: true,
    },
    {
      id: 'plan-basic',
      name: 'أساسي',
      priceMonthly: new Decimal('99'),
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
      active: true,
    },
    {
      id: 'plan-pro',
      name: 'احترافي',
      priceMonthly: new Decimal('299'),
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
      active: true,
    },
    {
      id: 'plan-enterprise',
      name: 'مؤسسات',
      priceMonthly: new Decimal('999'),
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
      active: true,
    },
  ]

  const createdPlans = []
  for (const plan of plans) {
    const created = await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    })
    createdPlans.push(created)
  }

  console.log(`✓ Created ${createdPlans.length} plans`)
  return createdPlans
}

async function seedAdminUsers() {
  console.log('👨‍💼 Seeding Admin Users...')

  const adminPassword = await hashPassword('Admin@123456')

  const admins = [
    {
      id: 'user-admin-1',
      tenantId: null,
      email: 'admin@marsad.sa',
      firstName: 'محمد',
      lastName: 'الإداري',
      role: 'platform_admin',
      status: 'active',
      emailVerified: true,
      passwordHash: adminPassword,
    },
    {
      id: 'user-admin-2',
      tenantId: null,
      email: 'reviewer@marsad.sa',
      firstName: 'فاطمة',
      lastName: 'المراجعة',
      role: 'reviewer',
      status: 'active',
      emailVerified: true,
      passwordHash: adminPassword,
    },
    {
      id: 'user-admin-3',
      tenantId: null,
      email: 'support@marsad.sa',
      firstName: 'علي',
      lastName: 'الدعم',
      role: 'platform_admin',
      status: 'active',
      emailVerified: true,
      passwordHash: adminPassword,
    },
  ]

  const createdAdmins = []
  for (const admin of admins) {
    const created = await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        firstName: admin.firstName,
        lastName: admin.lastName,
        emailVerified: admin.emailVerified,
      },
      create: admin,
    })
    createdAdmins.push(created)
  }

  console.log(`✓ Created ${createdAdmins.length} admin users`)
  return createdAdmins
}

async function seedTenants(plans: any[]) {
  console.log('🏢 Seeding Tenants (Subscriber Companies)...')

  const proPlan = plans.find((p) => p.id === 'plan-pro')
  const basicPlan = plans.find((p) => p.id === 'plan-basic')
  const enterprisePlan = plans.find((p) => p.id === 'plan-enterprise')

  const tenantsData = [
    {
      id: 'tenant-khalij-01',
      name: 'شركة الخليج للإنشاءات',
      crNumber: '1234567890',
      email: 'contact@khalij.sa',
      phone: '+966501234567',
      city: 'الرياض',
      sector: 'مقاولات',
      status: 'active',
      planId: proPlan.id,
    },
    {
      id: 'tenant-arbc-02',
      name: 'الشركة العربية للتجارة',
      crNumber: '2345678901',
      email: 'info@arbc.com',
      phone: '+966502345678',
      city: 'جدة',
      sector: 'تجارة عامة',
      status: 'active',
      planId: basicPlan.id,
    },
    {
      id: 'tenant-alroyah-03',
      name: 'شركة الرؤية للاستشارات',
      crNumber: '3456789012',
      email: 'admin@alroyah.co',
      phone: '+966503456789',
      city: 'الدمام',
      sector: 'استشارات',
      status: 'active',
      planId: enterprisePlan.id,
    },
    {
      id: 'tenant-alnokba-04',
      name: 'النخبة للخدمات اللوجستية',
      crNumber: '4567890123',
      email: 'ops@alnokba.sa',
      phone: '+966504567890',
      city: 'الخبر',
      sector: 'لوجستيات',
      status: 'active',
      planId: basicPlan.id,
    },
    {
      id: 'tenant-hadid-05',
      name: 'صناعات الحديد المتقدمة',
      crNumber: '5678901234',
      email: 'sales@hadid.com',
      phone: '+966505678901',
      city: 'الرياض',
      sector: 'صناعة',
      status: 'active',
      planId: proPlan.id,
    },
    {
      id: 'tenant-tech-06',
      name: 'تقنية الرؤية المتقدمة',
      crNumber: '6789012345',
      email: 'info@techvision.sa',
      phone: '+966506789012',
      city: 'الرياض',
      sector: 'تكنولوجيا',
      status: 'active',
      planId: basicPlan.id,
    },
  ]

  const createdTenants = []
  for (const tenant of tenantsData) {
    const created = await prisma.tenant.upsert({
      where: { crNumber: tenant.crNumber },
      update: {
        status: tenant.status,
      },
      create: tenant,
    })
    createdTenants.push(created)

    // Create subscription
    await prisma.subscription.upsert({
      where: { tenantId: created.id },
      update: {},
      create: {
        id: `sub-${created.id}`,
        tenantId: created.id,
        planId: tenant.planId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  console.log(`✓ Created ${createdTenants.length} tenants with subscriptions`)
  return createdTenants
}

async function seedTenantUsers(tenants: any[]) {
  console.log('👥 Seeding Tenant Users...')

  const defaultPassword = await hashPassword('User@123456')
  let totalCreated = 0

  const usersByTenant = [
    {
      tenantId: 'tenant-khalij-01',
      users: [
        {
          email: 'admin.khalij@khalij.sa',
          firstName: 'محمد',
          lastName: 'الفايز',
          role: 'company_admin',
        },
        {
          email: 'user1.khalij@khalij.sa',
          firstName: 'فاطمة',
          lastName: 'السعيد',
          role: 'company_member',
        },
        {
          email: 'user2.khalij@khalij.sa',
          firstName: 'علي',
          lastName: 'محمود',
          role: 'company_member',
        },
      ],
    },
    {
      tenantId: 'tenant-arbc-02',
      users: [
        {
          email: 'admin.arbc@arbc.com',
          firstName: 'سارة',
          lastName: 'الأحمد',
          role: 'company_admin',
        },
        {
          email: 'user1.arbc@arbc.com',
          firstName: 'خالد',
          lastName: 'النعيم',
          role: 'company_member',
        },
      ],
    },
    {
      tenantId: 'tenant-alroyah-03',
      users: [
        {
          email: 'admin.alroyah@alroyah.co',
          firstName: 'أحمد',
          lastName: 'الدعيس',
          role: 'company_admin',
        },
        {
          email: 'user1.alroyah@alroyah.co',
          firstName: 'ليلى',
          lastName: 'العتيبي',
          role: 'company_member',
        },
        {
          email: 'user2.alroyah@alroyah.co',
          firstName: 'نور',
          lastName: 'الخريف',
          role: 'company_member',
        },
      ],
    },
    {
      tenantId: 'tenant-alnokba-04',
      users: [
        {
          email: 'admin.alnokba@alnokba.sa',
          firstName: 'عمر',
          lastName: 'المقرن',
          role: 'company_admin',
        },
        {
          email: 'user1.alnokba@alnokba.sa',
          firstName: 'هند',
          lastName: 'السويلم',
          role: 'company_member',
        },
      ],
    },
    {
      tenantId: 'tenant-hadid-05',
      users: [
        {
          email: 'admin.hadid@hadid.com',
          firstName: 'يوسف',
          lastName: 'الحميدي',
          role: 'company_admin',
        },
        {
          email: 'user1.hadid@hadid.com',
          firstName: 'ريم',
          lastName: 'الدوسري',
          role: 'company_member',
        },
      ],
    },
    {
      tenantId: 'tenant-tech-06',
      users: [
        {
          email: 'admin.techvision@techvision.sa',
          firstName: 'محمود',
          lastName: 'العمري',
          role: 'company_admin',
        },
        {
          email: 'user1.techvision@techvision.sa',
          firstName: 'نادية',
          lastName: 'الزهراني',
          role: 'company_member',
        },
      ],
    },
  ]

  for (const group of usersByTenant) {
    for (const userData of group.users) {
      const created = await prisma.user.upsert({
        where: { email: userData.email },
        update: {
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
        create: {
          id: `user-${userData.email.split('@')[0]}`,
          tenantId: group.tenantId,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          status: 'active',
          emailVerified: true,
          passwordHash: defaultPassword,
        },
      })
      totalCreated++
    }
  }

  console.log(`✓ Created ${totalCreated} tenant users`)
}

async function seedTargetCompanies() {
  console.log('🏭 Seeding Target Companies (Companies being reviewed)...')

  const companiesData = [
    {
      id: 'company-farsan-01',
      name: 'شركة الفرسان العملاقة',
      crNumber: '1111111111',
      sector: 'مقاولات',
      city: 'الرياض',
      foundedYear: 2010,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-thora-02',
      name: 'مجموعة الثروة التجارية',
      crNumber: '2222222222',
      sector: 'تجارة عامة',
      city: 'جدة',
      foundedYear: 2008,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
    {
      id: 'company-sareh-03',
      name: 'الصرح للاستشارات الهندسية',
      crNumber: '3333333333',
      sector: 'استشارات',
      city: 'الدمام',
      foundedYear: 2015,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-wathba-04',
      name: 'شركة الوثبة للمقاولات',
      crNumber: '4444444444',
      sector: 'مقاولات',
      city: 'الرياض',
      foundedYear: 2012,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-takamol-05',
      name: 'التكامل الصناعي الحديث',
      crNumber: '5555555555',
      sector: 'صناعة',
      city: 'الخبر',
      foundedYear: 2011,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
    {
      id: 'company-hiwar-06',
      name: 'الحوار للخدمات اللوجستية',
      crNumber: '6666666666',
      sector: 'لوجستيات',
      city: 'الرياض',
      foundedYear: 2013,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-jusur-07',
      name: 'جسور التنمية للاستشارات',
      crNumber: '7777777777',
      sector: 'استشارات',
      city: 'جدة',
      foundedYear: 2016,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-riada-08',
      name: 'الريادة للمشاريع والتطوير',
      crNumber: '8888888888',
      sector: 'تطوير عقاري',
      city: 'الرياض',
      foundedYear: 2009,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
    {
      id: 'company-nakheel-09',
      name: 'شركة النخيل للتنمية',
      crNumber: '9999999999',
      sector: 'تطوير عقاري',
      city: 'الرياض',
      foundedYear: 2014,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: 'company-etidal-10',
      name: 'الاعتدال للصناعات الخفيفة',
      crNumber: '1010101010',
      sector: 'صناعة',
      city: 'القصيم',
      foundedYear: 2017,
      crStatus: 'active',
      source: 'community',
      approved: false,
    },
  ]

  const createdCompanies = []
  for (const company of companiesData) {
    const created = await prisma.company.upsert({
      where: { crNumber: company.crNumber },
      update: {
        approved: company.approved,
      },
      create: company,
    })
    createdCompanies.push(created)

    // Create trust score for each company
    await prisma.trustScore.upsert({
      where: { companyId: created.id },
      update: {},
      create: {
        id: `trust-${created.id}`,
        companyId: created.id,
        score: Math.floor(Math.random() * 100),
        riskBand: Math.random() > 0.5 ? 'low' : 'medium',
        tier: 'preliminary',
        approvedReports: Math.floor(Math.random() * 10),
        breakdown: {
          official: Math.random() * 100,
          community: Math.random() * 100,
          formal_data_weight: 0.3,
          payment_history_weight: 0.4,
          legal_status_weight: 0.3,
        },
      },
    })
  }

  console.log(`✓ Created ${createdCompanies.length} target companies with trust scores`)
  return createdCompanies
}

async function seedReports(tenants: any[], companies: any[], adminUsers: any[]) {
  console.log('📋 Seeding Sample Reports...')

  const reviewer = adminUsers.find((u) => u.role === 'reviewer')
  let totalCreated = 0

  const reportStatuses = [
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'request_info',
  ]
  const dealAmountRanges = ['0-50k', '50k-100k', '100k-500k', '500k+']
  const paymentStatuses = ['full', 'partial', 'late', 'default']

  // Create 3-5 reports per tenant
  for (const tenant of tenants.slice(0, 4)) {
    const reportCount = Math.floor(Math.random() * 3) + 3
    const tenantUsers = await prisma.user.findMany({
      where: { tenantId: tenant.id },
    })

    for (let i = 0; i < reportCount; i++) {
      const targetCompany =
        companies[Math.floor(Math.random() * companies.length)]
      const status =
        reportStatuses[Math.floor(Math.random() * reportStatuses.length)]
      const dealtDate = new Date(
        Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000,
      )

      const report = await prisma.report.create({
        data: {
          id: `report-${tenant.id}-${i}`,
          reporterTenantId: tenant.id,
          targetCompanyId: targetCompany.id,
          status: status,
          dealAmountRange:
            dealAmountRanges[Math.floor(Math.random() * dealAmountRanges.length)],
          paymentCommitment:
            paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)],
          delayDays: Math.floor(Math.random() * 120),
          defaulted: Math.random() > 0.8,
          dealtAt: dealtDate,
          submittedAt:
            status !== 'draft' ? new Date(dealtDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
          approvedAt:
            status === 'approved'
              ? new Date(dealtDate.getTime() + 14 * 24 * 60 * 60 * 1000)
              : null,
          rejectedAt: status === 'rejected' ? new Date() : null,
        },
      })

      // Create review actions for non-draft reports
      if (status !== 'draft' && reviewer) {
        await prisma.reviewAction.create({
          data: {
            id: `review-${report.id}`,
            reportId: report.id,
            reviewerId: reviewer.id,
            action: status === 'approved' ? 'approve' : 'reject',
            reason:
              status === 'rejected'
                ? 'بيانات غير كاملة أو غير دقيقة'
                : undefined,
          },
        })
      }

      totalCreated++
    }
  }

  console.log(`✓ Created ${totalCreated} sample reports`)
}

async function seedWatchlistItems(tenants: any[], companies: any[]) {
  console.log('👁️ Seeding Watchlist Items...')

  let totalCreated = 0

  for (const tenant of tenants) {
    const watchlistCount = Math.floor(Math.random() * 5) + 1
    const selectedCompanies = companies
      .sort(() => Math.random() - 0.5)
      .slice(0, watchlistCount)

    for (const company of selectedCompanies) {
      try {
        await prisma.watchlistItem.create({
          data: {
            id: `watchlist-${tenant.id}-${company.id}`,
            tenantId: tenant.id,
            companyId: company.id,
            listName: 'قائمة المراقبة الرئيسية',
          },
        })
        totalCreated++
      } catch (e) {
        // Skip duplicates
      }
    }
  }

  console.log(`✓ Created ${totalCreated} watchlist items`)
}

async function seedAuditLogs(adminUsers: any[]) {
  console.log('📝 Seeding Audit Logs...')

  const actions = [
    'report:create',
    'report:approve',
    'report:reject',
    'user:login',
    'user:create',
    'subscription:create',
    'settings:change',
  ]

  let totalCreated = 0

  for (let i = 0; i < 20; i++) {
    const admin = adminUsers[Math.floor(Math.random() * adminUsers.length)]
    const action = actions[Math.floor(Math.random() * actions.length)]

    await prisma.auditLog.create({
      data: {
        id: `audit-${uuid()}`,
        actorId: admin.id,
        actorRole: admin.role,
        action: action,
        entity: action.split(':')[0],
        entityId: uuid(),
        meta: {
          timestamp: new Date(),
          ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      },
    })

    totalCreated++
  }

  console.log(`✓ Created ${totalCreated} audit logs`)
}

async function seedBusinessRequests(tenants: any[]) {
  console.log('💼 Seeding Business Requests...')

  let totalCreated = 0

  for (let i = 0; i < 5; i++) {
    const fromTenant = tenants[Math.floor(Math.random() * tenants.length)]
    const toTenant = tenants.find((t) => t.id !== fromTenant.id)

    if (toTenant) {
      const statuses = ['pending', 'accepted', 'declined']
      await prisma.businessRequest.create({
        data: {
          id: `breq-${uuid()}`,
          fromTenantId: fromTenant.id,
          toTenantId: toTenant.id,
          subject: 'طلب تبادل معلومات الشركات',
          body: 'نود التعاون والتبادل المعلومات حول الشركات الموثوقة',
          status: statuses[Math.floor(Math.random() * statuses.length)],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
      totalCreated++
    }
  }

  console.log(`✓ Created ${totalCreated} business requests`)
}

async function seedNotifications(adminUsers: any[]) {
  console.log('🔔 Seeding Notifications...')

  const notificationTypes = [
    'report_approved',
    'score_changed',
    'request_received',
    'watchlist_alert',
  ]

  let totalCreated = 0

  for (let i = 0; i < 10; i++) {
    const user = adminUsers[Math.floor(Math.random() * adminUsers.length)]
    const type = notificationTypes[Math.floor(Math.random() * notificationTypes.length)]

    await prisma.notification.create({
      data: {
        id: `notif-${uuid()}`,
        userId: user.id,
        type: type,
        payload: {
          companyId: uuid(),
          timestamp: new Date(),
          details: 'معلومات الإخطار',
        },
        readAt: Math.random() > 0.5 ? new Date() : null,
      },
    })

    totalCreated++
  }

  console.log(`✓ Created ${totalCreated} notifications`)
}

async function seedInvoices() {
  console.log('💳 Seeding Invoices...')

  const subscriptions = await prisma.subscription.findMany({
    take: 5,
  })

  let totalCreated = 0

  for (const subscription of subscriptions) {
    for (let i = 0; i < 3; i++) {
      const issuedAt = new Date(
        Date.now() - i * 30 * 24 * 60 * 60 * 1000,
      )
      const dueAt = new Date(issuedAt.getTime() + 15 * 24 * 60 * 60 * 1000)
      const amount = Math.floor(Math.random() * 500) + 100

      await prisma.invoice.create({
        data: {
          id: `invoice-${uuid()}`,
          subscriptionId: subscription.id,
          amount: new Decimal(amount),
          vat: new Decimal(Math.round(amount * 0.15)),
          status: Math.random() > 0.3 ? 'paid' : 'pending',
          issuedAt: issuedAt,
          dueAt: dueAt,
          paidAt: Math.random() > 0.3 ? new Date() : null,
        },
      })

      totalCreated++
    }
  }

  console.log(`✓ Created ${totalCreated} invoices`)
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║        Marsad Backend: Comprehensive Seed Script               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  try {
    // Step 1: Plans
    const plans = await seedPlans()

    // Step 2: Admin Users
    const adminUsers = await seedAdminUsers()

    // Step 3: Tenants with Subscriptions
    const tenants = await seedTenants(plans)

    // Step 4: Tenant Users
    await seedTenantUsers(tenants)

    // Step 5: Target Companies with Trust Scores
    const companies = await seedTargetCompanies()

    // Step 6: Reports
    await seedReports(tenants, companies, adminUsers)

    // Step 7: Watchlist Items
    await seedWatchlistItems(tenants, companies)

    // Step 8: Audit Logs
    await seedAuditLogs(adminUsers)

    // Step 9: Business Requests
    await seedBusinessRequests(tenants)

    // Step 10: Notifications
    await seedNotifications(adminUsers)

    // Step 11: Invoices
    await seedInvoices()

    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║           ✓ All Seeds Completed Successfully                  ║')
    console.log('╚══════════════════════════════════════════════════════════════╝\n')

    console.log('📊 Seeded Data Summary:')
    console.log(`  • Plans: 4`)
    console.log(`  • Admin Users: 3`)
    console.log(`  • Tenants: ${tenants.length}`)
    console.log(`  • Target Companies: ${companies.length}`)
    console.log(`  • Sample Reports: Multiple per tenant`)
    console.log(`  • Watchlist Items: Multiple per tenant`)
    console.log(`  • Audit Logs: 20`)
    console.log(`  • Business Requests: 5`)
    console.log(`  • Notifications: 10`)
    console.log(`  • Invoices: 15`)

    console.log('\n🔐 Default Test Credentials:')
    console.log('  Email: admin@marsad.sa')
    console.log('  Password: Admin@123456')
    console.log('')
  } catch (error) {
    console.error('❌ Seed failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
