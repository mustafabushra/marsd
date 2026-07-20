import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { TrustScoreService } from './trust-score.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

@Controller('trust-score')
export class TrustScoreController {
  constructor(private trustScoreService: TrustScoreService) {}

  @Get(':companyId')
  @UseGuards(JwtAuthGuard)
  async getTrustScore(@Param('companyId') companyId: string) {
    return this.trustScoreService.getTrustScore(companyId)
  }
}
