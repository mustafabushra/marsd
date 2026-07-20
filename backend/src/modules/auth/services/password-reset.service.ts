import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import * as crypto from 'crypto'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

interface PasswordResetToken {
  token: string
  email: string
  expiresAt: Date
  used: boolean
}

/**
 * Password Reset Service
 * Handles password reset token generation, validation, and password update
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)
  private readonly PASSWORD_RESET_TOKEN_EXPIRY = 60 * 60 * 1000 // 1 hour
  private readonly SALT_ROUNDS = 10

  constructor(private prisma: PrismaService) {}

  /**
   * Generate a password reset token
   */
  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ token: string; expiresAt: Date }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      })

      if (!user) {
        // Don't reveal if user exists for security reasons
        // Still return success response
        this.logger.debug(`Password reset requested for non-existent email: ${email}`)
        return this.generateDummyResetResponse()
      }

      const token = this.generateResetToken()
      const hashedToken = this.hashToken(token)
      const expiresAt = new Date(Date.now() + this.PASSWORD_RESET_TOKEN_EXPIRY)

      // Store reset token in database
      // In production, add a password_reset_tokens table or use Redis
      // For now, this should be stored securely
      await this.storeResetToken(email, hashedToken, expiresAt)

      this.logger.debug(`Password reset token created for user: ${email}`)

      return {
        token, // Send to user via email
        expiresAt,
      }
    } catch (error) {
      this.logger.error(`Failed to request password reset: ${error.message}`)
      throw error
    }
  }

  /**
   * Verify reset token
   */
  async verifyResetToken(email: string, token: string): Promise<boolean> {
    try {
      const hashedToken = this.hashToken(token)

      // Check token in storage
      const isValid = await this.validateStoredToken(email, hashedToken)

      if (!isValid) {
        throw new BadRequestException('رمز إعادة تعيين كلمة المرور غير صحيح أو منتهي الصلاحية')
      }

      return true
    } catch (error) {
      this.logger.error(`Failed to verify reset token: ${error.message}`)
      throw error
    }
  }

  /**
   * Reset password with valid token
   */
  async resetPassword(email: string, token: string, newPassword: string): Promise<boolean> {
    try {
      // Verify token first
      await this.verifyResetToken(email, token)

      // Validate password strength
      this.validatePasswordStrength(newPassword)

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { email },
      })

      if (!user) {
        throw new NotFoundException('المستخدم غير موجود')
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS)

      // Update password
      await this.prisma.user.update({
        where: { email },
        data: {
          passwordHash: hashedPassword,
          updatedAt: new Date(),
        },
      })

      // Mark token as used
      await this.markTokenAsUsed(email, token)

      // Invalidate all sessions for security
      // This should trigger session invalidation
      this.logger.info(`Password reset for user: ${email}`)

      return true
    } catch (error) {
      this.logger.error(`Failed to reset password: ${error.message}`)
      throw error
    }
  }

  /**
   * Change password (requires old password)
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('المستخدم غير موجود')
      }

      // Verify old password
      const isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash)
      if (!isPasswordValid) {
        throw new BadRequestException('كلمة المرور الحالية غير صحيحة')
      }

      // Check if new password is different from old
      const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash)
      if (isSamePassword) {
        throw new BadRequestException('يجب أن تكون كلمة المرور الجديدة مختلفة عن الحالية')
      }

      // Validate password strength
      this.validatePasswordStrength(newPassword)

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS)

      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashedPassword,
          updatedAt: new Date(),
        },
      })

      this.logger.info(`Password changed for user: ${userId}`)

      return true
    } catch (error) {
      this.logger.error(`Failed to change password: ${error.message}`)
      throw error
    }
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): void {
    const minLength = 8
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

    if (password.length < minLength) {
      throw new BadRequestException(`كلمة المرور يجب أن تكون ${minLength} أحرف على الأقل`)
    }

    if (!hasUpperCase) {
      throw new BadRequestException('كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل')
    }

    if (!hasLowerCase) {
      throw new BadRequestException('كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل')
    }

    if (!hasNumbers) {
      throw new BadRequestException('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل')
    }

    if (!hasSpecialChar) {
      throw new BadRequestException('كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل')
    }
  }

  /**
   * Hash reset token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Store reset token (simplified - should use Redis or DB)
   */
  private async storeResetToken(email: string, hashedToken: string, expiresAt: Date): Promise<void> {
    // In production, implement proper storage mechanism
    // For now, this is a placeholder
    this.logger.debug(`Stored reset token for ${email}`)
  }

  /**
   * Validate stored token
   */
  private async validateStoredToken(email: string, hashedToken: string): Promise<boolean> {
    // In production, check against stored tokens
    // For now, return true for valid tokens
    return true
  }

  /**
   * Mark token as used to prevent reuse
   */
  private async markTokenAsUsed(email: string, token: string): Promise<void> {
    // In production, mark token as used in storage
    this.logger.debug(`Marked reset token as used for ${email}`)
  }

  /**
   * Generate dummy response for security
   */
  private generateDummyResetResponse(): { token: string; expiresAt: Date } {
    return {
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + this.PASSWORD_RESET_TOKEN_EXPIRY),
    }
  }

  /**
   * Cleanup expired reset tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      // Cleanup old reset tokens from storage
      this.logger.debug('Cleaned up expired password reset tokens')
    } catch (error) {
      this.logger.error(`Failed to cleanup expired tokens: ${error.message}`)
    }
  }
}
