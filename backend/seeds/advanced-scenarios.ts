/**
 * Advanced Test Scenarios
 * =======================
 * Complex scenarios for integration testing and edge cases
 */

import { PrismaClient, Decimal } from '@prisma/client'
import { v4 as uuid } from 'uuid'
import * as bcrypt from 'bcryptjs'
import { SeedUtils } from './seed-utils'

const prisma = new PrismaClient()

/**
 * Scenario 1: Complete Report Workflow
 * Tests full lifecycle of a report from draft to approval
 */
export async function scenarioCompleteReportWorkflow() {
  console.log('📋 Scenario: Complete Report Workflow')

  try {
    // Get or create test data
    const tenant = await prisma.tenant.findFirst()
    const company = await prisma.company.findFirst()
    const reviewer = await prisma.user.findFirst({ where: { role: 'reviewer' } })

    if (!tenant || !company || !reviewer) {
      throw new Error('Missing required test data')
    }

    // Create report in draft status
    const report = await prisma.report.create({
      data: {
        id: `report-workflow-${uuid()}`,
        reporterTenantId: tenant.id,
        targetCompanyId: company.id,
        status: 'draft',
        dealAmountRange: '100k-500k',
        paymentCommitment: 'partial',
        delayDays: 45,
        defaulted: false,
        dealtAt: new Date('2024-06-01'),
      },
    })

    // Submit for review
    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: 'pending_review',
        submittedAt: new Date(),
      },
    })

    // Add review comment
    const reviewAction = await prisma.reviewAction.create({
      data: {
        id: `review-${uuid()}`,
        reportId: report.id,
        reviewerId: reviewer.id,
        action: 'approve',
      },
    })

    // Approve report
    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
    })

    console.log('  ✓ Report workflow completed')
    return { report, reviewAction }
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 2: Multi-Tenant Trust Score Calculation
 * Tests how trust scores aggregate across multiple tenants
 */
export async function scenarioMultiTenantTrustScore() {
  console.log('📊 Scenario: Multi-Tenant Trust Score Calculation')

  try {
    const targetCompany = await prisma.company.findFirst()
    if (!targetCompany) throw new Error('Missing target company')

    // Get all approved reports for this company
    const approvedReports = await prisma.report.findMany({
      where: {
        targetCompanyId: targetCompany.id,
        status: 'approved',
      },
    })

    // Recalculate trust score
    const { score, riskBand, tier } = SeedUtils.calculateTrustScore(
      approvedReports.length,
    )

    const trustScore = await prisma.trustScore.update({
      where: { companyId: targetCompany.id },
      data: {
        score,
        riskBand,
        tier,
        approvedReports: approvedReports.length,
      },
    })

    console.log(`  ✓ Trust score updated: ${score} (${riskBand})`)
    return trustScore
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 3: Quota Usage Tracking
 * Tests monthly view quota tracking and limits
 */
export async function scenarioQuotaUsageTracking() {
  console.log('📈 Scenario: Quota Usage Tracking')

  try {
    const tenant = await prisma.tenant.findFirst()
    if (!tenant) throw new Error('Missing tenant')

    const currentMonth = new Date().toISOString().substring(0, 7) // YYYY-MM

    // Get or create quota usage record
    const quotaUsage = await prisma.viewQuotaUsage.upsert({
      where: { tenantId_period: { tenantId: tenant.id, period: currentMonth } },
      update: {
        viewsCount: {
          increment: 10,
        },
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        period: currentMonth,
        viewsCount: 10,
      },
    })

    // Get tenant's plan limits
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      include: { plan: true },
    })

    const planLimits = subscription?.plan.limits as any
    const remainingViews = (planLimits?.views || 0) - quotaUsage.viewsCount

    console.log(
      `  ✓ Quota: ${quotaUsage.viewsCount}/${planLimits?.views} (${remainingViews} remaining)`,
    )
    return { quotaUsage, remainingViews }
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 4: Subscription Renewal and Invoice
 * Tests subscription period and invoice generation
 */
export async function scenarioSubscriptionRenewal() {
  console.log('💳 Scenario: Subscription Renewal and Invoice')

  try {
    const subscription = await prisma.subscription.findFirst()
    if (!subscription) throw new Error('Missing subscription')

    const now = new Date()
    const nextPeriodStart = new Date(subscription.currentPeriodEnd)
    const nextPeriodEnd = new Date(nextPeriodStart)
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1)

    // Update subscription for new period
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
      },
    })

    // Get plan for invoice amount
    const plan = await prisma.plan.findUnique({
      where: { id: subscription.planId },
    })

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        id: `invoice-${uuid()}`,
        subscriptionId: subscription.id,
        amount: plan?.priceMonthly || new Decimal(0),
        vat: (plan?.priceMonthly || new Decimal(0)).mul('0.15'),
        status: 'pending',
        issuedAt: now,
        dueAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
      },
    })

    console.log(`  ✓ Subscription renewed, Invoice created: ${invoice.id}`)
    return { updatedSubscription, invoice }
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 5: Business Request Workflow
 * Tests B2B request creation and acceptance
 */
