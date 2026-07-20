import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull'
import { PrismaService } from '@/prisma/prisma.service'
import { EmailService } from '../email/email.service'
import {
  CreateNotificationDto,
  BulkCreateNotificationDto,
  GetNotificationsQueryDto,
  MarkAsReadDto,
} from './dto/create-notification.dto'

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    @InjectQueue('email') private emailQueue: Queue
  ) {}

  async createNotification(dto: CreateNotificationDto): Promise<any> {
    try {
      this.logger.debug(`Creating notification for user ${dto.userId}`)

      // Create in-app notification
      const notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          payload: dto.payload,
        },
        include: {
          user: true,
        },
      })

      // Send email notification if configured
      await this.sendEmailNotification(notification, dto)

      // Emit WebSocket event if configured
      this.emitNotificationEvent(notification)

      return notification
    } catch (error) {
      this.logger.error(`Failed to create notification:`, error)
      throw error
    }
  }

  async createBulkNotifications(dto: BulkCreateNotificationDto): Promise<any[]> {
    try {
      this.logger.debug(`Creating bulk notifications for ${dto.userIds.length} users`)

      const notifications = await Promise.all(
        dto.userIds.map((userId) =>
          this.createNotification({
            userId,
            type: dto.type,
            payload: dto.payload,
          })
        )
      )

      return notifications
    } catch (error) {
      this.logger.error(`Failed to create bulk notifications:`, error)
      throw error
    }
  }

  async getNotifications(
    userId: string,
    query: GetNotificationsQueryDto
  ): Promise<{ notifications: any[]; total: number }> {
    try {
      const limit = query.limit || 20
      const offset = query.offset || 0

      const where: any = { userId }

      if (query.type) {
        where.type = query.type
      }

      if (query.read && query.read !== 'all') {
        where.readAt = query.read === 'true' ? { not: null } : null
      }

      const [notifications, total] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        this.prisma.notification.count({ where }),
      ])

      return { notifications, total }
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error)
      throw error
    }
  }

  async getNotificationById(notificationId: string): Promise<any> {
    try {
      return await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          user: true,
        },
      })
    } catch (error) {
      this.logger.error(`Failed to get notification ${notificationId}:`, error)
      throw error
    }
  }

  async markAsRead(userId: string, dto: MarkAsReadDto): Promise<{ updated: number }> {
    try {
      if (dto.markAll) {
        const result = await this.prisma.notification.updateMany({
          where: {
            userId,
            readAt: null,
            ...(dto.type && { type: dto.type }),
          },
          data: { readAt: new Date() },
        })
        return { updated: result.count }
      }

      if (dto.notificationIds && dto.notificationIds.length > 0) {
        const result = await this.prisma.notification.updateMany({
          where: {
            id: { in: dto.notificationIds },
            userId,
          },
          data: { readAt: new Date() },
        })
        return { updated: result.count }
      }

      return { updated: 0 }
    } catch (error) {
      this.logger.error(`Failed to mark notifications as read:`, error)
      throw error
    }
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    try {
      await this.prisma.notification.delete({
        where: {
          id: notificationId,
        },
      })
      this.logger.debug(`Notification ${notificationId} deleted`)
    } catch (error) {
      this.logger.error(`Failed to delete notification ${notificationId}:`, error)
      throw error
    }
  }

  async deleteMultipleNotifications(userId: string, notificationIds: string[]): Promise<{ deleted: number }> {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: {
          id: { in: notificationIds },
          userId,
        },
      })
      return { deleted: result.count }
    } catch (error) {
      this.logger.error(`Failed to delete multiple notifications:`, error)
      throw error
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      })
    } catch (error) {
      this.logger.error(`Failed to get unread count for user ${userId}:`, error)
      throw error
    }
  }

  private async sendEmailNotification(notification: any, dto: CreateNotificationDto): Promise<void> {
    try {
      // Get email template mapping
      const templateMap: Record<string, string> = {
        report_approved: 'report-approved',
        score_changed: 'score-changed',
        request_received: 'business-request',
        watchlist_alert: 'watchlist-alert',
      }

      const template = templateMap[dto.type]
      if (!template) {
        this.logger.warn(`No email template found for notification type: ${dto.type}`)
        return
      }

      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      })

      if (!user || !user.email) {
        this.logger.warn(`User ${dto.userId} has no email address`)
        return
      }

      // Queue email job
      await this.emailQueue.add('send', {
        to: user.email,
        subject: this.getEmailSubject(dto.type),
        template,
        templateData: {
          firstName: user.firstName || 'صديقنا',
          ...dto.payload,
        },
      })

      this.logger.debug(`Email queued for notification ${notification.id}`)
    } catch (error) {
      this.logger.error(`Failed to queue email notification:`, error)
      // Don't throw - notification should still be created even if email fails
    }
  }

  private getEmailSubject(type: string): string {
    const subjectMap: Record<string, string> = {
      report_approved: 'تم قبول تقريرك',
      score_changed: 'تحديث مؤشر الثقة',
      request_received: 'طلب أعمال جديد',
      watchlist_alert: 'تنبيه قائمة المراقبة',
    }
    return subjectMap[type] || 'إشعار جديد من مرصد'
  }

  private emitNotificationEvent(notification: any): void {
    // This will be implemented with WebSocket integration
    // For now, just log it
    this.logger.debug(`Notification event: ${notification.type} for user ${notification.userId}`)
  }
}
