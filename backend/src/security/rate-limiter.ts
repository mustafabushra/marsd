/**
 * Rate Limiting Module
 * Protects API endpoints from abuse and DoS attacks
 * Uses in-memory store (can be replaced with Redis for distributed systems)
 *
 * OWASP Reference: A04:2021 – Insecure Deserialization, A07:2021 – Identification and Authentication Failures
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Rate limit configuration for different request types
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Client request metadata
 */
interface ClientRequest {
  count: number;
  firstRequestTime: number;
  lastRequestTime: number;
  blockedUntil?: number;
}

/**
 * In-memory store for rate limiting
 * In production, use Redis for distributed rate limiting
 */
class RateLimitStore {
  private store = new Map<string, ClientRequest>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get client identifier (IP + optional user ID)
   */
  private getClientId(req: Request, useUserId = false): string {
    if (useUserId && req.user?.id) {
      return `user:${req.user.id}`;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Increment request count for client
   */
  increment(clientId: string, windowMs: number): ClientRequest {
    const now = Date.now();
    let clientData = this.store.get(clientId);

    if (!clientData || now - clientData.firstRequestTime > windowMs) {
      // New window or expired
      clientData = {
        count: 1,
        firstRequestTime: now,
        lastRequestTime: now,
      };
    } else {
      // Existing window
      clientData.count++;
      clientData.lastRequestTime = now;
    }

    this.store.set(clientId, clientData);
    return clientData;
  }

  /**
   * Check if client is blocked
   */
  isBlocked(clientId: string): boolean {
    const clientData = this.store.get(clientId);
    if (!clientData || !clientData.blockedUntil) {
      return false;
    }

    const now = Date.now();
    if (now > clientData.blockedUntil) {
      // Block period expired, unblock
      clientData.blockedUntil = undefined;
      this.store.set(clientId, clientData);
      return false;
    }

    return true;
  }

  /**
   * Block a client for specified duration
   */
  block(clientId: string, durationMs: number): void {
    const clientData = this.store.get(clientId) || {
      count: 0,
      firstRequestTime: Date.now(),
      lastRequestTime: Date.now(),
    };

    clientData.blockedUntil = Date.now() + durationMs;
    this.store.set(clientId, clientData);
  }

  /**
   * Get remaining time until block expires
   */
  getBlockRemainingMs(clientId: string): number {
    const clientData = this.store.get(clientId);
    if (!clientData?.blockedUntil) {
      return 0;
    }

    const remaining = clientData.blockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Get remaining requests before limit
   */
  getRemainingRequests(clientId: string, maxRequests: number): number {
    const clientData = this.store.get(clientId);
    if (!clientData) {
      return maxRequests;
    }

    return Math.max(0, maxRequests - clientData.count);
  }

  /**
   * Get reset time for current window
   */
  getResetTime(clientId: string, windowMs: number): number {
    const clientData = this.store.get(clientId);
    if (!clientData) {
      return Date.now() + windowMs;
    }

    return clientData.firstRequestTime + windowMs;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [clientId, clientData] of this.store.entries()) {
      // Remove entries older than 24 hours
      if (now - clientData.lastRequestTime > 24 * 60 * 60 * 1000) {
        entriesToDelete.push(clientId);
      }
    }

    entriesToDelete.forEach(clientId => this.store.delete(clientId));
  }

  /**
   * Destroy the store and cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }

  /**
   * Get total entries in store (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }
}

// Global rate limit store instance
export const rateLimitStore = new RateLimitStore();

/**
 * Generic rate limiting middleware factory
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = `ip:${req.ip || req.socket.remoteAddress}`;

    // Check if client is blocked
    if (rateLimitStore.isBlocked(clientId)) {
      const remaining = rateLimitStore.getBlockRemainingMs(clientId);
      res.status(statusCode).json({
        error: message,
        retryAfter: Math.ceil(remaining / 1000),
      });
      return;
    }

    // Increment request count
    const clientData = rateLimitStore.increment(clientId, windowMs);
    const remaining = rateLimitStore.getRemainingRequests(clientId, maxRequests);
    const resetTime = rateLimitStore.getResetTime(clientId, windowMs);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

    // Check if limit exceeded
    if (clientData.count > maxRequests) {
      // Block for 15 minutes on violation
      rateLimitStore.block(clientId, 15 * 60 * 1000);

      res.status(statusCode).json({
        error: message,
        retryAfter: 900, // 15 minutes in seconds
      });
      return;
    }

    // Store rate limit info for logging
    (req as any).rateLimitInfo = {
      clientId,
      remaining,
      resetTime,
    };

    next();
  };
};

/**
 * API endpoint rate limiter (Moderate)
 * 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
});

/**
 * Authentication endpoint rate limiter (Strict)
 * 5 attempts per 15 minutes per IP (prevents brute force)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many login attempts, please try again later.',
});

/**
 * Password reset rate limiter (Very Strict)
 * 3 attempts per 1 hour per IP
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  message: 'Too many password reset attempts, please try again later.',
});

/**
 * File upload rate limiter (Moderate)
 * 10 uploads per hour per user
 */
export const fileUploadRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const clientId = `user:${req.user.id}`;

  if (rateLimitStore.isBlocked(clientId)) {
    res.status(429).json({ error: 'Upload limit exceeded, please try again later.' });
    return;
  }

  const clientData = rateLimitStore.increment(clientId, 60 * 60 * 1000);
  const maxUploads = 10;

  if (clientData.count > maxUploads) {
    rateLimitStore.block(clientId, 60 * 60 * 1000);
    res.status(429).json({ error: 'Upload limit exceeded for this hour.' });
    return;
  }

  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxUploads - clientData.count));
  next();
};

/**
 * Search rate limiter (Moderate)
 * 50 searches per 5 minutes per user/IP
 */
export const searchRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 50,
  message: 'Too many search requests, please slow down.',
});

/**
 * Database query rate limiter for analytics
 * Prevent expensive queries from overwhelming the database
 * 20 analytics queries per hour per user
 */
export const analyticsRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.id) {
    next();
    return;
  }

  const clientId = `user:${req.user.id}:analytics`;
  const clientData = rateLimitStore.increment(clientId, 60 * 60 * 1000);

  if (clientData.count > 20) {
    res.status(429).json({ error: 'Analytics query limit exceeded, please try again later.' });
    return;
  }

  next();
};

export default {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
  fileUploadRateLimiter,
  searchRateLimiter,
  analyticsRateLimiter,
};
