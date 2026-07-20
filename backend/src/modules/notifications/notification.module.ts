import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { NotificationService } from './notification.service'
import { NotificationController } from './notification.controller'
import { PrismaModule } from '@/prisma/prisma.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
