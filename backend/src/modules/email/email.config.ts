import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface EmailConfig {
  provider: 'sendgrid' | 'nodemailer' | 'aws-ses'
  sendgridApiKey?: string
  nodemailer?: {
    host: string
    port: number
    secure: boolean
    auth: {
      user: string
      pass: string
    }
  }
  fromEmail: string
  fromName: string
}

@Injectable()
export class EmailConfigService {
  constructor(private configService: ConfigService) {}

  getConfig(): EmailConfig {
    const provider = (this.configService.get<string>('EMAIL_PROVIDER') || 'sendgrid') as
      | 'sendgrid'
      | 'nodemailer'
      | 'aws-ses'

    if (provider === 'sendgrid') {
      return {
        provider,
        sendgridApiKey: this.configService.get<string>('SENDGRID_API_KEY'),
        fromEmail: this.configService.get<string>('EMAIL_FROM') || 'noreply@marsad.sa',
        fromName: this.configService.get<string>('EMAIL_FROM_NAME') || 'Marsad',
      }
    }

    if (provider === 'nodemailer') {
      return {
        provider,
        nodemailer: {
          host: this.configService.get<string>('NODEMAILER_HOST') || 'localhost',
          port: this.configService.get<number>('NODEMAILER_PORT') || 1025,
          secure: this.configService.get<boolean>('NODEMAILER_SECURE') || false,
          auth: {
            user: this.configService.get<string>('NODEMAILER_USER') || '',
            pass: this.configService.get<string>('NODEMAILER_PASS') || '',
          },
        },
        fromEmail: this.configService.get<string>('EMAIL_FROM') || 'noreply@marsad.sa',
        fromName: this.configService.get<string>('EMAIL_FROM_NAME') || 'Marsad',
      }
    }

    return {
      provider: 'sendgrid',
      sendgridApiKey: this.configService.get<string>('SENDGRID_API_KEY'),
      fromEmail: this.configService.get<string>('EMAIL_FROM') || 'noreply@marsad.sa',
      fromName: this.configService.get<string>('EMAIL_FROM_NAME') || 'Marsad',
    }
  }
}
