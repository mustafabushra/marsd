import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Handlebars from 'handlebars'
import * as fs from 'fs'
import * as path from 'path'
import { SendEmailDto, SendBulkEmailDto, TemplateEmailDto } from './dto/send-email.dto'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private emailProvider: EmailProviderInterface
  private templateCache: Map<string, string> = new Map()

  constructor(private configService: ConfigService) {
    this.emailProvider = this.initializeProvider()
  }

  private initializeProvider(): EmailProviderInterface {
    const provider = (this.configService.get<string>('EMAIL_PROVIDER') || 'sendgrid') as
      | 'sendgrid'
      | 'nodemailer'

    if (provider === 'sendgrid') {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(this.configService.get<string>('SENDGRID_API_KEY'))
      return new SendGridProvider(sgMail, this.configService)
    } else {
      return new NodemailerProvider(this.configService)
    }
  }

  async sendEmail(dto: SendEmailDto): Promise<{ messageId: string; status: string }> {
    try {
      this.logger.debug(`Sending email to ${dto.to}`)

      // If template is provided, render it
      let htmlContent = dto.html
      if (dto.template && dto.templateData) {
        htmlContent = await this.renderTemplate(dto.template, dto.templateData)
      }

      const result = await this.emailProvider.send({
        to: dto.to,
        subject: dto.subject,
        text: dto.text,
        html: htmlContent,
        cc: dto.cc,
        bcc: dto.bcc,
        attachments: dto.attachments,
      })

      this.logger.log(`Email sent successfully to ${dto.to}`)
      return result
    } catch (error) {
      this.logger.error(`Failed to send email to ${dto.to}:`, error)
      throw error
    }
  }

  async sendBulkEmail(dto: SendBulkEmailDto): Promise<{ messageId: string; status: string }[]> {
    try {
      this.logger.debug(`Sending bulk email to ${dto.recipients.length} recipients`)

      const results = await Promise.all(
        dto.recipients.map((recipient) =>
          this.sendEmail({
            to: recipient,
            subject: dto.subject,
            template: dto.template,
            templateData: dto.templateData,
          })
        )
      )

      this.logger.log(`Bulk email sent to ${dto.recipients.length} recipients`)
      return results
    } catch (error) {
      this.logger.error('Failed to send bulk email:', error)
      throw error
    }
  }

  async sendTemplateEmail(dto: TemplateEmailDto): Promise<{ messageId: string; status: string }> {
    return this.sendEmail({
      to: dto.to,
      subject: '', // Subject should be in template data
      template: dto.templateName,
      templateData: dto.data,
    })
  }

  async renderTemplate(templateName: string, data: Record<string, any>): Promise<string> {
    try {
      // Check cache first
      let templateContent = this.templateCache.get(templateName)

      if (!templateContent) {
        // Load template from file
        const templatePath = path.join(
          __dirname,
          'templates',
          `${templateName}.hbs`
        )

        if (!fs.existsSync(templatePath)) {
          throw new Error(`Template not found: ${templateName}`)
        }

        templateContent = fs.readFileSync(templatePath, 'utf-8')
        this.templateCache.set(templateName, templateContent)
      }

      // Compile and render template
      const template = Handlebars.compile(templateContent)
      return template(data)
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}:`, error)
      throw error
    }
  }

  clearTemplateCache(): void {
    this.templateCache.clear()
    this.logger.log('Template cache cleared')
  }
}

// ============================================================================
// Provider Interfaces and Implementations
// ============================================================================

interface EmailProviderInterface {
  send(options: SendOptions): Promise<{ messageId: string; status: string }>
}

interface SendOptions {
  to: string
  subject: string
  text?: string
  html?: string
  cc?: string
  bcc?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
}

class SendGridProvider implements EmailProviderInterface {
  constructor(
    private sgMail: any,
    private configService: ConfigService
  ) {}

  async send(options: SendOptions): Promise<{ messageId: string; status: string }> {
    const msg = {
      to: options.to,
      from: this.configService.get<string>('EMAIL_FROM') || 'noreply@marsad.sa',
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
    }

    const response = await this.sgMail.send(msg)
    return {
      messageId: response[0].headers['x-message-id'] || 'unknown',
      status: 'sent',
    }
  }
}

class NodemailerProvider implements EmailProviderInterface {
  private transporter: any

  constructor(private configService: ConfigService) {
    const nodemailer = require('nodemailer')
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('NODEMAILER_HOST') || 'localhost',
      port: this.configService.get<number>('NODEMAILER_PORT') || 1025,
      secure: this.configService.get<boolean>('NODEMAILER_SECURE') || false,
      auth:
        this.configService.get<string>('NODEMAILER_USER') &&
        this.configService.get<string>('NODEMAILER_PASS')
          ? {
              user: this.configService.get<string>('NODEMAILER_USER'),
              pass: this.configService.get<string>('NODEMAILER_PASS'),
            }
          : undefined,
    })
  }

  async send(options: SendOptions): Promise<{ messageId: string; status: string }> {
    const info = await this.transporter.sendMail({
      to: options.to,
      from: this.configService.get<string>('EMAIL_FROM') || 'noreply@marsad.sa',
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    })

    return {
      messageId: info.messageId,
      status: 'sent',
    }
  }
}
