import { IsEmail, IsString, Length, Matches } from 'class-validator'

export class VerifyEmailDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string

  @IsString()
  @Length(6, 6, { message: 'رمز التحقق يجب أن يكون 6 أحرف' })
  @Matches(/^[A-F0-9]{6}$/, { message: 'رمز التحقق غير صحيح' })
  code!: string
}

export class ResendVerificationCodeDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string
}

export class RequestEmailVerificationDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string
}
