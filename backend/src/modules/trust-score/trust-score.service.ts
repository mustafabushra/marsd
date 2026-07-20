import { Injectable } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '@/prisma/prisma.service'

/**
 * Trust Score Engine v1 — وفقاً للوثيقة (القسم 22)
 *
 * المعادلة:
 * TrustScore = clamp(
 *   (0.30 × S_official) + (0.70 × S_community),
 *   0,
 *   100
 * )
 */
@Injectable()
export class TrustScoreService {
  // الأوزان من الوثيقة
  private readonly W_OFFICIAL = 0.30
  private readonly W_COMMUNITY = 0.70
  private readonly MIN_REPORTS_FOR_TRUSTED = 5
  private readonly RECENCY_HALF_LIFE_MONTHS = 12
  private readonly PER_REPORT_CAP = 0.15 // 15%

  constructor(private prisma: PrismaService) {}

  /**
   * حساب مؤشر الثقة لشركة محددة
   */
  async computeTrustScore(companyId: string) {
    try {
      // جلب الشركة
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      })

      if (!company) {
        throw new Error('شركة غير موجودة')
      }

      // جلب التقارير المعتمدة فقط
      const approvedReports = await this.prisma.report.findMany({
        where: {
          targetCompanyId: companyId,
          status: 'approved',
        },
      })

      // حساب S_official
      const s_official = this.computeOfficialScore(company)

      // حساب S_community
      const s_community = this.computeCommunityScore(approvedReports)

      // عدد التقارير
      const reportCount = approvedReports.length

      // تحديد Tier
      let tier = 'none'
      if (reportCount >= this.MIN_REPORTS_FOR_TRUSTED) {
        tier = 'full'
      } else if (reportCount >= 2) {
        tier = 'preliminary'
      }

      // حساب النقاط النهائية
      const score = this.clamp(
        this.W_OFFICIAL * s_official + this.W_COMMUNITY * s_community,
        0,
        100,
      )

      // تحديد فئة المخاطر
      const riskBand = this.getRiskBand(score)

      // التفصيل
      const breakdown = {
        official_score: s_official,
        community_score: s_community,
        official_weight: this.W_OFFICIAL,
        community_weight: this.W_COMMUNITY,
        approved_reports_count: reportCount,
        tier,
        computed_at: new Date(),
      }

      // حفظ أو تحديث المؤشر
      const existingScore = await this.prisma.trustScore.findUnique({
        where: { companyId },
      })

      if (existingScore) {
        await this.prisma.trustScore.update({
          where: { companyId },
          data: {
            score: Math.round(score),
            riskBand,
            tier,
            approvedReports: reportCount,
            breakdown,
            computedAt: new Date(),
          },
        })
      } else {
        await this.prisma.trustScore.create({
          data: {
            id: uuid(),
            companyId,
            score: Math.round(score),
            riskBand,
            tier,
            approvedReports: reportCount,
            breakdown,
          },
        })
      }

      return {
        companyId,
        score: Math.round(score),
        riskBand,
        tier,
        breakdown,
      }
    } catch (error) {
      console.error(`خطأ في حساب المؤشر للشركة ${companyId}:`, error)
      throw error
    }
  }

  /**
   * حساب S_official: البيانات الرسمية (30% من الوزن الكلي)
   * = (50% × نشاط_السجل) + (30% × عمر_الشركة) + (20% × اكتمال_البيانات)
   */
  private computeOfficialScore(company: any): number {
    let score = 0

    // 50% — نشاط السجل
    const crStatus = company.crStatus?.toLowerCase() || 'active'
    const crScore = crStatus === 'active' ? 100 : 0
    score += 0.5 * crScore

    // 30% — عمر الشركة (منذ سنة التأسيس)
    let ageScore = 0
    if (company.foundedYear) {
      const age = new Date().getFullYear() - company.foundedYear
      if (age >= 10) ageScore = 100
      else if (age >= 5) ageScore = 80
      else if (age >= 3) ageScore = 60
      else if (age >= 1) ageScore = 40
      else ageScore = 0
    }
    score += 0.3 * ageScore

    // 20% — اكتمال البيانات (إذا كانت كل الحقول الضرورية موجودة)
    const completenessScore = this.isDataComplete(company) ? 100 : 50
    score += 0.2 * completenessScore

    return this.clamp(score, 0, 100)
  }

  /**
   * حساب S_community: تقارير المجتمع (70% من الوزن الكلي)
   *
   * لكل تقرير i:
   *   score_i = النقاط حسب الالتزام
   *   weight_i = ترجيح زمني (0.5^(عمر/12)) مع سقف 15%
   *
   * S_community = Σ(score_i × weight_i) / Σ(weight_i)
   */
  private computeCommunityScore(reports: any[]): number {
    if (reports.length === 0) {
      return 0
    }

    let weightedSum = 0
    let totalWeight = 0

    for (const report of reports) {
      // حساب النقاط بناءً على الالتزام والتأخير
      let score = 0
      if (report.defaulted) {
        score = 0 // تعثر = 0
      } else if (report.delayDays === 0) {
        score = 100 // التزام كامل
      } else if (report.delayDays <= 30) {
        score = 60 // تأخير 1-30
      } else if (report.delayDays <= 90) {
        score = 35 // تأخير 31-90
      } else {
        score = 10 // تأخير أكثر من 90
      }

      // حساب الترجيح الزمني (الجدة أهم من القِدم)
      const ageMonths = this.getMonthsBetween(new Date(report.submittedAt), new Date())
      const recency = Math.pow(0.5, ageMonths / this.RECENCY_HALF_LIFE_MONTHS)

      // تطبيق سقف التأثير (15% لكل تقرير)
      const weight = Math.min(recency, this.PER_REPORT_CAP)

      weightedSum += score * weight
      totalWeight += weight
    }

    if (totalWeight === 0) {
      return 0
    }

    return this.clamp(weightedSum / totalWeight, 0, 100)
  }

  /**
   * تحديد فئة المخاطر بناءً على النقاط
   */
  private getRiskBand(score: number): string {
    if (score >= 70) return 'low'
    if (score >= 40) return 'medium'
    return 'high'
  }

  /**
   * فحص اكتمال البيانات الرسمية
   */
  private isDataComplete(company: any): boolean {
    return !!(
      company.name &&
      company.crNumber &&
      company.sector &&
      company.city &&
      company.foundedYear
    )
  }

  /**
   * حساب الفرق بالأشهر بين تاريخين
   */
  private getMonthsBetween(date1: Date, date2: Date): number {
    return (
      (date2.getFullYear() - date1.getFullYear()) * 12 +
      (date2.getMonth() - date1.getMonth())
    )
  }

  /**
   * حد أدنى وأقصى القيمة
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  /**
   * جلب مؤشر الثقة لشركة
   */
  async getTrustScore(companyId: string) {
    const score = await this.prisma.trustScore.findUnique({
      where: { companyId },
    })

    if (!score) {
      // إذا لم يوجد، احسبه
      return this.computeTrustScore(companyId)
    }

    return score
  }
}
