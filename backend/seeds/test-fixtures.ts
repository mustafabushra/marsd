/**
 * Test Fixtures for Marsad Backend
 * =================================
 * Pre-built test data for automated testing scenarios
 *
 * Usage:
 *   import { testFixtures } from './test-fixtures'
 *   const data = testFixtures.getCompanyData()
 */

import { v4 as uuid } from 'uuid'
import * as bcrypt from 'bcryptjs'

export const testFixtures = {
  /**
   * Company Test Data
   */
  getCompanyData: () => ({
    valid: [
      {
        name: 'شركة الاختبار الأول',
        crNumber: '1111111111',
        sector: 'مقاولات',
        city: 'الرياض',
        foundedYear: 2015,
        crStatus: 'active',
        source: 'community',
        approved: true,
      },
      {
        name: 'شركة الاختبار الثاني',
        crNumber: '2222222222',
        sector: 'تجارة عامة',
        city: 'جدة',
        foundedYear: 2020,
        crStatus: 'active',
        source: 'official',
        approved: true,
      },
    ],
    invalid: [
      {
        name: '',
        crNumber: '1111111111',
        sector: 'مقاولات',
        city: 'الرياض',
      },
      {
        name: 'شركة',
        crNumber: '',
        sector: 'مقاولات',
        city: 'الرياض',
      },
    ],
  }),

  /**
   * User Test Data
   */
  getUserData: () => ({
    admin: {
      email: 'test.admin@marsad.sa',
      firstName: 'اختبار',
      lastName: 'مسؤول',
      role: 'platform_admin',
      passwordHash: bcrypt.hashSync('Test@123456', 10),
    },
    company_admin: {
      email: 'test.company.admin@company.sa',
      firstName: 'مسؤول',
      lastName: 'الشركة',
      role: 'company_admin',
      passwordHash: bcrypt.hashSync('Test@123456', 10),
    },
    company_member: {
      email: 'test.member@company.sa',
      firstName: 'موظف',
      lastName: 'الشركة',
      role: 'company_member',
      passwordHash: bcrypt.hashSync('Test@123456', 10),
    },
    reviewer: {
      email: 'test.reviewer@marsad.sa',
      firstName: 'مراجع',
      lastName: 'الاختبار',
      role: 'reviewer',
      passwordHash: bcrypt.hashSync('Test@123456', 10),
    },
  }),

  /**
   * Report Test Data
   */
  getReportData: () => ({
    valid: [
      {
        dealAmountRange: '50k-100k',
        paymentCommitment: 'full',
        delayDays: 0,
        defaulted: false,
        status: 'draft',
      },
      {
        dealAmountRange: '100k-500k',
        paymentCommitment: 'partial',
        delayDays: 30,
        defaulted: false,
        status: 'draft',
      },
      {
        dealAmountRange: '500k+',
        paymentCommitment: 'late',
        delayDays: 90,
        defaulted: true,
        status: 'draft',
      },
    ],
    invalid: [
      {
        dealAmountRange: 'invalid_range',
        paymentCommitment: 'full',
        delayDays: 0,
      },
      {
        dealAmountRange: '50k-100k',
        paymentCommitment: 'invalid_status',
        delayDays: 0,
      },
    ],
  }),

  /**
   * Subscription Test Data
   */
  getSubscriptionData: () => ({
    basic: {
      planId: 'plan-basic',
      status: 'active',
    },
    pro: {
      planId: 'plan-pro',
      status: 'active',
    },
    enterprise: {
      planId: 'plan-enterprise',
      status: 'active',
    },
    cancelled: {
      planId: 'plan-basic',
      status: 'cancelled',
    },
  }),

  /**
   * Tenant Test Data
   */
  getTenantData: () => ({
    valid: [
      {
        name: 'شركة الاختبار للخدمات',
        crNumber: uuid().replace(/-/g, '').substring(0, 10),
        email: `test-${uuid()}@company.sa`,
        phone: '+966501234567',
        city: 'الرياض',
        sector: 'استشارات',
        status: 'active',
      },
    ],
  }),

  /**
   * Trust Score Test Data
   */
  getTrustScoreData: () => ({
    low_risk: {
      score: 85,
      riskBand: 'low',
      tier: 'full',
      approvedReports: 10,
      breakdown: {
        official: 90,
        community: 80,
        formal_data_weight: 0.3,
        payment_history_weight: 0.4,
        legal_status_weight: 0.3,
      },
    },
    medium_risk: {
      score: 60,
      riskBand: 'medium',
      tier: 'preliminary',
      approvedReports: 5,
      breakdown: {
        official: 65,
        community: 55,
        formal_data_weight: 0.3,
        payment_history_weight: 0.4,
        legal_status_weight: 0.3,
      },
    },
    high_risk: {
      score: 30,
      riskBand: 'high',
      tier: 'none',
      approvedReports: 2,
      breakdown: {
        official: 25,
        community: 35,
        formal_data_weight: 0.3,
        payment_history_weight: 0.4,
        legal_status_weight: 0.3,
      },
    },
  }),

  /**
   * Audit Log Test Data
   */
  getAuditLogData: () => ({
    report_creation: {
      action: 'report:create',
      entity: 'report',
      meta: {
        reportId: uuid(),
        tenantId: uuid(),
        targetCompanyId: uuid(),
      },
    },
    report_approval: {
      action: 'report:approve',
      entity: 'report',
      meta: {
        reportId: uuid(),
        reviewerId: uuid(),
        reason: 'تم المراجعة والموافقة',
      },
    },
    user_login: {
      action: 'user:login',
      entity: 'user',
      meta: {
        userId: uuid(),
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      },
    },
    settings_change: {
      action: 'settings:change',
      entity: 'setting',
      meta: {
        setting: 'max_daily_reports',
        oldValue: 10,
        newValue: 20,
      },
    },
  }),

  /**
   * Notification Test Data
   */
  getNotificationData: () => ({
    report_approved: {
      type: 'report_approved',
      payload: {
        reportId: uuid(),
        companyId: uuid(),
        timestamp: new Date(),
      },
    },
    score_changed: {
      type: 'score_changed',
      payload: {
        companyId: uuid(),
        oldScore: 60,
        newScore: 75,
        timestamp: new Date(),
      },
    },
    watchlist_alert: {
      type: 'watchlist_alert',
      payload: {
        companyId: uuid(),
        alertType: 'report_filed',
        timestamp: new Date(),
      },
    },
  }),

  /**
   * Payment Data for Invoices
   */
  getInvoiceData: () => ({
    unpaid: {
      amount: 299,
      vat: 44.85,
      status: 'pending',
    },
    paid: {
      amount: 99,
      vat: 14.85,
      status: 'paid',
    },
    overdue: {
      amount: 999,
      vat: 149.85,
      status: 'pending',
    },
  }),

  /**
   * Query Test Data
   */
  getQueryData: () => ({
    search_terms: [
      'شركة',
      'مقاولات',
      'الرياض',
      'جدة',
    ],
    company_filters: [
      { sector: 'مقاولات' },
      { city: 'الرياض' },
      { riskBand: 'high' },
      { approved: true },
    ],
    pagination: {
      limit: 10,
      offset: 0,
    },
  }),

  /**
   * Error Test Data
   */
  getErrorScenarios: () => ({
    unauthorized: {
      code: 'UNAUTHORIZED',
      message: 'غير مصرح',
      statusCode: 401,
    },
    forbidden: {
      code: 'FORBIDDEN',
      message: 'ممنوع الوصول',
      statusCode: 403,
    },
    not_found: {
      code: 'NOT_FOUND',
      message: 'غير موجود',
      statusCode: 404,
    },
    validation_error: {
      code: 'VALIDATION_ERROR',
      message: 'خطأ في التحقق من البيانات',
      statusCode: 400,
    },
    rate_limit: {
      code: 'RATE_LIMITED',
      message: 'تم تجاوز حد الطلبات المسموح به',
      statusCode: 429,
    },
  }),

  /**
   * API Response Test Data
   */
  getResponseData: () => ({
    success: {
      success: true,
      data: { id: uuid() },
      message: 'تم بنجاح',
    },
    error: {
      success: false,
      error: 'something_went_wrong',
      message: 'حدث خطأ ما',
    },
    paginated: {
      success: true,
      data: [],
      pagination: {
        total: 100,
        limit: 10,
        offset: 0,
        hasMore: true,
      },
    },
  }),
}

export default testFixtures
