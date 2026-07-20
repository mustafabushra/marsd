import { Injectable } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '@/prisma/prisma.service'
import { TrustScoreService } from '../trust-score/trust-score.service'

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private trustScore: TrustScoreService,
  ) {}

  /**
   * رفع تقرير تعامل جديد
   */
  async createReport(
    reporterTenantId: string,
    targetCompanyId: string,
    data: {
      dealAmountRange: string
      paymentCommitment: string
      delayDays: number
      defaulted: boolean
      dealtAt: Date
    },
  ) {
    // تحقق من عدم إرسال تقرير حديث جداً عن نفس الشركة (BR-05)
    const recentReport = await this.prisma.report.findFirst({
      where: {
        reporterTenantId,
        targetCompanyId,
        submittedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 يوماً
        },
      },
    })

    if (recentReport) {
      throw new Error('لا يمكن إرسال تقرير عن نفس الشركة قبل 90 يوم من التقرير السابق')
    }

    const report = await this.prisma.report.create({
      data: {
        id: uuid(),
        reporterTenantId,
        targetCompanyId,
        status: 'pending_review',
        dealAmountRange: data.dealAmountRange,
        paymentCommitment: data.paymentCommitment,
        delayDays: data.delayDays,
        defaulted: data.defaulted,
        dealtAt: data.dealtAt,
        submittedAt: new Date(),
      },
    })

    // سجل الأديت
    await this.logAudit({
      action: 'report:submit',
      entity: 'report',
      entityId: report.id,
      meta: { reporterTenantId, targetCompanyId },
    })

    return report
  }

  /**
   * الموافقة على تقرير وإعادة حساب المؤشر
   */
  async approveReport(reportId: string, reviewerId: string) {
    // جلب التقرير
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      throw new Error('تقرير غير موجود')
    }

    // تحديث حالة التقرير
    const updatedReport = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
    })

    // تسجيل قرار المراجعة
    await this.prisma.reviewAction.create({
      data: {
        id: uuid(),
        reportId,
        reviewerId,
        action: 'approve',
      },
    })

    // إعادة حساب مؤشر الشركة
    await this.trustScore.computeTrustScore(report.targetCompanyId)

    // سجل الأديت
    await this.logAudit({
      action: 'report:approve',
      entity: 'report',
      entityId: reportId,
      meta: { reviewerId, targetCompanyId: report.targetCompanyId },
    })

    // إرسال إشعارات (مستقبلياً: البريد، In-App)
    await this.notifyReportApproved(report.targetCompanyId)

    return updatedReport
  }

  /**
   * رفض تقرير
   */
  async rejectReport(
    reportId: string,
    reviewerId: string,
    reason: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      throw new Error('تقرير غير موجود')
    }

    const updatedReport = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
      },
    })

    await this.prisma.reviewAction.create({
      data: {
        id: uuid(),
        reportId,
        reviewerId,
        action: 'reject',
        reason,
      },
    })

    // سجل الأديت
    await this.logAudit({
      action: 'report:reject',
      entity: 'report',
      entityId: reportId,
      meta: { reviewerId, reason },
    })

    return updatedReport
  }

  /**
   * طلب معلومات إضافية
   */
  async requestMoreInfo(
    reportId: string,
    reviewerId: string,
    reason: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      throw new Error('تقرير غير موجود')
    }

    const updatedReport = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'request_info',
      },
    })

    await this.prisma.reviewAction.create({
      data: {
        id: uuid(),
        reportId,
        reviewerId,
        action: 'request_info',
        reason,
      },
    })

    return updatedReport
  }

  /**
   * جلب التقارير المرسلة من شركة محددة
   */
  async getMyReports(tenantId: string) {
    return this.prisma.report.findMany({
      where: { reporterTenantId: tenantId },
      include: {
        targetCompany: true,
        reviewActions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * جلب طابور المراجعة
   */
  async getReviewQueue(page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const reports = await this.prisma.report.findMany({
      where: {
        status: { in: ['pending_review', 'request_info'] },
      },
      include: {
        reporterTenant: true,
        targetCompany: true,
        documents: true,
        reviewActions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { submittedAt: 'asc' },
      skip,
      take: limit,
    })

    const total = await this.prisma.report.count({
      where: {
        status: { in: ['pending_review', 'request_info'] },
      },
    })

    return {
      data: reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }
  }

  /**
   * رفع مستند داعم (S3 Presigned URL)
   */
  async uploadDocument(reportId: string, fileName: string, fileSize: number, mimeType: string) {
    // تحقق من التقرير
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      throw new Error('تقرير غير موجود')
    }

    // حفظ سجل المستند
    const document = await this.prisma.reportDocument.create({
      data: {
        id: uuid(),
        reportId,
        s3Key: `reports/${reportId}/${fileName}`,
        fileName,
        mimeType,
        fileSize,
      },
    })

    // إرجاع Presigned URL (مستقبلياً: توليد من AWS SDK)
    return {
      document,
      presignedUrl: `https://s3.example.com/presigned-url-for-${reportId}`,
    }
  }

  /**
   * إشعار بحول اعتماد التقرير (لقوائم المراقبة والمبلغين)
   */
  private async notifyReportApproved(companyId: string) {
    // جلب قائمات المراقبة
    const watchlistItems = await this.prisma.watchlistItem.findMany({
      where: { companyId },
      include: { tenant: { include: { users: true } } },
    })

    for (const item of watchlistItems) {
      for (const user of item.tenant.users) {
        // إنشاء إشعار In-App
        await this.prisma.notification.create({
          data: {
            id: uuid(),
            userId: user.id,
            type: 'report_approved',
            payload: {
              companyId,
              companyName: undefined, // سيُجلب من قاعدة البيانات
            },
          },
        })
      }
    }
  }

  private async logAudit(data: {
    action: string
    entity: string
    entityId: string
    meta?: any
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuid(),
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          meta: data.meta || {},
        },
      })
    } catch (error) {
      console.error('Audit log error:', error)
    }
  }
}
