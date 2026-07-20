import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { EmailService } from './email.service'
import { SendEmailDto, SendBulkEmailDto, TemplateEmailDto } from './dto/send-email.dto'

@Controller('api/email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name)

  constructor(private emailService: EmailService) {}

  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto): Promise<{ messageId: string; status: string }> {
    this.logger.debug(`Received email send request to ${dto.to}`)
    return this.emailService.sendEmail(dto)
  }

  @Post('send-bulk')
  async sendBulkEmail(
    @Body() dto: SendBulkEmailDto
  ): Promise<{ messageId: string; status: string }[]> {
    this.logger.debug(`Received bulk email send request to ${dto.recipients.length} recipients`)
    return this.emailService.sendBulkEmail(dto)
  }

  @Post('send-template')
  async sendTemplateEmail(@Body() dto: TemplateEmailDto): Promise<{ messageId: string; status: string }> {
    this.logger.debug(`Received template email send request to ${dto.to}`)
    return this.emailService.sendTemplateEmail(dto)
  }
}
