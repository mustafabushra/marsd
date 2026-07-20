import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  Request,
} from '@nestjs/common'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { NotificationService } from './notification.service'
import {
  CreateNotificationDto,
  BulkCreateNotificationDto,
  GetNotificationsQueryDto,
  MarkAsReadDto,
} from './dto/create-notification.dto'

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(private notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Request() req: any,
    @Query() query: GetNotificationsQueryDto
  ): Promise<{ notifications: any[]; total: number }> {
    this.logger.debug(`Fetching notifications for user ${req.user.id}`)
    return this.notificationService.getNotifications(req.user.id, query)
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: any): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationService.getUnreadCount(req.user.id)
    return { unreadCount }
  }

  @Get(':id')
  async getNotificationById(@Param('id') id: string): Promise<any> {
    return this.notificationService.getNotificationById(id)
  }

  @Post()
  async createNotification(@Body() dto: CreateNotificationDto): Promise<any> {
    this.logger.debug(`Creating notification for user ${dto.userId}`)
    return this.notificationService.createNotification(dto)
  }

  @Post('bulk')
  async createBulkNotifications(@Body() dto: BulkCreateNotificationDto): Promise<any[]> {
    this.logger.debug(`Creating bulk notifications for ${dto.userIds.length} users`)
    return this.notificationService.createBulkNotifications(dto)
  }

  @Post(':id/mark-as-read')
  async markAsRead(
    @Request() req: any,
    @Param('id') id: string
  ): Promise<{ updated: number }> {
    return this.notificationService.markAsRead(req.user.id, {
      notificationIds: [id],
    })
  }

  @Post('mark-as-read')
  async markMultipleAsRead(
    @Request() req: any,
    @Body() dto: MarkAsReadDto
  ): Promise<{ updated: number }> {
    return this.notificationService.markAsRead(req.user.id, dto)
  }

  @Delete(':id')
  async deleteNotification(
    @Request() req: any,
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    await this.notificationService.deleteNotification(req.user.id, id)
    return { deleted: true }
  }

  @Post('delete-multiple')
  async deleteMultipleNotifications(
    @Request() req: any,
    @Body() dto: { notificationIds: string[] }
  ): Promise<{ deleted: number }> {
    return this.notificationService.deleteMultipleNotifications(req.user.id, dto.notificationIds)
  }
}
