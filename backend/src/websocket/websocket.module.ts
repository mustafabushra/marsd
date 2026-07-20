import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { WebSocketGateway } from './websocket.gateway'
import { ConnectionManager } from './connection-manager.service'
import { RealtimeNotificationService } from './realtime-notification.service'
import { PresenceService } from './presence.service'
import { PrismaModule } from '@/prisma/prisma.module'

/**
 * WebSocket Module
 *
 * Provides real-time features:
 * - Live notifications
 * - Presence tracking
 * - Connection management
 * - Message broadcasting
 * - Multi-tenant isolation
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    }),
  ],
  providers: [
    WebSocketGateway,
    ConnectionManager,
    RealtimeNotificationService,
    PresenceService,
  ],
  exports: [
    ConnectionManager,
    RealtimeNotificationService,
    PresenceService,
    WebSocketGateway,
  ],
})
export class WebSocketModule {}
