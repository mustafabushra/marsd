import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { VerifyEmailDto, ResendVerificationCodeDto } from './dto/email-verification.dto'
import { RequestPasswordResetDto, ResetPasswordDto, ChangePasswordDto } from './dto/password-reset.dto'
import { LogoutDto } from './dto/logout.dto'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { Public } from './decorators/auth.decorator'
import { RequireRole } from './decorators/auth.decorator'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = this.getClientIp(req)
    const userAgent = req.get('user-agent')
    return this.authService.login(dto, ipAddress, userAgent)
  }

  @Public()
  @Post('refresh')
  async refresh(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '')
    if (!token) {
      throw new BadRequestException('توكن غير موجود')
    }
    return this.authService.refresh(token)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Body() dto?: LogoutDto) {
    const user = req.user as any
    const sessionId = req.headers['x-session-id'] as string
    return this.authService.logout(user.userId, sessionId, dto?.logoutAllDevices)
  }

  @Public()
  @Post('email/verify')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code)
  }

  @Public()
  @Post('email/resend-code')
  async resendVerificationCode(@Body() dto: ResendVerificationCodeDto) {
    return this.authService.resendVerificationCode(dto.email)
  }

  @Public()
  @Post('password/request-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email)
  }

  @Public()
  @Post('password/verify-token')
  async verifyResetToken(@Body() dto: { email: string; token: string }) {
    if (!dto.email || !dto.token) {
      throw new BadRequestException('البريد الإلكتروني والرمز مطلوبان')
    }
    return this.authService.verifyResetToken(dto.email, dto.token)
  }

  @Public()
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.token, dto.newPassword)
  }

  @UseGuards(JwtAuthGuard)
  @Post('password/change')
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const user = req.user as any
    return this.authService.changePassword(user.userId, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: Request) {
    const user = req.user as any
    return this.authService.getUserProfile(user.userId)
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate-session')
  async validateSession(@Headers('x-session-id') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('معرّف الجلسة مطلوب')
    }
    const isValid = await this.authService.validateSession(sessionId)
    return { valid: isValid }
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown'
    )
  }
}
