import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

/**
 * User presence information
 */
interface UserPresence {
  userId: string
  tenantId: string
  userEmail: string
  firstName?: string
  socketIds: string[]
  lastSeenAt: Date
  isOnline: boolean
}

/**
 * Presence tracking service
 * Tracks which users are currently online in each tenant
 *
 * In production, use Redis for:
 * - Distributed presence tracking
 * - Cross-instance user status
 * - Automatic TTL-based cleanup
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name)

  // In-memory presence store
  // In production: use Redis with key pattern: user-presence:{userId}
  private presence = new Map<string, UserPresence>()

  // Tenant presence index
  // In production: use Redis with key pattern: tenant-presence:{tenantId}
  private tenantPresence = new Map<string, Set<string>>()

  constructor(private prisma: PrismaService) {}

  /**
   * Mark user as online
   */
  async markOnline(
    userId: string,
    tenantId: string,
    socketId: string,
  ): Promise<UserPresence> {
    const existingPresence = this.presence.get(userId)

    if (existingPresence) {
      // Add socket to existing presence
      existingPresence.socketIds.push(socketId)
      existingPresence.isOnline = true
      existingPresence.lastSeenAt = new Date()
    } else {
      // Create new presence entry
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          tenantId: true,
        },
      })

      if (!user) {
        throw new Error(`User ${userId} not found`)
      }

      const newPresence: UserPresence = {
        userId,
        tenantId,
        userEmail: user.email,
        firstName: user.firstName || undefined,
        socketIds: [socketId],
        lastSeenAt: new Date(),
        isOnline: true,
      }

      this.presence.set(userId, newPresence)
    }

    // Update tenant index
    if (!this.tenantPresence.has(tenantId)) {
      this.tenantPresence.set(tenantId, new Set())
    }
    this.tenantPresence.get(tenantId)!.add(userId)

    this.logger.debug(`User ${userId} marked as online`)

    return this.presence.get(userId)!
  }

  /**
   * Mark user as offline (when all connections are closed)
   */
  async markOffline(userId: string, tenantId: string): Promise<void> {
    const presence = this.presence.get(userId)

    if (!presence) {
      return
    }

    presence.isOnline = false
    presence.lastSeenAt = new Date()

    // Could also delete the entry, but keeping for last-seen tracking
    // this.presence.delete(userId)

    // Remove from tenant index
    this.tenantPresence.get(tenantId)?.delete(userId)

    this.logger.debug(`User ${userId} marked as offline`)
  }

  /**
   * Remove socket from user's presence
   * Called when a specific connection closes
   */
  async removeSocket(userId: string, socketId: string): Promise<void> {
    const presence = this.presence.get(userId)

    if (!presence) {
      return
    }

    presence.socketIds = presence.socketIds.filter((id) => id !== socketId)

    this.logger.debug(`Removed socket ${socketId} from user ${userId}`)
  }

  /**
   * Get online users in a tenant
   */
  async getOnlineUsers(tenantId: string): Promise<UserPresence[]> {
    const userIds = this.tenantPresence.get(tenantId) || new Set()

    return Array.from(userIds)
      .map((userId) => this.presence.get(userId)!)
      .filter((presence) => presence && presence.isOnline)
  }

  /**
   * Get single user presence
   */
  async getUserPresence(userId: string): Promise<UserPresence | null> {
    return this.presence.get(userId) || null
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const presence = this.presence.get(userId)
    return presence?.isOnline ?? false
  }

  /**
   * Get total online users
   */
  async getTotalOnlineUsers(): Promise<number> {
    return Array.from(this.presence.values()).filter((p) => p.isOnline).length
  }

  /**
   * Get online users by tenant
   */
  async getTenantOnlineCount(tenantId: string): Promise<number> {
    const onlineUsers = await this.getOnlineUsers(tenantId)
    return onlineUsers.length
  }

  /**
   * Get user's active socket count
   */
  async getUserSocketCount(userId: string): Promise<number> {
    const presence = this.presence.get(userId)
    return presence?.socketIds.length || 0
  }

  /**
   * Get presence statistics
   */
  async getStats() {
    const totalUsers = this.presence.size
    const onlineUsers = Array.from(this.presence.values()).filter(
      (p) => p.isOnline,
    )
    const totalSockets = Array.from(this.presence.values()).reduce(
      (sum, p) => sum + p.socketIds.length,
      0,
    )

    return {
      totalTrackedUsers: totalUsers,
      onlineUsers: onlineUsers.length,
      offlineUsers: totalUsers - onlineUsers.length,
      totalActiveSockets: totalSockets,
      tenantsTracked: this.tenantPresence.size,
      usersByTenant: Object.fromEntries(
        Array.from(this.tenantPresence.entries()).map(([tenantId, userIds]) => [
          tenantId,
          {
            total: userIds.size,
            online: Array.from(userIds).filter(
              (userId) => this.presence.get(userId)?.isOnline,
            ).length,
          },
        ]),
      ),
    }
  }

  /**
   * Clear inactive users (cleanup job)
   * Remove presence entries for users not seen in specified time
   */
  async cleanupInactiveUsers(minutesThreshold = 60): Promise<number> {
    const cutoffTime = new Date()
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesThreshold)

    let cleaned = 0

    for (const [userId, presence] of this.presence.entries()) {
      if (!presence.isOnline && presence.lastSeenAt < cutoffTime) {
        this.presence.delete(userId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} inactive user presence records`)
    }

    return cleaned
  }
}
