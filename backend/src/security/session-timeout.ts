/**
 * Session Timeout Module
 * Manages session lifetimes and automatic expiration
 *
 * OWASP Reference: A07:2021 – Identification and Authentication Failures
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Session configuration
 */
interface SessionConfig {
  absoluteTimeoutMs?: number; // Maximum session lifetime (e.g., 24 hours)
  inactivityTimeoutMs?: number; // Inactivity timeout (e.g., 30 minutes)
  warningTimeBeforeExpireMs?: number; // When to warn user (e.g., 5 minutes)
  extendOnActivity?: boolean; // Extend session on user activity
  maxRenewals?: number; // Maximum times a session can be renewed
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  absoluteTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  inactivityTimeoutMs: 30 * 60 * 1000, // 30 minutes
  warningTimeBeforeExpireMs: 5 * 60 * 1000, // 5 minutes
  extendOnActivity: true,
  maxRenewals: 10,
};

/**
 * Session metadata stored in session object
 */
interface SessionMetadata {
  createdAt: number; // Absolute session creation time
  lastActivityAt: number; // Last activity timestamp
  renewalCount: number; // Number of times session was renewed
  userAgent?: string; // User agent for session validation
  ipAddress?: string; // IP address for session validation
  warnings?: number; // Number of expiration warnings sent
}

/**
 * Get or initialize session metadata
 */
export const getSessionMetadata = (req: Request): SessionMetadata => {
  if (!req.session) {
    req.session = {};
  }

  if (!(req.session as any).metadata) {
    (req.session as any).metadata = {
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      renewalCount: 0,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      warnings: 0,
    } as SessionMetadata;
  }

  return (req.session as any).metadata;
};

/**
 * Update last activity timestamp
 */
export const updateActivityTimestamp = (req: Request): void => {
  const metadata = getSessionMetadata(req);
  metadata.lastActivityAt = Date.now();
};

/**
 * Check if session is expired (absolute timeout)
 */
export const isSessionAbsolutelyExpired = (
  metadata: SessionMetadata,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): boolean => {
  const absoluteTimeout = config.absoluteTimeoutMs || 24 * 60 * 60 * 1000;
  const sessionAge = Date.now() - metadata.createdAt;
  return sessionAge > absoluteTimeout;
};

/**
 * Check if session is inactive
 */
export const isSessionInactive = (
  metadata: SessionMetadata,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): boolean => {
  const inactivityTimeout = config.inactivityTimeoutMs || 30 * 60 * 1000;
  const inactivityPeriod = Date.now() - metadata.lastActivityAt;
  return inactivityPeriod > inactivityTimeout;
};

/**
 * Get time remaining in session
 */
export const getSessionTimeRemaining = (
  metadata: SessionMetadata,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): number => {
  const absoluteTimeout = config.absoluteTimeoutMs || 24 * 60 * 60 * 1000;
  const sessionAge = Date.now() - metadata.createdAt;
  const remaining = absoluteTimeout - sessionAge;

  return Math.max(0, remaining);
};

/**
 * Get inactivity time remaining
 */
export const getInactivityTimeRemaining = (
  metadata: SessionMetadata,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): number => {
  const inactivityTimeout = config.inactivityTimeoutMs || 30 * 60 * 1000;
  const inactivityPeriod = Date.now() - metadata.lastActivityAt;
  const remaining = inactivityTimeout - inactivityPeriod;

  return Math.max(0, remaining);
};

/**
 * Check if user should be warned about expiration
 */
export const shouldWarnUserAboutExpiration = (
  metadata: SessionMetadata,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): boolean => {
  const warningTime = config.warningTimeBeforeExpireMs || 5 * 60 * 1000;
  const timeRemaining = getSessionTimeRemaining(metadata, config);
  const inactivityRemaining = getInactivityTimeRemaining(metadata, config);

  // Only warn once
  if ((metadata.warnings || 0) > 0) {
    return false;
  }

  return timeRemaining < warningTime && inactivityRemaining < warningTime;
};

/**
 * Renew session (extend absolute timeout)
 */
export const renewSession = (
  req: Request,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): { success: boolean; error?: string } => {
  const metadata = getSessionMetadata(req);
  const maxRenewals = config.maxRenewals || 10;

  if (metadata.renewalCount >= maxRenewals) {
    return {
      success: false,
      error: 'Maximum session renewals exceeded. Please log in again.',
    };
  }

  // Reset creation time to extend absolute timeout
  metadata.createdAt = Date.now();
  metadata.renewalCount++;
  metadata.lastActivityAt = Date.now();
  metadata.warnings = 0;

  return { success: true };
};

/**
 * Validate session hasn't been hijacked
 */
export const validateSessionIntegrity = (
  req: Request,
  metadata: SessionMetadata
): { isValid: boolean; reason?: string } => {
  const currentUserAgent = req.headers['user-agent'];
  const currentIp = req.ip;

  // Check user agent
  if (metadata.userAgent && metadata.userAgent !== currentUserAgent) {
    return {
      isValid: false,
      reason: 'User agent changed - possible session hijacking',
    };
  }

  // Check IP address (with some flexibility for proxies)
  if (metadata.ipAddress && metadata.ipAddress !== currentIp) {
    // Log but don't necessarily invalidate (proxies can change IPs)
    console.warn('[SESSION_IP_CHANGE]', {
      originalIp: metadata.ipAddress,
      currentIp,
      timestamp: new Date(),
    });
  }

  return { isValid: true };
};

