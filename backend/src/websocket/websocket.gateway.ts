import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConnectionManager } from './connection-manager.service'
import { RealtimeNotificationService } from './realtime-notification.service'
import { PresenceService } from './presence.service'

/**
 * WebSocket Gateway for Marsad Real-time Features
 * Handles connections, authentication, and message broadcasting
 *
 * Features:
 * - JWT-based authentication
 * - Multi-tenant isolation
 * - Connection tracking
 * - Presence indicators
 * - Real-time notifications
 * - Message broadcasting
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
})
@Injectable()
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(WebSocketGateway.name)

  constructor(
    private jwtService: JwtService,
    private connectionManager: ConnectionManager,
    private realtimeNotificationService: RealtimeNotificationService,
    private presenceService: PresenceService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialized')
  }

  /**
   * Handle new WebSocket connections
   * Authenticates user via JWT token and sets up connection context
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided (${client.id})`)
        client.disconnect()
        return
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token)

      // Extract user and tenant information
      const userId = payload.sub
      const tenantId = payload.tenantId
      const userEmail = payload.email
      const userRole = payload.role

      // Store connection metadata
      client.data = {
        userId,
        tenantId,
        userEmail,
        userRole,
        connectedAt: new Date(),
      }

      // Register connection
      await this.connectionManager.registerConnection(client.id, {
        userId,
        tenantId,
        userEmail,
        userRole,
        socketId: client.id,
        connectedAt: new Date(),
      })

      // Join tenant-specific room
      client.join(`tenant:${tenantId}`)

      // Join user-specific room for personal notifications
      client.join(`user:${userId}`)

      // Mark user as online
      await this.presenceService.markOnline(userId, tenantId, client.id)

      // Broadcast presence update to tenant
      this.server
        .to(`tenant:${tenantId}`)
        .emit('presence:user-online', {
          userId,
          userEmail,
          timestamp: new Date(),
        })

      this.logger.log(
        `User ${userEmail} (${userId}) connected with socket ${client.id}`,
      )
    } catch (error) {
      this.logger.error(`Connection authentication failed: ${error.message}`)
      client.disconnect()
    }
  }

  /**
   * Handle client disconnections
   * Cleanup and broadcast offline presence
   */
  async handleDisconnect(client: Socket) {
    try {
      const { userId, tenantId, userEmail } = client.data

      if (!userId) return

      // Unregister connection
      await this.connectionManager.removeConnection(client.id)

      // Check if user has other active connections
      const hasOtherConnections =
        await this.connectionManager.getUserConnections(userId)

      if (hasOtherConnections.length === 0) {
        // User is fully offline
        await this.presenceService.markOffline(userId, tenantId)

        // Broadcast offline presence
        this.server.to(`tenant:${tenantId}`).emit('presence:user-offline', {
          userId,
          userEmail,
          timestamp: new Date(),
        })

        this.logger.log(`User ${userEmail} (${userId}) fully disconnected`)
      } else {
        this.logger.log(
          `User ${userEmail} (${userId}) disconnected (${hasOtherConnections.length} connection(s) remain)`,
        )
      }
    } catch (error) {
      this.logger.error(`Error during disconnect: ${error.message}`)
    }
  }

  /**
   * Subscribe to notifications
   * Client sends this message to start receiving real-time notifications
   */
  @SubscribeMessage('notifications:subscribe')
  async handleNotificationsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { types?: string[] },
  ) {
    try {
      const { userId, tenantId } = client.data

      if (!userId) {
        throw new UnauthorizedException('Not authenticated')
      }

      // Register subscription
      const subscription = await this.realtimeNotificationService.subscribe(
        userId,
        tenantId,
        data.types || ['all'],
        client.id,
      )

      client.emit('notifications:subscribed', {
        success: true,
        subscriptionId: subscription.id,
        types: subscription.types,
      })

      this.logger.debug(
        `User ${userId} subscribed to notifications: ${data.types || ['all']}`,
      )
    } catch (error) {
      client.emit('notifications:subscribe-error', {
        error: error.message,
      })
    }
  }

  /**
   * Unsubscribe from notifications
   */
  @SubscribeMessage('notifications:unsubscribe')
  async handleNotificationsUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { subscriptionId: string },
  ) {
    try {
      const { userId } = client.data

      if (!userId) {
        throw new UnauthorizedException('Not authenticated')
      }

      await this.realtimeNotificationService.unsubscribe(
        data.subscriptionId,
      )

      client.emit('notifications:unsubscribed', {
        success: true,
        subscriptionId: data.subscriptionId,
      })
    } catch (error) {
      client.emit('notifications:unsubscribe-error', {
        error: error.message,
      })
    }
  }

  /**
   * Ping/Pong for keeping connection alive
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date() })
  }

  /**
   * Get online users in tenant
   */
  @SubscribeMessage('presence:get-online-users')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    try {
      const { tenantId } = client.data

      const onlineUsers = await this.presenceService.getOnlineUsers(tenantId)

      client.emit('presence:online-users', {
        users: onlineUsers,
        timestamp: new Date(),
      })
    } catch (error) {
      client.emit('presence:error', {
        error: error.message,
      })
    }
  }

  /**
   * Broadcast notification to specific user
   * Called from services/controllers
   */
  async broadcastNotification(
    userId: string,
    notification: {
      type: string
      title: string
      message: string
      payload?: any
      urgency?: 'low' | 'medium' | 'high'
    },
  ) {
    this.server.to(`user:${userId}`).emit('notification:received', {
      ...notification,
      receivedAt: new Date(),
    })
  }

  /**
   * Broadcast to all users in a tenant (e.g., new report)
   */
  async broadcastToTenant(
    tenantId: string,
    event: string,
    data: any,
  ) {
    this.server.to(`tenant:${tenantId}`).emit(event, {
      ...data,
      broadcastAt: new Date(),
    })
  }

  /**
   * Broadcast live admin update (new reports, disputes, etc.)
   */
  async broadcastAdminUpdate(
    tenantId: string,
    updateType: 'report' | 'dispute' | 'company' | 'scoring',
    data: any,
  ) {
    this.server.to(`tenant:${tenantId}`).emit('admin:live-update', {
      updateType,
      data,
      timestamp: new Date(),
    })
  }

  /**
   * Get connection count for monitoring
   */
  getConnectionStats() {
    return {
      totalConnections: this.server.engine.clientsCount,
      rooms: this.server.sockets.adapter.rooms,
    }
  }
}
