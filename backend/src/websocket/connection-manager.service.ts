import { Injectable, Logger } from '@nestjs/common'

/**
 * Connection metadata stored for each WebSocket connection
 */
interface ConnectionMetadata {
  userId: string
  tenantId: string
  userEmail: string
  userRole: string
  socketId: string
  connectedAt: Date
}

/**
 * Manages WebSocket connections
 * Tracks active connections per user/tenant
 *
 * In production, this should use Redis for multi-instance deployments:
 * - Redis pub/sub for cross-instance communication
 * - Redis hashes for connection state
 * - TTL-based cleanup for stale connections
 */
@Injectable()
export class ConnectionManager {
  private readonly logger = new Logger(ConnectionManager.name)

  // In-memory connection store
  // In production: use Redis with key pattern: connection:{socketId}
  private connections = new Map<string, ConnectionMetadata>()

  // Index: userId -> socketIds
  // In production: use Redis with key pattern: user-connections:{userId}
  private userConnections = new Map<string, Set<string>>()

  // Index: tenantId -> socketIds
  // In production: use Redis with key pattern: tenant-connections:{tenantId}
  private tenantConnections = new Map<string, Set<string>>()

  /**
   * Register a new connection
   */
  async registerConnection(
    socketId: string,
    metadata: ConnectionMetadata,
  ): Promise<void> {
    // Store connection metadata
    this.connections.set(socketId, metadata)

    // Update user index
    if (!this.userConnections.has(metadata.userId)) {
      this.userConnections.set(metadata.userId, new Set())
    }
    this.userConnections.get(metadata.userId)!.add(socketId)

    // Update tenant index
    if (!this.tenantConnections.has(metadata.tenantId)) {
      this.tenantConnections.set(metadata.tenantId, new Set())
    }
    this.tenantConnections.get(metadata.tenantId)!.add(socketId)

    this.logger.debug(
      `Registered connection ${socketId} for user ${metadata.userId}`,
    )
  }

  /**
   * Remove a connection
   */
  async removeConnection(socketId: string): Promise<void> {
    const metadata = this.connections.get(socketId)

    if (!metadata) {
      this.logger.warn(`Connection ${socketId} not found`)
      return
    }

    // Remove from main store
    this.connections.delete(socketId)

    // Remove from user index
    this.userConnections.get(metadata.userId)?.delete(socketId)
    if (this.userConnections.get(metadata.userId)?.size === 0) {
      this.userConnections.delete(metadata.userId)
    }

    // Remove from tenant index
    this.tenantConnections.get(metadata.tenantId)?.delete(socketId)
    if (this.tenantConnections.get(metadata.tenantId)?.size === 0) {
      this.tenantConnections.delete(metadata.tenantId)
    }

    this.logger.debug(`Removed connection ${socketId}`)
  }

  /**
   * Get all connections for a user
   */
  async getUserConnections(userId: string): Promise<ConnectionMetadata[]> {
    const socketIds = this.userConnections.get(userId) || new Set()
    return Array.from(socketIds)
      .map((socketId) => this.connections.get(socketId)!)
      .filter((conn) => conn !== undefined)
  }

  /**
   * Get all connections for a tenant
   */
  async getTenantConnections(tenantId: string): Promise<ConnectionMetadata[]> {
    const socketIds = this.tenantConnections.get(tenantId) || new Set()
    return Array.from(socketIds)
      .map((socketId) => this.connections.get(socketId)!)
      .filter((conn) => conn !== undefined)
  }

  /**
   * Get all active connections
   */
  async getAllConnections(): Promise<ConnectionMetadata[]> {
    return Array.from(this.connections.values())
  }

  /**
   * Get connection by socket ID
   */
  async getConnection(socketId: string): Promise<ConnectionMetadata | null> {
    return this.connections.get(socketId) || null
  }

  /**
   * Check if user is online (has any active connections)
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const connections = this.userConnections.get(userId)
    return (connections?.size || 0) > 0
  }

  /**
   * Get total connection count
   */
  async getConnectionCount(): Promise<number> {
    return this.connections.size
  }

  /**
   * Get connection count by tenant
   */
  async getTenantConnectionCount(tenantId: string): Promise<number> {
    return this.tenantConnections.get(tenantId)?.size || 0
  }

  /**
   * Get connection statistics
   */
  async getStats() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userConnections.size,
      totalTenants: this.tenantConnections.size,
      connections: {
        byUser: Object.fromEntries(
          Array.from(this.userConnections.entries()).map(([userId, sockets]) => [
            userId,
            sockets.size,
          ]),
        ),
        byTenant: Object.fromEntries(
          Array.from(this.tenantConnections.entries()).map(([tenantId, sockets]) => [
            tenantId,
            sockets.size,
          ]),
        ),
      },
    }
  }

  /**
   * Cleanup stale connections (called periodically)
   * In production: implement with Redis TTL
   */
  async cleanup(): Promise<void> {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // 1 hour
    let cleaned = 0

    for (const [socketId, metadata] of this.connections.entries()) {
      if (now - metadata.connectedAt.getTime() > maxAge) {
        await this.removeConnection(socketId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} stale connections`)
    }
  }
}
