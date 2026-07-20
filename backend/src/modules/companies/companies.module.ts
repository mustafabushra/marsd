import { Module } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { CompaniesController } from './companies.controller'
import { PrismaModule } from '@/prisma/prisma.module'
import { TrustScoreModule } from '../trust-score/trust-score.module'

@Module({
  imports: [PrismaModule, TrustScoreModule],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
