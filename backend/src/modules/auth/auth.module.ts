import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { SessionService } from './services/session.service'
import { EmailVerificationService } from './services/email-verification.service'
import { PasswordResetService } from './services/password-reset.service'
import { PrismaModule } from '@/prisma/prisma.module'

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    SessionService,
    EmailVerificationService,
    PasswordResetService,
  ],
  controllers: [AuthController],
  exports: [AuthService, SessionService, EmailVerificationService, PasswordResetService],
})
export class AuthModule {}
