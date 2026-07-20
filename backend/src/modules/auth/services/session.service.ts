import { Injectable, Logger } from '@nestjs/common'
import { Redis } from 'redis'
import { v4 as uuid } from 'uuid'

interface SessionData {
  userId: string
  tenantId: string
  email: string
  role: string
  ipAddress?: string
  userAgent?: string
  createdAt: number
  lastActivityAt: number
}

/**
 * Session Management Service
 * Manages user sessions with Redis-based storage
 * Supports session tracking, logout, and session validation
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name)
  private readonly SESSION_PREFIX = 'session:'
  private readonly SESSION_TTL = 7 * 24 * 60 * 60 // 7 days in seconds
  private readonly INACTIVITY_TIMEOUT = 30 * 60 // 30 minutes in seconds

  private redisClient: Redis

  constructor() {
    // Redis will be initialized in app module
    this.initializeRedis()
  }

  private async initializeRedis() {
    try {
      // This will be called after dependency injection is complete
      // For now, we store Redis client reference
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection', error)
    }
  }

  /**
   * Set Redis client (should be called from app initialization)
   */
  setRedisClient(client: Redis) {
    this.redisClient = client
  }

  /**
   * Create a new session
   */
  async createSession(data: Omit<SessionData, 'createdAt' | 'lastActivityAt'>) {
    const sessionId = uuid()
    const sessionData: SessionData = {
      ...data,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    }

    try {
      if (this.redisClient) {
        await this.redisClient.setex(
          `${this.SESSION_PREFIX}${sessionId}`,
          this.SESSION_TTL,
          JSON.stringify(sessionData)
        )
      }

      this.logger.debug(`Session created: ${sessionId} for user ${data.userId}`)
      return sessionId
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`)
      throw error
    }
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      if (!this.redisClient) return null

      const data = await this.redisClient.get(`${this.SESSION_PREFIX}${sessionId}`)
      if (!data) return null

      const session = JSON.parse(data) as SessionData

      // Check if session has expired due to inactivity
      const timeSinceLastActivity = Date.now() - session.lastActivityAt
      if (timeSinceLastActivity > this.INACTIVITY_TIMEOUT * 1000) {
        await this.deleteSession(sessionId)
        return null
      }

      return session
    } catch (error) {
      this.logger.error(`Failed to get session: ${error.message}`)
      return null
    }
  }

  /**
   * Update session last activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
      if (!this.redisClient) return false

      const session = await this.getSession(sessionId)
      if (!session) return false

      session.lastActivityAt = Date.now()
      await this.redisClient.setex(
        `${this.SESSION_PREFIX}${sessionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      )

      return true
    } catch (error) {
      this.logger.error(`Failed to update session activity: ${error.message}`)
      return false
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      if (!this.redisClient) return false

      const result = await this.redisClient.del(`${this.SESSION_PREFIX}${sessionId}`)
      this.logger.debug(`Session deleted: ${sessionId}`)
      return result > 0
    } catch (error) {
      this.logger.error(`Failed to delete session: ${error.message}`)
      return false
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Array<{ sessionId: string; data: SessionData }>> {
    try {
      if (!this.redisClient) return []

      // This is a simplified implementation
      // In production, maintain a user -> sessions mapping
      const keys = await this.redisClient.keys(`${this.SESSION_PREFIX}*`)
      const sessions = []

      for (const key of keys) {
        const data = await this.redisClient.get(key)
        if (data) {
          const session = JSON.parse(data) as SessionData
          if (session.userId === userId) {
            sessions.push({
              sessionId: key.replace(this.SESSION_PREFIX, ''),
              data: session,
            })
          }
        }
      }

      return sessions
    } catch (error) {
      this.logger.error(`Failed to get user sessions: ${error.message}`)
      return []
    }
  }

  /**
   * Invalidate all sessions for a user (logout all devices)
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    try {
      if (!this.redisClient) return 0

      const sessions = await this.getUserSessions(userId)
      let deletedCount = 0

      for (const { sessionId } of sessions) {
        const deleted = await this.deleteSession(sessionId)
        if (deleted) deletedCount++
      }

      this.logger.debug(`Invalidated ${deletedCount} sessions for user ${userId}`)
      return deletedCount
    } catch (error) {
      this.logger.error(`Failed to invalidate user sessions: ${error.message}`)
      return 0
    }
  }

  /**
   * Get session count for rate limiting
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId)
      return sessions.length
    } catch (error) {
      this.logger.error(`Failed to get active session count: ${error.message}`)
      return 0
    }
  }

  /**
   * Validate session and check expiry
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId)
    if (!session) return false

    // Update activity on validation
    await this.updateSessionActivity(sessionId)
    return true
  }
}
