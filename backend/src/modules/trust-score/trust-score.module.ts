import { Module } from '@nestjs/common'
import { TrustScoreService } from './trust-score.service'
import { TrustScoreController } from './trust-score.controller'
import { PrismaModule } from '@/prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [TrustScoreService],
  controllers: [TrustScoreController],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
