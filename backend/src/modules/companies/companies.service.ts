import { Injectable } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '@/prisma/prisma.service'
import { TrustScoreService } from '../trust-score/trust-score.service'

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private trustScore: TrustScoreService,
  ) {}

  /**
   * البحث عن الشركات بالاسم/السجل/القطاع/المدينة
   */
  async search(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const companies = await this.prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { crNumber: { contains: query, mode: 'insensitive' } },
          { sector: { contains: query, mode: 'insensitive' } },
        ],
        approved: true,
      },
      include: {
        trustScore: true,
        _count: {
          select: { reports: { where: { status: 'approved' } } },
        },
      },
      skip,
      take: limit,
    })

    const total = await this.prisma.company.count({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { crNumber: { contains: query, mode: 'insensitive' } },
          { sector: { contains: query, mode: 'insensitive' } },
        ],
        approved: true,
      },
    })

    return {
      data: companies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * عرض تقرير الشركة (مع Gating حسب الباقة)
   */
  async getCompanyReport(companyId: string, tenantId: string) {
    // جلب الشركة
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { trustScore: true },
    })

    if (!company) {
      throw new Error('شركة غير موجودة')
    }

    // جلب الاشتراك والباقة
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    })

    // جلب استهلاك الحد الشهري للاطلاع
    const currentMonth = new Date().toISOString().substring(0, 7) // YYYY-MM
    const usage = await this.prisma.viewQuotaUsage.findUnique({
      where: { tenantId_period: { tenantId, period: currentMonth } },
    })

    // الحدود من البيانات المخزنة
    const limits = subscription?.plan?.limits as any || {}
    const maxViews = limits.views || 0
    const currentViews = usage?.viewsCount || 0

    // فحص الحد
    if (maxViews > 0 && currentViews >= maxViews) {
      return {
        status: 'quota_exceeded',
        message: 'تم تجاوز حد البحث الشهري',
        remaining: 0,
      }
    }

    // زيادة العداد
    if (maxViews > 0) {
      await this.prisma.viewQuotaUsage.upsert({
        where: { tenantId_period: { tenantId, period: currentMonth } },
        update: { viewsCount: { increment: 1 } },
        create: {
          id: uuid(),
          tenantId,
          period: currentMonth,
          viewsCount: 1,
        },
      })
    }

    // تحديد حالة العرض
    const tier = company.trustScore?.tier || 'none'
    const reportCount = await this.prisma.report.count({
      where: {
        targetCompanyId: companyId,
        status: 'approved',
      },
    })

    // إذا كانت الباقة مجانية: إخفاء المؤشر
    if (subscription?.plan?.name === 'مجاني') {
      return {
        company: {
          id: company.id,
          name: company.name,
          crNumber: company.crNumber,
          sector: company.sector,
          city: company.city,
          crStatus: company.crStatus,
        },
        status: 'locked',
        message: 'المؤشر مقفل في الباقة المجانية',
        tier: 'none',
      }
    }

    // إذا كانت البيانات غير كافية
    if (reportCount === 0) {
      return {
        company,
        status: 'insufficient_data',
        message: 'لا توجد بيانات معتمدة كافية لإصدار مؤشر ثقة موثوق',
        tier: 'none',
      }
    }

    if (reportCount < 5) {
      return {
        company,
        trustScore: company.trustScore,
        status: 'preliminary',
        message: 'تقييم أولي بناءً على عدد محدود من التقارير',
        tier: 'preliminary',
        approvedReports: reportCount,
      }
    }

    // تقييم موثوق كامل
    return {
      company,
      trustScore: company.trustScore,
      status: 'full',
      tier: 'full',
      approvedReports: reportCount,
    }
  }

  /**
   * طلب إضافة شركة جديدة
   */
  async requestAddCompany(
    name: string,
    crNumber: string,
    sector: string,
    city: string,
  ) {
    const existing = await this.prisma.company.findUnique({
      where: { crNumber },
    })

    if (existing) {
      throw new Error('شركة بهذا السجل التجاري موجودة بالفعل')
    }

    const company = await this.prisma.company.create({
      data: {
        id: uuid(),
        name,
        crNumber,
        sector,
        city,
        source: 'community',
        approved: false, // تحت المراجعة
      },
    })

    return company
  }

  /**
   * جلب شركة بالرقم التجاري (للـ Claim)
   */
  async getCompanyByCrNumber(crNumber: string) {
    return this.prisma.company.findUnique({
      where: { crNumber },
    })
  }

  /**
   * Claim ملف الشركة (ربط Tenant بشركة موجودة)
   */
  async claimCompanyProfile(tenantId: string, companyId: string) {
    // تحقق من عدم وجود claim آخر
    const existing = await this.prisma.companyProfile.findUnique({
      where: { tenantId },
    })

    if (existing) {
      throw new Error('الشركة لديها ملف مرتبط بالفعل')
    }

    const profile = await this.prisma.companyProfile.create({
      data: {
        id: uuid(),
        tenantId,
        companyId,
      },
    })

    return profile
  }
}