/**
 * Session timeout middleware factory
 */
export const createSessionTimeoutMiddleware = (config: SessionConfig = DEFAULT_SESSION_CONFIG) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip session validation for certain paths
    if (req.path === '/auth/login' || req.path === '/auth/logout') {
      return next();
    }

    // Require authentication
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'NOT_AUTHENTICATED',
      });
    }

    const metadata = getSessionMetadata(req);

    // Check session integrity
    const integrityCheck = validateSessionIntegrity(req, metadata);
    if (!integrityCheck.isValid) {
      return res.status(401).json({
        error: 'Session validation failed',
        reason: integrityCheck.reason,
        code: 'SESSION_INVALID',
      });
    }

    // Check absolute expiration
    if (isSessionAbsolutelyExpired(metadata, config)) {
      req.logout?.((err) => {
        if (err) console.error('Logout error:', err);
      });

      return res.status(401).json({
        error: 'Session expired',
        code: 'SESSION_EXPIRED',
        expiredReason: 'absoluteTimeout',
      });
    }

    // Check inactivity
    if (isSessionInactive(metadata, config)) {
      req.logout?.((err) => {
        if (err) console.error('Logout error:', err);
      });

      return res.status(401).json({
        error: 'Session expired due to inactivity',
        code: 'SESSION_EXPIRED',
        expiredReason: 'inactivity',
      });
    }

    // Update activity timestamp if configured
    if (config.extendOnActivity) {
      updateActivityTimestamp(req);
    }

    // Add session info to response headers
    const timeRemaining = getSessionTimeRemaining(metadata, config);
    const inactivityRemaining = getInactivityTimeRemaining(metadata, config);

    res.setHeader('X-Session-Timeout-Remaining', Math.ceil(timeRemaining / 1000)); // seconds
    res.setHeader('X-Session-Inactivity-Remaining', Math.ceil(inactivityRemaining / 1000)); // seconds

    // Check if user should be warned
    if (shouldWarnUserAboutExpiration(metadata, config)) {
      metadata.warnings = (metadata.warnings || 0) + 1;
      res.setHeader('X-Session-Warning', 'Session expiring soon');
    }

    next();
  };
};

/**
 * API endpoint to check session status
 */
export const getSessionStatus = (req: Request, res: Response): void => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const metadata = getSessionMetadata(req);
  const config = DEFAULT_SESSION_CONFIG;

  const sessionAge = Date.now() - metadata.createdAt;
  const inactivityPeriod = Date.now() - metadata.lastActivityAt;

  res.json({
    authenticated: true,
    userId: (req.user as any).id,
    sessionAge: Math.ceil(sessionAge / 1000), // seconds
    inactivityPeriod: Math.ceil(inactivityPeriod / 1000), // seconds
    timeRemaining: Math.ceil(getSessionTimeRemaining(metadata, config) / 1000), // seconds
    inactivityTimeRemaining: Math.ceil(getInactivityTimeRemaining(metadata, config) / 1000), // seconds
    renewalCount: metadata.renewalCount,
    expiringsoon: shouldWarnUserAboutExpiration(metadata, config),
  });
};

/**
 * API endpoint to renew session
 */
export const renewSessionEndpoint = (req: Request, res: Response): void => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const result = renewSession(req);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      code: 'SESSION_RENEWAL_FAILED',
    });
  }

  const metadata = getSessionMetadata(req);
  const config = DEFAULT_SESSION_CONFIG;

  res.json({
    success: true,
    message: 'Session renewed',
    newTimeRemaining: Math.ceil(getSessionTimeRemaining(metadata, config) / 1000), // seconds
  });
};

/**
 * Logout and destroy session
 */
export const destroySession = (req: Request): void => {
  if (req.session) {
    req.session.destroy?.((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
    });
  }
};

/**
 * Session activity tracking for analytics
 */
export class SessionActivityTracker {
  private activityLog = new Map<string, { count: number; lastActivity: Date }>();

  /**
   * Track user activity
   */
  trackActivity(userId: string, activityType: string): void {
    const key = `${userId}:${activityType}`;
    const existing = this.activityLog.get(key) || { count: 0, lastActivity: new Date() };

    existing.count++;
    existing.lastActivity = new Date();
    this.activityLog.set(key, existing);

    console.log('[SESSION_ACTIVITY]', {
      userId,
      activityType,
      count: existing.count,
      timestamp: existing.lastActivity,
    });
  }

  /**
   * Get activity summary for user
   */
  getUserActivitySummary(userId: string): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [key, data] of this.activityLog.entries()) {
      if (key.startsWith(userId)) {
        const activityType = key.split(':')[1];
        summary[activityType] = data;
      }
    }

    return summary;
  }
}

export default {
  DEFAULT_SESSION_CONFIG,
  getSessionMetadata,
  updateActivityTimestamp,
  isSessionAbsolutelyExpired,
  isSessionInactive,
  getSessionTimeRemaining,
  getInactivityTimeRemaining,
  shouldWarnUserAboutExpiration,
  renewSession,
  validateSessionIntegrity,
  createSessionTimeoutMiddleware,
  getSessionStatus,
  renewSessionEndpoint,
  destroySession,
  SessionActivityTracker,
};
