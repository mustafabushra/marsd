import { IsOptional, IsBoolean } from 'class-validator'

export class LogoutDto {
  @IsOptional()
  @IsBoolean()
  logoutAllDevices?: boolean // If true, logout from all sessions
}
