/**
 * CSRF (Cross-Site Request Forgery) Protection Module
 * Implements token-based CSRF protection for state-changing operations
 *
 * OWASP Reference: A01:2021 – Broken Access Control
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * CSRF token configuration
 */
interface CsrfConfig {
  tokenLength?: number;
  tokenFieldName?: string;
  headerFieldName?: string;
  excludedMethods?: string[];
  excludedPaths?: string[];
}

/**
 * Generate cryptographically secure random token
 */
export const generateCsrfToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash CSRF token for storage
 * Store hashed version in session/database
 */
export const hashCsrfToken = (token: string): string => {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
};

/**
 * Verify CSRF token
 * Compare hashed token from request with hashed token from storage
 */
export const verifyCsrfToken = (tokenFromRequest: string, hashedTokenFromStorage: string): boolean => {
  try {
    const hashedRequest = hashCsrfToken(tokenFromRequest);
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(hashedRequest), Buffer.from(hashedTokenFromStorage));
  } catch {
    return false;
  }
};

/**
 * Store CSRF token in session/request
 * Returns token to send to client
 */
export const storeCsrfToken = (req: Request, token?: string): string => {
  const csrfToken = token || generateCsrfToken();
  const hashedToken = hashCsrfToken(csrfToken);

  // Store hashed token in session
  if (!req.session) {
    req.session = {};
  }
  req.session.csrfToken = hashedToken;

  // Return plain token for client
  return csrfToken;
};

/**
 * Get CSRF token from session
 */
export const getCsrfTokenFromSession = (req: Request): string | undefined => {
  return (req.session as any)?.csrfToken;
};

/**
 * Extract CSRF token from request
 * Checks multiple locations: body, headers, query parameters
 */
export const extractCsrfToken = (
  req: Request,
  options: { fieldName?: string; headerName?: string } = {}
): string | undefined => {
  const fieldName = options.fieldName || '_csrf';
  const headerName = options.headerName || 'x-csrf-token';

  // Check request body (for POST/PUT/PATCH)
  if (req.body && typeof req.body === 'object' && fieldName in req.body) {
    return req.body[fieldName];
  }

  // Check request headers
  const headerValue = req.headers[headerName.toLowerCase()];
  if (headerValue) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  // Check query parameters
  if (req.query && fieldName in req.query) {
    const queryValue = req.query[fieldName];
    return Array.isArray(queryValue) ? queryValue[0] : queryValue;
  }

  return undefined;
};

/**
 * CSRF protection middleware factory
 */
export const createCsrfMiddleware = (config: CsrfConfig = {}) => {
  const {
    tokenLength = 32,
    tokenFieldName = '_csrf',
    headerFieldName = 'x-csrf-token',
    excludedMethods = ['GET', 'HEAD', 'OPTIONS'],
    excludedPaths = [],
  } = config;

  /**
   * Middleware to generate and send CSRF token
   * Use on pages that render forms (GET requests)
   */
  const generateToken = (req: Request, res: Response, next: NextFunction): void => {
    let token = getCsrfTokenFromSession(req);

    if (!token) {
      const newToken = generateCsrfToken(tokenLength);
      token = storeCsrfToken(req, newToken);
    }

    // Make token available on response locals
    res.locals.csrfToken = token;

    // Also set as response header for AJAX requests
    res.setHeader('X-CSRF-Token', token);

    next();
  };

  /**
   * Middleware to verify CSRF token
   * Use on routes that modify state (POST, PUT, DELETE, PATCH)
   */
  const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF verification for certain methods
    if (excludedMethods.includes(req.method)) {
      return next();
    }

    // Skip CSRF verification for certain paths
    if (excludedPaths.some(path => req.path.includes(path))) {
      return next();
    }

    // Extract token from request
    const requestToken = extractCsrfToken(req, {
      fieldName: tokenFieldName,
      headerName: headerFieldName,
    });

    if (!requestToken) {
      return res.status(403).json({
        error: 'CSRF token missing',
        code: 'CSRF_TOKEN_MISSING',
      });
    }

    // Get stored token from session
    const storedToken = getCsrfTokenFromSession(req);

    if (!storedToken) {
      return res.status(403).json({
        error: 'CSRF token not found in session',
        code: 'CSRF_TOKEN_NOT_FOUND',
      });
    }

    // Verify token
    if (!verifyCsrfToken(requestToken, storedToken)) {
      // Log CSRF token mismatch for security monitoring
      console.warn('[CSRF_MISMATCH]', {
        ip: req.ip,
        userId: (req as any).user?.id,
        path: req.path,
        method: req.method,
        timestamp: new Date(),
      });

      return res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    // Regenerate token after successful verification (optional but recommended)
    const newToken = generateCsrfToken(tokenLength);
    storeCsrfToken(req, newToken);
    res.setHeader('X-CSRF-Token', newToken);

    next();
  };

  return {
    generateToken,
    verifyToken,
  };
};

