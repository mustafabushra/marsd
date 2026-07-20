import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common'
import { Request as ExpressRequest } from 'express'
import { AdminService } from './admin.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string
    tenantId: string
    role: string
    email: string
  }
}

/**
 * Admin Panel Controller
 * Requires platform_admin role for all endpoints
 */
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // =========================================================================
  // REPORTS ENDPOINTS
  // =========================================================================

  /**
   * GET /admin/reports - Get pending reports for review
   */
  @Get('reports')
  @UseGuards(JwtAuthGuard)
  async getPendingReports(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getPendingReports(Number(page), Number(limit))
  }

  /**
   * GET /admin/reports/all - Get all reports (any status)
   */
  @Get('reports/all')
  @UseGuards(JwtAuthGuard)
  async getAllReports(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status: string = '',
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getAllReports(Number(page), Number(limit), status)
  }

  /**
   * PATCH /admin/reports/:id/approve - Approve a single report
   */
  @Patch('reports/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveReport(@Param('id') reportId: string, @Request() req: AuthRequest) {
    this.ensureAdmin(req)
    return this.adminService.approveReport(reportId, req.user.userId)
  }

  /**
   * POST /admin/reports/:id/reject - Reject a report
   */
  @Post('reports/:id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectReport(
    @Param('id') reportId: string,
    @Body('reason') reason: string,
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.rejectReport(reportId, req.user.userId, reason)
  }

  /**
   * POST /admin/reports/batch-approve - Approve multiple reports
   */
  @Post('reports/batch-approve')
  @UseGuards(JwtAuthGuard)
  async batchApproveReports(
    @Body('reportIds') reportIds: string[],
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.batchApproveReports(reportIds, req.user.userId)
  }

  // =========================================================================
  // COMPANIES ENDPOINTS
  // =========================================================================

  /**
   * GET /admin/companies - Get companies list
   */
  @Get('companies')
  @UseGuards(JwtAuthGuard)
  async getCompanies(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status: string = '',
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getCompanies(Number(page), Number(limit), status)
  }

  /**
   * POST /admin/companies/:id/approve - Approve a company
   */
  @Post('companies/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveCompany(@Param('id') companyId: string, @Request() req: AuthRequest) {
    this.ensureAdmin(req)
    return this.adminService.approveCompany(companyId, req.user.userId)
  }

  /**
   * POST /admin/companies/:id/reject - Reject a company
   */
  @Post('companies/:id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectCompany(
    @Param('id') companyId: string,
    @Body('reason') reason: string,
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.rejectCompany(companyId, req.user.userId, reason)
  }

  // =========================================================================
  // USERS ENDPOINTS
  // =========================================================================

  /**
   * GET /admin/users - Get users list
   */
  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('role') role: string = '',
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getUsers(Number(page), Number(limit), role)
  }

  /**
   * PATCH /admin/users/:id/status - Update user status
   */
  @Patch('users/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateUserStatus(
    @Param('id') userId: string,
    @Body('status') status: string,
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.updateUserStatus(userId, status, req.user.userId)
  }

  // =========================================================================
  // AUDIT LOGS ENDPOINTS
  // =========================================================================

  /**
   * GET /admin/audit-logs - Get audit logs
   */
  @Get('audit-logs')
  @UseGuards(JwtAuthGuard)
  async getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('action') action: string = '',
    @Query('entity') entity: string = '',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = '',
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getAuditLogs(Number(page), Number(limit), {
      action,
      entity,
      startDate,
      endDate,
    })
  }

  // =========================================================================
  // BUSINESS REQUESTS ENDPOINTS
  // =========================================================================

  /**
   * GET /admin/requests - Get business requests
   */
  @Get('requests')
  @UseGuards(JwtAuthGuard)
  async getBusinessRequests(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status: string = '',
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.getBusinessRequests(Number(page), Number(limit), status)
  }

  /**
   * POST /admin/requests/:id/approve - Approve a business request
   */
  @Post('requests/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveBusinessRequest(@Param('id') requestId: string, @Request() req: AuthRequest) {
    this.ensureAdmin(req)
    return this.adminService.approveBusinessRequest(requestId, req.user.userId)
  }

  /**
   * POST /admin/requests/:id/reject - Reject a business request
   */
  @Post('requests/:id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectBusinessRequest(
    @Param('id') requestId: string,
    @Body('reason') reason: string,
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.rejectBusinessRequest(requestId, req.user.userId, reason)
  }

  // =========================================================================
  // BULK IMPORT ENDPOINTS
  // =========================================================================

  /**
   * POST /admin/bulk-upload - Bulk import companies
   */
  @Post('bulk-upload')
  @UseGuards(JwtAuthGuard)
  async bulkImportCompanies(
    @Body('companies') companies: any[],
    @Request() req: AuthRequest
  ) {
    this.ensureAdmin(req)
    return this.adminService.bulkImportCompanies(companies, req.user.userId)
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private ensureAdmin(req: any) {
    if (!req.user || req.user.role !== 'platform_admin') {
      throw new ForbiddenException(
        'يجب أن تكون مسؤول المنصة للوصول إلى هذا المورد'
      )
    }
  }
}
