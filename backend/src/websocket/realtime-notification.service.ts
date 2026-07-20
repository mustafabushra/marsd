import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { v4 as uuid } from 'uuid'

/**
 * Notification subscription metadata
 */
interface NotificationSubscription {
  id: string
  userId: string
  tenantId: string
  socketId: string
  types: string[]
  subscribedAt: Date
}

/**
 * Real-time notification service
 * Manages notification subscriptions and delivery
 *
 * Supports:
 * - Multiple notification types
 * - Per-user filtering
 * - Persistence to database
 * - Real-time delivery via WebSocket
 */
@Injectable()
export class RealtimeNotificationService {
  private readonly logger = new Logger(RealtimeNotificationService.name)

  // In-memory subscription store
  // In production: use Redis with key pattern: notification-subscription:{subscriptionId}
  private subscriptions = new Map<string, NotificationSubscription>()

  // Index: userId -> subscriptionIds
  // In production: use Redis with key pattern: user-subscriptions:{userId}
  private userSubscriptions = new Map<string, Set<string>>()

  constructor(private prisma: PrismaService) {}

  /**
   * Subscribe to notifications
   */
  async subscribe(
    userId: string,
    tenantId: string,
    types: string[],
    socketId: string,
  ): Promise<NotificationSubscription> {
    const subscriptionId = uuid()

    const subscription: NotificationSubscription = {
      id: subscriptionId,
      userId,
      tenantId,
      socketId,
      types,
      subscribedAt: new Date(),
    }

    this.subscriptions.set(subscriptionId, subscription)

    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set())
    }
    this.userSubscriptions.get(userId)!.add(subscriptionId)

    this.logger.debug(
      `User ${userId} subscribed to notification types: ${types.join(', ')}`,
    )

    return subscription
  }

  /**
   * Unsubscribe from notifications
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId)

    if (!subscription) {
      return
    }

    this.subscriptions.delete(subscriptionId)
    this.userSubscriptions.get(subscription.userId)?.delete(subscriptionId)

    this.logger.debug(`Unsubscribed from notifications: ${subscriptionId}`)
  }

  /**
   * Get subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<NotificationSubscription[]> {
    const subscriptionIds = this.userSubscriptions.get(userId) || new Set()
    return Array.from(subscriptionIds)
      .map((id) => this.subscriptions.get(id)!)
      .filter((sub) => sub !== undefined)
  }

  /**
   * Check if notification type matches subscription
   */
  private matchesSubscription(
    subscription: NotificationSubscription,
    type: string,
  ): boolean {
    return (
      subscription.types.includes('all') || subscription.types.includes(type)
    )
  }

  /**
   * Create and save a notification
   * Returns subscribing users who should receive it
   */
  async createNotification(
    userId: string,
    tenantId: string,
    type: string,
    title: string,
    message: string,
    payload?: any,
  ): Promise<{
    notificationId: string
    subscribedSockets: string[]
  }> {
    try {
      // Save to database
      const notification = await this.prisma.notification.create({
        data: {
          id: uuid(),
          userId,
          tenantId,
          type,
          payload: {
            title,
            message,
            ...(payload || {}),
          },
        },
      })

      // Find subscriptions that match this notification type
      const subscriptions = await this.getUserSubscriptions(userId)
      const subscribedSockets = subscriptions
        .filter((sub) => this.matchesSubscription(sub, type))
        .map((sub) => sub.socketId)

      this.logger.debug(
        `Created notification ${notification.id} for user ${userId}`,
      )

      return {
        notificationId: notification.id,
        subscribedSockets,
      }
    } catch (error) {
      this.logger.error(
        `Failed to create notification: ${error.message}`,
      )
      throw error
    }
  }

  /**
   * Broadcast notification to admin users
   * For events like: new report, new dispute, company trust score changed
   */
  async broadcastAdminNotification(
    tenantId: string,
    type: 'report_submitted' | 'dispute_filed' | 'score_updated' | 'fraud_alert',
    title: string,
    message: string,
    payload?: any,
  ): Promise<{
    notificationIds: string[]
    totalRecipients: number
  }> {
    try {
      // Get all admin users in tenant
      const adminUsers = await this.prisma.user.findMany({
        where: {
          tenantId,
          role: 'company_admin',
          status: 'active',
        },
        select: { id: true },
      })

      const notificationIds: string[] = []
      let totalSockets = 0

      for (const admin of adminUsers) {
        const result = await this.createNotification(
          admin.id,
          tenantId,
          type,
          title,
          message,
          payload,
        )
        notificationIds.push(result.notificationId)
        totalSockets += result.subscribedSockets.length
      }

      this.logger.log(
        `Broadcasted admin notification (${type}) to ${adminUsers.length} admin(s) with ${totalSockets} active socket(s)`,
      )

      return {
        notificationIds,
        totalRecipients: totalSockets,
      }
    } catch (error) {
      this.logger.error(
        `Failed to broadcast admin notification: ${error.message}`,
      )
      throw error
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      })
    } catch (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`)
    }
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(userId: string): Promise<any[]> {
    try {
      return await this.prisma.notification.findMany({
        where: {
          userId,
          readAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      })
    } catch (error) {
      this.logger.error(
        `Failed to fetch unread notifications: ${error.message}`,
      )
      return []
    }
  }

  /**
   * Clear old notifications (cleanup job)
   * Keep last 30 days
   */
  async cleanupOldNotifications(daysToKeep = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const result = await this.prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          readAt: {
            not: null,
          },
        },
      })

      this.logger.log(
        `Cleaned up ${result.count} old notifications (older than ${daysToKeep} days)`,
      )

      return result.count
    } catch (error) {
      this.logger.error(`Failed to cleanup notifications: ${error.message}`)
      return 0
    }
  }
}
