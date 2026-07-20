import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

interface Report {
  [key: string]: any
}

interface Company {
  [key: string]: any
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // =========================================================================
  // REPORTS - Admin Panel
  // =========================================================================

  /**
   * Get all reports pending review
   */
  async getPendingReports(page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: {
          status: 'pending_review',
        },
        include: {
          reporterTenant: {
            select: {
              id: true,
              name: true,
              crNumber: true,
            },
          },
          targetCompany: {
            select: {
              id: true,
              name: true,
              sector: true,
              city: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.report.count({
        where: {
          status: 'pending_review',
        },
      }),
    ])

    return {
      data: reports.map((r: Report) => ({
        id: r.id,
        company: r.targetCompany.name,
        reporter: r.reporterTenant.name,
        reporterCompany: r.reporterTenant.crNumber,
        date: r.createdAt.toISOString().split('T')[0],
        value: this.formatAmount(r.dealAmountRange),
        severity: this.getSeverity(r.delayDays, r.defaulted),
        details: this.buildReportDetails(r),
        dealAmountRange: r.dealAmountRange,
        paymentCommitment: r.paymentCommitment,
        delayDays: r.delayDays,
        defaulted: r.defaulted,
        dealtAt: r.dealtAt,
        status: r.status,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Get all reports (any status)
   */
  async getAllReports(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: status ? { status } : {},
        include: {
          reporterTenant: {
            select: {
              id: true,
              name: true,
              crNumber: true,
            },
          },
          targetCompany: {
            select: {
              id: true,
              name: true,
              sector: true,
              city: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.report.count({
        where: status ? { status } : {},
      }),
    ])

    return {
      data: reports.map((r: Report) => ({
        id: r.id,
        company: r.targetCompany.name,
        reporter: r.reporterTenant.name,
        date: r.createdAt.toISOString().split('T')[0],
        value: this.formatAmount(r.dealAmountRange),
        severity: this.getSeverity(r.delayDays, r.defaulted),
        status: r.status,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Approve a single report
   */
  async approveReport(reportId: string, userId: string) {
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
    })

    // Log the action
    await this.logAction(userId, 'report:approve', 'report', reportId, {
      status: 'approved',
    })

    return report
  }

  /**
   * Reject a report
   */
  async rejectReport(reportId: string, userId: string, reason?: string) {
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
      },
    })

    // Log the action
    await this.logAction(userId, 'report:reject', 'report', reportId, {
      status: 'rejected',
      reason,
    })

    return report
  }

  /**
   * Batch approve reports
   */
  async batchApproveReports(reportIds: string[], userId: string) {
    const results = await Promise.all(
      reportIds.map(id => this.approveReport(id, userId))
    )

    return {
      approved: results.length,
      reports: results,
    }
  }

  // =========================================================================
  // COMPANIES - Admin Panel
  // =========================================================================

  /**
   * Get all companies (pending approval or active)
   */
  async getCompanies(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit

    const where: any = {}
    if (status === 'pending') {
      where.approved = false
    } else if (status === 'approved') {
      where.approved = true
    }

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: {
          trustScore: {
            select: {
              score: true,
              riskBand: true,
              approvedReports: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ])

    return {
      data: companies.map((c: Company) => ({
        id: c.id,
        name: c.name,
        crNumber: c.crNumber,
        sector: c.sector,
        city: c.city,
        foundedYear: c.foundedYear,
        score: c.trustScore?.score || 0,
        riskBand: c.trustScore?.riskBand || 'unknown',
        approvedReports: c.trustScore?.approvedReports || 0,
        status: c.approved ? 'نشطة' : 'قيد المراجعة',
        approved: c.approved,
        source: c.source,
        crStatus: c.crStatus,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Approve a company
   */
  async approveCompany(companyId: string, userId: string) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        approved: true,
      },
    })

    // Log the action
    await this.logAction(userId, 'company:approve', 'company', companyId, {
      approved: true,
    })

    return company
  }

  /**
   * Reject a company
   */
  async rejectCompany(companyId: string, userId: string, reason?: string) {
    // Store rejection in metadata or a separate table
    await this.logAction(userId, 'company:reject', 'company', companyId, {
      approved: false,
      reason,
    })

    return { id: companyId, approved: false, reason }
  }

  // =========================================================================
  // USERS - Admin Panel
  // =========================================================================

  /**
   * Get all users
   */
  async getUsers(page = 1, limit = 20, role?: string) {
    const skip = (page - 1) * limit

    const where: any = {}
    if (role) {
      where.role = role
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ])

    return {
      data: users.map((u: any) => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        email: u.email,
        subscription: this.mapRole(u.role),
        company: u.tenant?.name || 'إدارة المنصة',
        status: u.status === 'active' ? 'نشط' : 'غير نشط',
        active: u.status === 'active',
        role: u.role,
        emailVerified: u.emailVerified,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Activate/Deactivate user
   */
  async updateUserStatus(userId: string, status: string, updatedBy: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: status === 'active' ? 'active' : 'inactive',
      },
    })

    // Log the action
    await this.logAction(updatedBy, 'user:status-change', 'user', userId, {
      newStatus: user.status,
    })

    return user
  }

  // =========================================================================
  // AUDIT LOGS - Admin Panel
  // =========================================================================

  /**
   * Get audit logs
   */
  async getAuditLogs(page = 1, limit = 20, filters?: any) {
    const skip = (page - 1) * limit

    const where: any = {}
    if (filters?.action) {
      where.action = { contains: filters.action }
    }
    if (filters?.entity) {
      where.entity = filters.entity
    }
    if (filters?.startDate && filters?.endDate) {
      where.createdAt = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return {
      data: logs.map((log: any) => ({
        id: log.id,
        action: this.formatAction(log.action),
        user: log.user
          ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
          : 'نظام',
        timestamp: log.createdAt.toLocaleString('ar-SA'),
        status: 'نجاح',
        entity: log.entity,
        entityId: log.entityId,
        actorId: log.actorId,
        meta: log.meta,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  // =========================================================================
  // BUSINESS REQUESTS - Admin Panel
  // =========================================================================

  /**
   * Get all business requests
   */
  async getBusinessRequests(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit

    const where: any = {}
    if (status) {
      where.status = status
    }

    const [requests, total] = await Promise.all([
      this.prisma.businessRequest.findMany({
        where,
        include: {
          fromTenant: {
            select: {
              id: true,
              name: true,
              crNumber: true,
            },
          },
          toTenant: {
            select: {
              id: true,
              name: true,
              crNumber: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.businessRequest.count({ where }),
    ])

    return {
      data: requests.map((r: any) => ({
        id: r.id,
        name: r.toTenant.name,
        by: r.fromTenant.name,
        type:
          r.subject === 'new_company'
            ? 'جديدة'
            : r.subject === 'update_company'
              ? 'تعديل'
              : r.subject,
        date: r.createdAt.toISOString().split('T')[0],
        status: r.status,
        subject: r.subject,
        body: r.body,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Approve a business request
   */
  async approveBusinessRequest(
    requestId: string,
    userId: string
  ): Promise<any> {
    const request = await this.prisma.businessRequest.update({
      where: { id: requestId },
      data: {
        status: 'accepted',
      },
    })

    // Log the action
    await this.logAction(userId, 'request:approve', 'business_request', requestId, {
      status: 'accepted',
    })

    return request
  }

  /**
   * Reject a business request
   */
  async rejectBusinessRequest(
    requestId: string,
    userId: string,
    reason?: string
  ): Promise<any> {
    const request = await this.prisma.businessRequest.update({
      where: { id: requestId },
      data: {
        status: 'declined',
      },
    })

    // Log the action
    await this.logAction(userId, 'request:decline', 'business_request', requestId, {
      status: 'declined',
      reason,
    })

    return request
  }

  // =========================================================================
  // BULK IMPORT - Admin Panel
  // =========================================================================

  /**
   * Bulk import companies from file
   */
  async bulkImportCompanies(companies: any[], uploadedBy: string) {
    const results = await Promise.all(
      companies.map(async c => {
        try {
          const existing = await this.prisma.company.findUnique({
            where: { crNumber: c.crNumber },
          })

          if (existing) {
            return {
              crNumber: c.crNumber,
              status: 'duplicate',
              error: 'الشركة موجودة بالفعل',
            }
          }

          const company = await this.prisma.company.create({
            data: {
              name: c.name,
              crNumber: c.crNumber,
              sector: c.sector,
              city: c.city,
              foundedYear: c.foundedYear,
              source: 'bulk_import',
              approved: false,
            },
          })

          return {
            crNumber: c.crNumber,
            status: 'created',
            id: company.id,
          }
        } catch (error) {
          return {
            crNumber: c.crNumber,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )

    // Log the bulk import action
    await this.logAction(uploadedBy, 'companies:bulk-import', 'companies', 'bulk', {
      count: companies.length,
      results,
    })

    const successful = results.filter(r => r.status === 'created').length
    const failed = results.filter(r => r.status === 'error').length
    const duplicates = results.filter(r => r.status === 'duplicate').length

    return {
      total: companies.length,
      successful,
      failed,
      duplicates,
      results,
    }
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private formatAmount(range: string | null): string {
    if (!range) return 'N/A'
    const mapping: Record<string, string> = {
      '0-50k': '0 - 50,000 ر.س',
      '50k-100k': '50,000 - 100,000 ر.س',
      '100k-500k': '100,000 - 500,000 ر.س',
      '500k+': '+500,000 ر.س',
    }
    return mapping[range] || range
  }

  private getSeverity(delayDays: number, defaulted: boolean): string {
    if (defaulted) return 'عالي'
    if (delayDays > 30) return 'عالي'
    if (delayDays > 0) return 'متوسط'
    return 'منخفض'
  }

  private buildReportDetails(report: any): string {
    const commitment = report.paymentCommitment || 'غير محدد'
    const delay = report.delayDays > 0 ? `تأخر ${report.delayDays} يوم. ` : ''
    const defaulted = report.defaulted ? 'حالة تخلف عن السداد. ' : ''

    return `${delay}${defaulted}التزام الدفع: ${commitment}.`
  }

  private mapRole(role: string): string {
    const mapping: Record<string, string> = {
      company_admin: 'احترافي',
      company_member: 'أساسي',
      platform_admin: 'إدارة',
      reviewer: 'مراجع',
    }
    return mapping[role] || role
  }

  private formatAction(action: string): string {
    const mapping: Record<string, string> = {
      'report:approve': 'موافقة على تقرير',
      'report:reject': 'رفض تقرير',
      'company:approve': 'موافقة على شركة',
      'company:reject': 'رفض شركة',
      'user:status-change': 'تغيير حالة المستخدم',
      'companies:bulk-import': 'رفع دفعة شركات',
      'request:approve': 'قبول طلب',
      'request:decline': 'رفض طلب',
    }
    return mapping[action] || action
  }

  private async logAction(
    actorId: string,
    action: string,
    entity: string,
    entityId: string,
    meta: any
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          entity,
          entityId,
          meta,
        },
      })
    } catch (error) {
      console.error('Failed to log action:', error)
    }
  }
}
