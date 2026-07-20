import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common'
import { Request as ExpressRequest } from 'express'
import { ReportsService } from './reports.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string
    tenantId: string
    role: string
    email: string
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createReport(
    @Body()
    body: {
      targetCompanyId: string
      dealAmountRange: string
      paymentCommitment: string
      delayDays: number
      defaulted: boolean
      dealtAt: string
    },
    @Request() req: AuthRequest,
  ) {
    return this.reportsService.createReport(
      req.user.tenantId,
      body.targetCompanyId,
      {
        dealAmountRange: body.dealAmountRange,
        paymentCommitment: body.paymentCommitment,
        delayDays: body.delayDays,
        defaulted: body.defaulted,
        dealtAt: new Date(body.dealtAt),
      },
    )
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async getMyReports(@Request() req: AuthRequest) {
    return this.reportsService.getMyReports(req.user.tenantId)
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  async approveReport(@Param('id') reportId: string, @Request() req: AuthRequest) {
    // تحقق من الدور (مراجع أو إدارة فقط)
    if (!['platform_admin', 'reviewer'].includes(req.user.role)) {
      throw new Error('غير مصرح')
    }
    return this.reportsService.approveReport(reportId, req.user.userId)
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectReport(
    @Param('id') reportId: string,
    @Body('reason') reason: string,
    @Request() req: AuthRequest,
  ) {
    if (!['platform_admin', 'reviewer'].includes(req.user.role)) {
      throw new Error('غير مصرح')
    }
    return this.reportsService.rejectReport(reportId, req.user.userId, reason)
  }

  @Post(':id/request-info')
  @UseGuards(JwtAuthGuard)
  async requestMoreInfo(
    @Param('id') reportId: string,
    @Body('reason') reason: string,
    @Request() req: AuthRequest,
  ) {
    if (!['platform_admin', 'reviewer'].includes(req.user.role)) {
      throw new Error('غير مصرح')
    }
    return this.reportsService.requestMoreInfo(reportId, req.user.userId, reason)
  }

  @Get('review-queue')
  @UseGuards(JwtAuthGuard)
  async getReviewQueue(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req: AuthRequest,
  ) {
    if (!['platform_admin', 'reviewer'].includes(req.user.role)) {
      throw new Error('غير مصرح')
    }
    return this.reportsService.getReviewQueue(page, limit)
  }

  @Post(':id/upload-document')
  @UseGuards(JwtAuthGuard)
  async uploadDocument(
    @Param('id') reportId: string,
    @Body()
    body: {
      fileName: string
      fileSize: number
      mimeType: string
    },
    @Request() req: AuthRequest,
  ) {
    return this.reportsService.uploadDocument(
      reportId,
      body.fileName,
      body.fileSize,
      body.mimeType,
    )
  }
}

