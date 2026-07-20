import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'

export class RegisterDto {
  @IsString()
  name!: string

  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string

  @IsString()
  crNumber!: string // السجل التجاري

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  sector?: string
}