/**
 * Helper to add CSRF token to forms (for server-side rendering)
 */
export const renderCsrfInput = (token: string, fieldName: string = '_csrf'): string => {
  return `<input type="hidden" name="${fieldName}" value="${token}" />`;
};

/**
 * Helper to render CSRF meta tag (for JavaScript to read)
 */
export const renderCsrfMetaTag = (token: string, tagName: string = 'csrf-token'): string => {
  return `<meta name="${tagName}" content="${token}" />`;
};

/**
 * Get CSRF token from meta tag (client-side)
 */
export const getCsrfTokenFromMetaTag = (tagName: string = 'csrf-token'): string | null => {
  if (typeof document === 'undefined') return null;

  const metaTag = document.querySelector(`meta[name="${tagName}"]`);
  return metaTag?.getAttribute('content') || null;
};

/**
 * Double-submit cookie pattern CSRF protection
 * Alternative to token-based approach
 */
export const createDoubleSubmitCookieProtection = () => {
  /**
   * Generate cookie value
   */
  const generateCookieValue = (length: number = 32): string => {
    return generateCsrfToken(length);
  };

  /**
   * Set CSRF cookie
   */
  const setCsrfCookie = (
    res: Response,
    cookieName: string = 'csrfToken',
    maxAge: number = 24 * 60 * 60 * 1000
  ): string => {
    const value = generateCookieValue();

    res.cookie(cookieName, value, {
      httpOnly: false, // Accessible to JavaScript for double-submit pattern
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge,
    });

    return value;
  };

  /**
   * Verify double-submit cookie
   */
  const verifyDoubleSubmit = (
    req: Request,
    res: Response,
    cookieName: string = 'csrfToken',
    headerName: string = 'x-csrf-token'
  ): boolean => {
    const cookieValue = req.cookies[cookieName];
    const headerValue = req.headers[headerName.toLowerCase()];

    if (!cookieValue || !headerValue) {
      return false;
    }

    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    // Use constant-time comparison
    try {
      return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(header));
    } catch {
      return false;
    }
  };

  return {
    generateCookieValue,
    setCsrfCookie,
    verifyDoubleSubmit,
  };
};

/**
 * SameSite cookie attribute helper
 * Provides protection against CSRF via cookie policy
 */
export const getSameSiteCookieConfig = (
  environment: string = process.env.NODE_ENV || 'development'
) => {
  const isProduction = environment === 'production';

  return {
    // Strict: Cookie only sent in same-site contexts (safest)
    strict: {
      secure: isProduction,
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },

    // Lax: Cookie sent for same-site contexts + safe cross-site requests (recommended)
    lax: {
      secure: isProduction,
      httpOnly: true,
      sameSite: 'lax' as const,
      maxAge: 24 * 60 * 60 * 1000,
    },

    // None: Cookie sent in all contexts (requires secure flag)
    none: {
      secure: true, // Must be secure when sameSite=none
      httpOnly: true,
      sameSite: 'none' as const,
      maxAge: 24 * 60 * 60 * 1000,
    },
  };
};

/**
 * CSRF validation for API requests
 * Use for AJAX requests that need CSRF protection
 */
export const validateCsrfForApi = (req: Request, res: Response, next: NextFunction): void => {
  // Skip GET requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // For API requests, CSRF token should come from header
  const csrfToken = req.headers['x-csrf-token'];

  if (!csrfToken) {
    return res.status(403).json({
      error: 'CSRF token required',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  // Verify token against session
  const storedToken = (req.session as any)?.csrfToken;

  if (!storedToken) {
    return res.status(403).json({
      error: 'No CSRF token in session',
      code: 'CSRF_TOKEN_NOT_FOUND',
    });
  }

  const token = Array.isArray(csrfToken) ? csrfToken[0] : csrfToken;

  if (!verifyCsrfToken(token, storedToken)) {
    console.warn('[CSRF_VALIDATION_FAILED]', {
      ip: req.ip,
      userId: (req as any).user?.id,
      path: req.path,
    });

    return res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  next();
};

export default {
  generateCsrfToken,
  hashCsrfToken,
  verifyCsrfToken,
  storeCsrfToken,
  getCsrfTokenFromSession,
  extractCsrfToken,
  createCsrfMiddleware,
  renderCsrfInput,
  renderCsrfMetaTag,
  getCsrfTokenFromMetaTag,
  createDoubleSubmitCookieProtection,
  getSameSiteCookieConfig,
  validateCsrfForApi,
};
