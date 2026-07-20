import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { BullModule } from '@nestjs/bull'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { ReportsModule } from './modules/reports/reports.module'
import { TrustScoreModule } from './modules/trust-score/trust-score.module'
import { AdminModule } from './modules/admin/admin.module'
import { EmailModule } from './modules/email/email.module'
import { NotificationModule } from './modules/notifications/notification.module'
import { WebSocketModule } from './websocket/websocket.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
    AuthModule,
    CompaniesModule,
    ReportsModule,
    TrustScoreModule,
    AdminModule,
    EmailModule,
    NotificationModule,
    WebSocketModule,
  ],
})
export class AppModule {}
