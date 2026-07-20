import { IsString, IsUUID, IsObject, IsOptional, IsEmail } from 'class-validator'

export class CreateNotificationDto {
  @IsUUID()
  userId: string

  @IsString()
  type: string // report_approved | score_changed | request_received | watchlist_alert

  @IsObject()
  payload: Record<string, any>

  @IsEmail()
  @IsOptional()
  userEmail?: string
}

export class BulkCreateNotificationDto {
  @IsUUID(undefined, { each: true })
  userIds: string[]

  @IsString()
  type: string

  @IsObject()
  payload: Record<string, any>
}

export class GetNotificationsQueryDto {
  @IsString()
  @IsOptional()
  type?: string

  @IsString()
  @IsOptional()
  read?: 'true' | 'false' | 'all'

  @IsOptional()
  limit?: number

  @IsOptional()
  offset?: number
}

export class MarkAsReadDto {
  @IsUUID(undefined, { each: true })
  @IsOptional()
  notificationIds?: string[]

  @IsString()
  @IsOptional()
  type?: string

  markAll?: boolean
}
