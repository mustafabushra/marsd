import { Process, Processor, OnModuleInit } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { EmailService } from '../email.service'
import { SendEmailDto } from '../dto/send-email.dto'

export interface EmailJob {
  to: string
  subject: string
  template?: string
  templateData?: Record<string, any>
  html?: string
  text?: string
}

@Processor('email')
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name)

  constructor(private emailService: EmailService) {}

  onModuleInit(): void {
    this.logger.log('Email processor initialized')
  }

  @Process('send')
  async handleEmailJob(job: Job<EmailJob>): Promise<{ messageId: string; status: string }> {
    try {
      this.logger.debug(`Processing email job ${job.id} to ${job.data.to}`)

      const emailDto: SendEmailDto = {
        to: job.data.to,
        subject: job.data.subject,
        template: job.data.template,
        templateData: job.data.templateData,
        html: job.data.html,
        text: job.data.text,
      }

      const result = await this.emailService.sendEmail(emailDto)

      this.logger.log(`Email job ${job.id} completed successfully`)
      return result
    } catch (error) {
      this.logger.error(`Email job ${job.id} failed:`, error)
      throw error
    }
  }

  @Process('send-bulk')
  async handleBulkEmailJob(
    job: Job<{ recipients: string[]; subject: string; template: string; templateData: Record<string, any> }>
  ): Promise<{ processed: number; failed: number }> {
    try {
      this.logger.debug(`Processing bulk email job ${job.id} for ${job.data.recipients.length} recipients`)

      let processed = 0
      let failed = 0

      for (const recipient of job.data.recipients) {
        try {
          await this.emailService.sendEmail({
            to: recipient,
            subject: job.data.subject,
            template: job.data.template,
            templateData: job.data.templateData,
          })
          processed++
        } catch (error) {
          this.logger.error(`Failed to send email to ${recipient}:`, error)
          failed++
        }

        // Update progress
        job.progress(Math.round((processed / job.data.recipients.length) * 100))
      }

      this.logger.log(`Bulk email job ${job.id} completed: ${processed} sent, ${failed} failed`)
      return { processed, failed }
    } catch (error) {
      this.logger.error(`Bulk email job ${job.id} failed:`, error)
      throw error
    }
  }
}
