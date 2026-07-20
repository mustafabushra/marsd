import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common'
import { Request as ExpressRequest } from 'express'
import { CompaniesService } from './companies.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string
    tenantId: string
    role: string
    email: string
  }
}

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('q') q: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.companiesService.search(q, page, limit)
  }

  @Get(':id/report')
  @UseGuards(JwtAuthGuard)
  async getCompanyReport(@Param('id') companyId: string, @Request() req: AuthRequest) {
    const tenantId = req.user.tenantId
    return this.companiesService.getCompanyReport(companyId, tenantId)
  }

  @Post('request-add')
  @UseGuards(JwtAuthGuard)
  async requestAdd(
    @Body()
    body: {
      name: string
      crNumber: string
      sector: string
      city: string
    },
  ) {
    return this.companiesService.requestAddCompany(
      body.name,
      body.crNumber,
      body.sector,
      body.city,
    )
  }

  @Post('claim-profile/:companyId')
  @UseGuards(JwtAuthGuard)
  async claimProfile(@Param('companyId') companyId: string, @Request() req: AuthRequest) {
    const tenantId = req.user.tenantId
    return this.companiesService.claimCompanyProfile(tenantId, companyId)
  }
}