export async function scenarioBusinessRequestWorkflow() {
  console.log('💼 Scenario: Business Request Workflow')

  try {
    const tenants = await prisma.tenant.findMany({ take: 2 })
    if (tenants.length < 2) throw new Error('Need at least 2 tenants')

    const [fromTenant, toTenant] = tenants

    // Create business request
    const request = await prisma.businessRequest.create({
      data: {
        id: `breq-${uuid()}`,
        fromTenantId: fromTenant.id,
        toTenantId: toTenant.id,
        subject: 'اقتراح شراكة استراتيجية',
        body: 'نود تطوير علاقة تعاون طويلة الأجل معكم',
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // Accept request
    const acceptedRequest = await prisma.businessRequest.update({
      where: { id: request.id },
      data: { status: 'accepted' },
    })

    // Create audit log for this action
    const toTenantUser = await prisma.user.findFirst({
      where: { tenantId: toTenant.id },
    })

    if (toTenantUser) {
      await prisma.auditLog.create({
        data: {
          id: `audit-${uuid()}`,
          actorId: toTenantUser.id,
          actorRole: toTenantUser.role,
          action: 'request:accept',
          entity: 'business_request',
          entityId: request.id,
          meta: {
            fromTenant: fromTenant.name,
            toTenant: toTenant.name,
          },
        },
      })
    }

    console.log(`  ✓ Business request accepted: ${acceptedRequest.id}`)
    return acceptedRequest
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 6: Watchlist Monitoring
 * Tests watchlist creation and updates
 */
export async function scenarioWatchlistMonitoring() {
  console.log('👁️ Scenario: Watchlist Monitoring')

  try {
    const tenant = await prisma.tenant.findFirst()
    const companies = await prisma.company.findMany({ take: 3 })

    if (!tenant || companies.length === 0) {
      throw new Error('Missing required data')
    }

    const watchlistItems: any[] = []

    for (const company of companies) {
      const item = await prisma.watchlistItem.upsert({
        where: {
          tenantId_companyId: { tenantId: tenant.id, companyId: company.id },
        },
        update: {},
        create: {
          id: uuid(),
          tenantId: tenant.id,
          companyId: company.id,
          listName: 'الشركات الموثوقة',
        },
      })
      watchlistItems.push(item)

      // Create notification for new watchlist item
      const tenantUser = await prisma.user.findFirst({
        where: { tenantId: tenant.id },
      })

      if (tenantUser) {
        await prisma.notification.create({
          data: {
            id: uuid(),
            userId: tenantUser.id,
            type: 'watchlist_alert',
            payload: {
              companyId: company.id,
              companyName: company.name,
              action: 'added',
            },
          },
        })
      }
    }

    console.log(`  ✓ Watchlist items created: ${watchlistItems.length}`)
    return watchlistItems
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 7: Audit Trail Verification
 * Tests comprehensive audit logging
 */
export async function scenarioAuditTrailVerification() {
  console.log('📝 Scenario: Audit Trail Verification')

  try {
    const actor = await prisma.user.findFirst({ where: { role: 'platform_admin' } })
    if (!actor) throw new Error('Missing admin user')

    const actions = [
      'report:create',
      'report:approve',
      'settings:change',
      'user:login',
    ]

    const auditLogs: any[] = []

    for (const action of actions) {
      const log = await prisma.auditLog.create({
        data: {
          id: `audit-${uuid()}`,
          actorId: actor.id,
          actorRole: actor.role,
          action,
          entity: action.split(':')[0],
          entityId: uuid(),
          meta: {
            timestamp: new Date(),
            ip: SeedUtils.generateIP(),
            userAgent: 'Mozilla/5.0 (Test)',
            details: `${action} action performed`,
          },
        },
      })
      auditLogs.push(log)
    }

    // Verify audit logs are retrievable
    const retrievedLogs = await prisma.auditLog.findMany({
      where: { actorId: actor.id },
    })

    console.log(`  ✓ Audit logs created and verified: ${retrievedLogs.length}`)
    return auditLogs
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Scenario 8: Company Profile Claiming
 * Tests tenant claiming company profile
 */
export async function scenarioCompanyProfileClaim() {
  console.log('🏢 Scenario: Company Profile Claiming')

  try {
    const tenant = await prisma.tenant.findFirst()
    const unclamedCompany = await prisma.company.findFirst({
      where: {
        companyProfile: null,
      },
    })

    if (!tenant || !unclamedCompany) {
      throw new Error('Missing required data')
    }

    // Create company profile (claim)
    const profile = await prisma.companyProfile.create({
      data: {
        id: uuid(),
        tenantId: tenant.id,
        companyId: unclamedCompany.id,
      },
    })

    // Log the claim action
    const tenantUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id },
    })

    if (tenantUser) {
      await prisma.auditLog.create({
        data: {
          id: `audit-${uuid()}`,
          actorId: tenantUser.id,
          actorRole: tenantUser.role,
          action: 'company:claim',
          entity: 'company_profile',
          entityId: profile.id,
          meta: {
            companyId: unclamedCompany.id,
            companyName: unclamedCompany.name,
          },
        },
      })
    }

    console.log(`  ✓ Company profile claimed: ${profile.id}`)
    return profile
  } catch (error) {
    console.error('  ✗ Scenario failed:', error)
    throw error
  }
}

/**
 * Run all scenarios
 */
export async function runAllScenarios() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║              Advanced Test Scenarios                          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const results = []

  try {
    results.push(await scenarioCompleteReportWorkflow())
    results.push(await scenarioMultiTenantTrustScore())
    results.push(await scenarioQuotaUsageTracking())
    results.push(await scenarioSubscriptionRenewal())
    results.push(await scenarioBusinessRequestWorkflow())
    results.push(await scenarioWatchlistMonitoring())
    results.push(await scenarioAuditTrailVerification())
    results.push(await scenarioCompanyProfileClaim())

    console.log('\n✓ All scenarios completed successfully')
  } catch (error) {
    console.error('✗ Scenario execution failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }

  return results
}

export default {
  scenarioCompleteReportWorkflow,
  scenarioMultiTenantTrustScore,
  scenarioQuotaUsageTracking,
  scenarioSubscriptionRenewal,
  scenarioBusinessRequestWorkflow,
  scenarioWatchlistMonitoring,
  scenarioAuditTrailVerification,
  scenarioCompanyProfileClaim,
  runAllScenarios,
}
