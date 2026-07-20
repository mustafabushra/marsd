import { IsEmail, IsString, IsOptional, IsObject } from 'class-validator'

export class SendEmailDto {
  @IsEmail()
  to: string

  @IsString()
  subject: string

  @IsString()
  @IsOptional()
  text?: string

  @IsString()
  @IsOptional()
  html?: string

  @IsString()
  @IsOptional()
  template?: string

  @IsObject()
  @IsOptional()
  templateData?: Record<string, any>

  @IsString()
  @IsOptional()
  cc?: string

  @IsString()
  @IsOptional()
  bcc?: string

  @IsOptional()
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
}

export class SendBulkEmailDto {
  @IsEmail({ each: true })
  recipients: string[]

  @IsString()
  subject: string

  @IsString()
  @IsOptional()
  template?: string

  @IsObject()
  @IsOptional()
  templateData?: Record<string, any>
}

export class TemplateEmailDto {
  @IsString()
  templateName: string

  @IsEmail()
  to: string

  @IsObject()
  data: Record<string, any>
}
