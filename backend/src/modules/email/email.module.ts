import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bull'
import { EmailService } from './email.service'
import { EmailConfigService } from './email.config'
import { EmailController } from './email.controller'
import { EmailProcessor } from './jobs/email.processor'
import { PrismaModule } from '@/prisma/prisma.module'

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [EmailService, EmailConfigService, EmailProcessor],
  controllers: [EmailController],
  exports: [EmailService, EmailConfigService],
})
export class EmailModule {}
