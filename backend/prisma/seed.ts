import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 بدء بذر البيانات...')

  // 1. إنشاء الباقات
  console.log('📦 إنشاء الباقات...')
  const freePlan = await prisma.plan.upsert({
    where: { name: 'مجاني' },
    update: {},
    create: {
      id: uuid(),
      name: 'مجاني',
      priceMonthly: 0,
      limits: { views: 3, users: 1, watchlists: 1 },
      features: ['basic_search', 'view_official_data'],
    },
  })

  const basicPlan = await prisma.plan.upsert({
    where: { name: 'أساسي' },
    update: {},
    create: {
      id: uuid(),
      name: 'أساسي',
      priceMonthly: 99,
      limits: { views: 50, users: 3, watchlists: 3 },
      features: ['unlimited_search', 'view_score', 'upload_reports', 'watchlist'],
    },
  })

  const proPlan = await prisma.plan.upsert({
    where: { name: 'احترافي' },
    update: {},
    create: {
      id: uuid(),
      name: 'احترافي',
      priceMonthly: 299,
      limits: { views: 999999, users: 10, watchlists: 999999 },
      features: ['all', 'compare', 'business_requests', 'priority_review'],
    },
  })

  // 2. إنشاء شركات تجريبية
  console.log('🏢 إنشاء شركات تجريبية...')
  const companies = [
    {
      id: uuid(),
      name: 'شركة نجد للمقاولات',
      crNumber: '1010123456',
      sector: 'مقاولات',
      city: 'الرياض',
      foundedYear: 2014,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
    {
      id: uuid(),
      name: 'الرياض للتجارة',
      crNumber: '1010789456',
      sector: 'تجارة',
      city: 'الرياض',
      foundedYear: 2018,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: uuid(),
      name: 'التقنية المتقدمة',
      crNumber: '1010456789',
      sector: 'تقنية',
      city: 'جدة',
      foundedYear: 2020,
      crStatus: 'active',
      source: 'community',
      approved: true,
    },
    {
      id: uuid(),
      name: 'الشرق للتوريد',
      crNumber: '1010111222',
      sector: 'توريد',
      city: 'الدمام',
      foundedYear: 2016,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
    {
      id: uuid(),
      name: 'الخليج للخدمات',
      crNumber: '1010333444',
      sector: 'خدمات',
      city: 'الرياض',
      foundedYear: 2012,
      crStatus: 'active',
      source: 'official',
      approved: true,
    },
  ]

  for (const company of companies) {
    await prisma.company.upsert({
      where: { crNumber: company.crNumber },
      update: {},
      create: company,
    })
  }

  // 3. إنشاء مشتركين تجريبيين (Tenants)
  console.log('👥 إنشاء مشتركين تجريبيين...')
  const tenant1Id = uuid()
  const tenant2Id = uuid()

  const tenant1 = await prisma.tenant.create({
    data: {
      id: tenant1Id,
      name: 'شركة الاختبار الأولى',
      crNumber: '9999999999',
      email: 'test1@marsad.sa',
      phone: '0501234567',
      city: 'الرياض',
      sector: 'تجارة',
      status: 'active',
    },
  })

  const tenant2 = await prisma.tenant.create({
    data: {
      id: tenant2Id,
      name: 'شركة الاختبار الثانية',
      crNumber: '8888888888',
      email: 'test2@marsad.sa',
      phone: '0509876543',
      city: 'جدة',
      sector: 'مقاولات',
      status: 'active',
    },
  })

  // 4. إنشاء مستخدمين
  console.log('👤 إنشاء مستخدمين...')
  const password = await bcrypt.hash('Test@1234', 10)

  await prisma.user.create({
    data: {
      id: uuid(),
      tenantId: tenant1.id,
      email: 'test1@marsad.sa',
      passwordHash: password,
      firstName: 'مدير',
      lastName: 'الشركة الأولى',
      role: 'company_admin',
      status: 'active',
      emailVerified: true,
    },
  })

  await prisma.user.create({
    data: {
      id: uuid(),
      tenantId: tenant2.id,
      email: 'test2@marsad.sa',
      passwordHash: password,
      firstName: 'مدير',
      lastName: 'الشركة الثانية',
      role: 'company_admin',
      status: 'active',
      emailVerified: true,
    },
  })

  // 5. إنشاء اشتراكات
  console.log('📋 إنشاء اشتراكات...')
  const endOfMonth = new Date()
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)

  await prisma.subscription.create({
    data: {
      id: uuid(),
      tenantId: tenant1.id,
      planId: basicPlan.id,
      status: 'active',
      currentPeriodEnd: endOfMonth,
    },
  })

  await prisma.subscription.create({
    data: {
      id: uuid(),
      tenantId: tenant2.id,
      planId: proPlan.id,
      status: 'active',
      currentPeriodEnd: endOfMonth,
    },
  })

  // 6. إنشاء تقارير معتمدة (لحساب المؤشر)
  console.log('📝 إنشاء تقارير معتمدة...')
  const companyToRate = companies[0] // نجد للمقاولات
  const reports = [
    {
      reporterTenantId: tenant1.id,
      targetCompanyId: companyToRate.id,
      dealAmountRange: '100k-500k',
      paymentCommitment: 'full',
      delayDays: 0,
      defaulted: false,
      dealtAt: new Date('2026-06-15'),
    },
    {
      reporterTenantId: tenant2.id,
      targetCompanyId: companyToRate.id,
      dealAmountRange: '50k-100k',
      paymentCommitment: 'full',
      delayDays: 0,
      defaulted: false,
      dealtAt: new Date('2026-06-20'),
    },
    {
      reporterTenantId: tenant1.id,
      targetCompanyId: companyToRate.id,
      dealAmountRange: '500k+',
      paymentCommitment: 'full',
      delayDays: 0,
      defaulted: false,
      dealtAt: new Date('2026-05-10'),
    },
    {
      reporterTenantId: tenant2.id,
      targetCompanyId: companyToRate.id,
      dealAmountRange: '100k-500k',
      paymentCommitment: 'partial',
      delayDays: 15,
      defaulted: false,
      dealtAt: new Date('2026-04-01'),
    },
    {
      reporterTenantId: tenant1.id,
      targetCompanyId: companyToRate.id,
      dealAmountRange: '50k-100k',
      paymentCommitment: 'full',
      delayDays: 0,
      defaulted: false,
      dealtAt: new Date('2026-03-15'),
    },
  ]

  for (const reportData of reports) {
    await prisma.report.create({
      data: {
        id: uuid(),
        ...reportData,
        status: 'approved',
        submittedAt: reportData.dealtAt,
        approvedAt: new Date(),
      },
    })
  }

  console.log('✅ تم بذر البيانات بنجاح!')
  console.log(`
    🔐 بيانات الاختبار:

    الشركة 1: test1@marsad.sa
    الشركة 2: test2@marsad.sa
    كلمة المرور: Test@1234

    خادم API: http://localhost:3000
  `)
}

main()
  .catch((e) => {
    console.error('❌ خطأ في البذر:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
