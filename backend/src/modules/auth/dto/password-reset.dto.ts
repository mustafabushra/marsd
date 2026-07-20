import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator'

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string
}

export class VerifyResetTokenDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string

  @IsString()
  @MinLength(32)
  token!: string
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  email!: string

  @IsString()
  @MinLength(32)
  token!: string

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message: 'كلمة المرور يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام ورموز خاصة',
  })
  newPassword!: string
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  oldPassword!: string

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message: 'كلمة المرور يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام ورموز خاصة',
  })
  newPassword!: string
}
