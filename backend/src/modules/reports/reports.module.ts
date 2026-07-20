import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'
import { PrismaModule } from '@/prisma/prisma.module'
import { TrustScoreModule } from '../trust-score/trust-score.module'

@Module({
  imports: [PrismaModule, TrustScoreModule],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
