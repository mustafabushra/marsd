import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '@/prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { SessionService } from './services/session.service'
import { EmailVerificationService } from './services/email-verification.service'
import { PasswordResetService } from './services/password-reset.service'
import { ChangePasswordDto } from './dto/password-reset.dto'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sessionService: SessionService,
    private emailVerificationService: EmailVerificationService,
    private passwordResetService: PasswordResetService,
  ) {}

  async register(dto: RegisterDto) {
    // تحقق من عدم وجود شركة بنفس السجل التجاري
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { crNumber: dto.crNumber },
    })
    if (existingTenant) {
      throw new BadRequestException('شركة بهذا السجل التجاري موجودة بالفعل')
    }

    // تحقق من عدم وجود مستخدم بنفس البريد
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })
    if (existingUser) {
      throw new BadRequestException('بريد إلكتروني مسجل بالفعل')
    }

    // إنشاء Tenant جديد
    const tenant = await this.prisma.tenant.create({
      data: {
        id: uuid(),
        name: dto.name,
        crNumber: dto.crNumber,
        email: dto.email,
        phone: dto.phone,
        city: dto.city,
        sector: dto.sector,
        status: 'active',
      },
    })

    // إنشاء مستخدم مدير الشركة
    const hashedPassword = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        id: uuid(),
        tenantId: tenant.id,
        email: dto.email,
        passwordHash: hashedPassword,
        firstName: dto.name,
        role: 'company_admin',
        status: 'pending_email_verification',
      },
    })

    // إنشاء اشتراك مجاني افتراضي
    const freePlan = await this.prisma.plan.findFirst({
      where: { name: 'مجاني' },
    })

    if (freePlan) {
      const endOfMonth = new Date()
      endOfMonth.setMonth(endOfMonth.getMonth() + 1)

      await this.prisma.subscription.create({
        data: {
          id: uuid(),
          tenantId: tenant.id,
          planId: freePlan.id,
          currentPeriodEnd: endOfMonth,
        },
      })
    }

    // سجل العملية
    await this.logAudit({
      action: 'auth:register',
      entity: 'tenant',
      entityId: tenant.id,
      meta: { email: dto.email, crNumber: dto.crNumber },
    })

    return {
      message: 'تم إنشاء الحساب بنجاح',
      tenant,
      user,
    }
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: true },
    })

    if (!user) {
      throw new UnauthorizedException('بيانات المستخدم غير صحيحة')
    }

    if (user.status === 'inactive') {
      throw new UnauthorizedException('الحساب معطّل')
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedException('بيانات المستخدم غير صحيحة')
    }

    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      { expiresIn: '15m' },
    )

    const refreshToken = this.jwt.sign(
      { sub: user.id },
      { expiresIn: '7d' },
    )

    // Create session
    const sessionId = await this.sessionService.createSession({
      userId: user.id,
      tenantId: user.tenantId || '',
      email: user.email,
      role: user.role,
      ipAddress,
      userAgent,
    })

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    await this.logAudit({
      action: 'auth:login',
      entity: 'user',
      entityId: user.id,
      meta: { email: dto.email, sessionId, ipAddress },
    })

    return {
      accessToken,
      refreshToken,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        role: user.role,
        tenantId: user.tenantId,
        emailVerified: user.emailVerified,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      })

      if (!user) {
        throw new UnauthorizedException('مستخدم غير موجود')
      }

      const newAccessToken = this.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
        { expiresIn: '15m' },
      )

      return { accessToken: newAccessToken }
    } catch (error) {
      throw new UnauthorizedException('توكن غير صحيح')
    }
  }

  /**
   * Logout user
   */
  async logout(userId: string, sessionId?: string, logoutAllDevices: boolean = false) {
    try {
      if (logoutAllDevices) {
        // Invalidate all sessions
        const deletedCount = await this.sessionService.invalidateUserSessions(userId)
        this.logger.debug(`Logged out user from ${deletedCount} sessions`)
      } else if (sessionId) {
        // Invalidate specific session
        await this.sessionService.deleteSession(sessionId)
        this.logger.debug(`Logged out user from session: ${sessionId}`)
      }

      await this.logAudit({
        action: 'auth:logout',
        entity: 'user',
        entityId: userId,
        meta: { sessionId, logoutAllDevices },
      })

      return { message: 'تم تسجيل الخروج بنجاح' }
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Verify email with code
   */
  async verifyEmail(email: string, code: string) {
    try {
      const isVerified = await this.emailVerificationService.verifyEmailWithCode(email, code)

      if (isVerified) {
        await this.logAudit({
          action: 'auth:email_verified',
          entity: 'user',
          entityId: email,
          meta: { email },
        })

        return { message: 'تم التحقق من البريد الإلكتروني بنجاح' }
      }
    } catch (error) {
      this.logger.error(`Email verification failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Resend verification code
   */
  async resendVerificationCode(email: string) {
    try {
      const result = await this.emailVerificationService.resendVerificationCode(email)

      await this.logAudit({
        action: 'auth:resend_verification_code',
        entity: 'user',
        entityId: email,
        meta: { email },
      })

      return {
        message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
        expiresAt: result.expiresAt,
      }
    } catch (error) {
      this.logger.error(`Resend verification code failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string) {
    try {
      const result = await this.passwordResetService.requestPasswordReset(email)

      await this.logAudit({
        action: 'auth:request_password_reset',
        entity: 'user',
        entityId: email,
        meta: { email },
      })

      return {
        message: 'إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، ستتلقى رابط إعادة تعيين كلمة المرور',
      }
    } catch (error) {
      this.logger.error(`Password reset request failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Verify password reset token
   */
  async verifyResetToken(email: string, token: string) {
    try {
      const isValid = await this.passwordResetService.verifyResetToken(email, token)

      if (isValid) {
        return { valid: true, message: 'رمز إعادة التعيين صحيح' }
      }
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string, token: string, newPassword: string) {
    try {
      const isReset = await this.passwordResetService.resetPassword(email, token, newPassword)

      if (isReset) {
        // Invalidate all sessions for security
        const user = await this.prisma.user.findUnique({ where: { email } })
        if (user) {
          await this.sessionService.invalidateUserSessions(user.id)
        }

        await this.logAudit({
          action: 'auth:password_reset',
          entity: 'user',
          entityId: email,
          meta: { email },
        })

        return { message: 'تم إعادة تعيين كلمة المرور بنجاح' }
      }
    } catch (error) {
      this.logger.error(`Password reset failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Change password (requires authentication)
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    try {
      const isChanged = await this.passwordResetService.changePassword(
        userId,
        dto.oldPassword,
        dto.newPassword
      )

      if (isChanged) {
        // Invalidate all sessions for security
        await this.sessionService.invalidateUserSessions(userId)

        const user = await this.prisma.user.findUnique({ where: { id: userId } })

        await this.logAudit({
          action: 'auth:password_changed',
          entity: 'user',
          entityId: userId,
          meta: { email: user?.email },
        })

        return { message: 'تم تغيير كلمة المرور بنجاح' }
      }
    } catch (error) {
      this.logger.error(`Password change failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          emailVerified: true,
          lastLoginAt: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!user) {
        throw new UnauthorizedException('المستخدم غير موجود')
      }

      return user
    } catch (error) {
      this.logger.error(`Get user profile failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string) {
    try {
      return await this.sessionService.validateSession(sessionId)
    } catch (error) {
      this.logger.error(`Session validation failed: ${error.message}`)
      return false
    }
  }

  private async logAudit(data: {
    action: string
    entity: string
    entityId: string
    meta?: any
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuid(),
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          meta: data.meta || {},
        },
      })
    } catch (error) {
      // تسجيل الأخطاء في الـ Audit لا يجب أن يوقف الطلب
      this.logger.error('Audit log error:', error)
    }
  }
}
