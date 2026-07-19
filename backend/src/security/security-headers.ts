/**
 * Security Headers Module
 * Sets security-related HTTP response headers to protect against various attacks
 *
 * OWASP Reference: A05:2021 – Security Misconfiguration
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Security header configuration
 */
interface SecurityHeadersConfig {
  contentSecurityPolicy?: string | boolean;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean;
  crossOriginResourcePolicy?: string;
  strictTransportSecurity?: { maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  xContentTypeOptions?: string;
  xFrameOptions?: string;
  xPoweredBy?: boolean;
  xXssProtection?: string;
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
  customHeaders?: Record<string, string>;
}

/**
 * Set all security headers middleware
 */
export const setSecurityHeaders = (config: SecurityHeadersConfig = {}) => {
  const {
    contentSecurityPolicy = true,
    crossOriginEmbedderPolicy = true,
    crossOriginOpenerPolicy = true,
    crossOriginResourcePolicy = 'same-origin',
    strictTransportSecurity = {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions = 'nosniff',
    xFrameOptions = 'DENY',
    xPoweredBy = false,
    xXssProtection = '1; mode=block',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = {},
    customHeaders = {},
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy (CSP)
    // Prevents injection of unauthorized content
    if (contentSecurityPolicy) {
      const csp = typeof contentSecurityPolicy === 'string'
        ? contentSecurityPolicy
        : getDefaultCsp();
      res.setHeader('Content-Security-Policy', csp);
    }

    // Cross-Origin-Embedder-Policy
    // Prevents cross-origin access to cross-origin resources
    if (crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    // Cross-Origin-Opener-Policy
    // Isolates document from external pop-ups
    if (crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }

    // Cross-Origin-Resource-Policy
    // Restricts sharing of resources
    if (crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);
    }

    // Strict-Transport-Security (HSTS)
    // Forces HTTPS connections
    if (strictTransportSecurity && process.env.NODE_ENV === 'production') {
      const { maxAge = 31536000, includeSubDomains = true, preload = true } = strictTransportSecurity;
      let hstsValue = `max-age=${maxAge}`;
      if (includeSubDomains) hstsValue += '; includeSubDomains';
      if (preload) hstsValue += '; preload';
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // X-Content-Type-Options
    // Prevents MIME type sniffing
    if (xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', xContentTypeOptions);
    }

    // X-Frame-Options
    // Prevents clickjacking attacks
    if (xFrameOptions) {
      res.setHeader('X-Frame-Options', xFrameOptions);
    }

    // Remove X-Powered-By header
    // Hides server technology information
    if (xPoweredBy === false) {
      res.removeHeader('X-Powered-By');
    }

    // X-XSS-Protection
    // Legacy XSS protection (mostly superseded by CSP)
    if (xXssProtection) {
      res.setHeader('X-XSS-Protection', xXssProtection);
    }

    // Referrer-Policy
    // Controls how much referrer information is sent
    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    // Permissions-Policy (formerly Feature-Policy)
    // Controls which browser features can be used
    if (Object.keys(permissionsPolicy).length > 0) {
      const policyParts = Object.entries(permissionsPolicy).map(
        ([feature, allowlist]) => `${feature}=(${allowlist.join(' ')})`
      );
      res.setHeader('Permissions-Policy', policyParts.join(', '));
    }

    // Set custom headers
    for (const [header, value] of Object.entries(customHeaders)) {
      res.setHeader(header, value);
    }

    // Remove potentially sensitive headers
    res.removeHeader('Server');
    res.removeHeader('X-AspNet-Version');
    res.removeHeader('X-AspNetMvc-Version');

    next();
  };
};

/**
 * Get default Content Security Policy
 */
export const getDefaultCsp = (): string => {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Be more restrictive in production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
};

/**
 * Get strict Content Security Policy (recommended for production)
 */
export const getStrictCsp = (): string => {
  return [
    "default-src 'self'",
    "script-src 'self'", // No inline scripts
    "style-src 'self'",  // No inline styles
    "img-src 'self' data: https:",
    "font-src 'self' https:",
    "connect-src 'self' https://api.example.com",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
};

/**
 * Get CSP for single-page applications
 */
export const getSpaCsp = (apiUrl: string): string => {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    `connect-src 'self' ${apiUrl}`,
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
};

/**
 * Set secure cookie configuration
 */
export const setSecureCookieConfig = (
  secure: boolean = true,
  sameSite: 'Strict' | 'Lax' | 'None' = 'Lax'
): Record<string, any> => {
  return {
    httpOnly: true,      // Prevent JavaScript access
    secure: secure,      // HTTPS only
    sameSite: sameSite,  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
};

/**
 * Set HSTS header for HTTPS enforcement
 */
export const setHstsHeader = (
  res: Response,
  maxAge: number = 31536000, // 1 year
  includeSubDomains: boolean = true,
  preload: boolean = true
): void => {
  let value = `max-age=${maxAge}`;
  if (includeSubDomains) value += '; includeSubDomains';
  if (preload) value += '; preload';
  res.setHeader('Strict-Transport-Security', value);
};

/**
 * Set X-Frame-Options header to prevent clickjacking
 */
export const setXFrameOptionsHeader = (
  res: Response,
  mode: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM' = 'DENY',
  url?: string
): void => {
  if (mode === 'ALLOW-FROM' && url) {
    res.setHeader('X-Frame-Options', `ALLOW-FROM ${url}`);
  } else {
    res.setHeader('X-Frame-Options', mode);
  }
};

/**
 * Set CSP report-only header for testing
 */
export const setCspReportOnlyHeader = (res: Response, csp: string): void => {
  res.setHeader('Content-Security-Policy-Report-Only', csp);
};

/**
 * CSP report endpoint for logging violations
 */
export const handleCspViolation = (req: Request, res: Response): void => {
  try {
    const violation = req.body;

    console.warn('[CSP_VIOLATION]', {
      timestamp: new Date(),
      ip: req.ip,
      violation: violation['csp-report'],
    });

    // In production, send to monitoring service (e.g., Sentry, DataDog)
    // Example: sendToMonitoringService(violation);

    res.status(204).end();
  } catch (error) {
    console.error('[CSP_VIOLATION_PARSE_ERROR]', error);
    res.status(400).json({ error: 'Invalid CSP report' });
  }
};

/**
 * Permissions Policy builder
 */
export class PermissionsPolicyBuilder {
  private policies: Record<string, string[]> = {};

  /**
   * Allow feature for specific origins
   */
  allow(feature: string, origins: string[]): this {
    this.policies[feature] = origins;
    return this;
  }

  /**
   * Deny feature everywhere
   */
  deny(feature: string): this {
    this.policies[feature] = [];
    return this;
  }

  /**
   * Allow feature for all origins
   */
  allowAll(feature: string): this {
    this.policies[feature] = ['*'];
    return this;
  }

  /**
   * Build Permissions-Policy header value
   */
  build(): string {
    return Object.entries(this.policies)
      .map(([feature, origins]) => {
        if (origins.length === 0) {
          return `${feature}=()`;
        }
        return `${feature}=(${origins.join(' ')})`;
      })
      .join(', ');
  }

  /**
   * Get restrictive policy (disable most features)
   */
  static getStrict(): string {
    return new PermissionsPolicyBuilder()
      .deny('camera')
      .deny('microphone')
      .deny('geolocation')
      .deny('accelerometer')
      .deny('gyroscope')
      .deny('magnetometer')
      .deny('usb')
      .deny('payment')
      .allow('fullscreen', ['self'])
      .build();
  }

  /**
   * Get moderate policy (allow some features)
   */
  static getModerate(): string {
    return new PermissionsPolicyBuilder()
      .allow('camera', ['self'])
      .allow('microphone', ['self'])
      .allow('geolocation', ['self'])
      .allow('fullscreen', ['self'])
      .deny('usb')
      .deny('payment')
      .build();
  }
}

/**
 * Security headers builder for easy configuration
 */
export class SecurityHeadersBuilder {
  private config: SecurityHeadersConfig = {};

  /**
   * Set CSP
   */
  setCsp(csp: string | boolean): this {
    this.config.contentSecurityPolicy = csp;
    return this;
  }

  /**
   * Set X-Frame-Options
   */
  setXFrameOptions(value: string): this {
    this.config.xFrameOptions = value;
    return this;
  }

  /**
   * Set HSTS
   */
  setHsts(maxAge: number, includeSubDomains: boolean = true, preload: boolean = true): this {
    this.config.strictTransportSecurity = { maxAge, includeSubDomains, preload };
    return this;
  }

  /**
   * Set referrer policy
   */
  setReferrerPolicy(policy: string): this {
    this.config.referrerPolicy = policy;
    return this;
  }

  /**
   * Set permissions policy
   */
  setPermissionsPolicy(policy: Record<string, string[]>): this {
    this.config.permissionsPolicy = policy;
    return this;
  }

  /**
   * Add custom header
   */
  addCustomHeader(name: string, value: string): this {
    this.config.customHeaders = this.config.customHeaders || {};
    this.config.customHeaders[name] = value;
    return this;
  }

  /**
   * Build middleware
   */
  build() {
    return setSecurityHeaders(this.config);
  }

  /**
   * Get default security headers
   */
  static getDefault() {
    return new SecurityHeadersBuilder()
      .setCsp(getDefaultCsp())
      .setXFrameOptions('DENY')
      .setHsts(31536000, true, true)
      .setReferrerPolicy('strict-origin-when-cross-origin')
      .build();
  }

  /**
   * Get strict security headers (production recommended)
   */
  static getStrict() {
    return new SecurityHeadersBuilder()
      .setCsp(getStrictCsp())
      .setXFrameOptions('DENY')
      .setHsts(31536000, true, true)
      .setReferrerPolicy('strict-origin-when-cross-origin')
      .setPermissionsPolicy({
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
      })
      .build();
  }
}

export default {
  setSecurityHeaders,
  getDefaultCsp,
  getStrictCsp,
  getSpaCsp,
  setSecureCookieConfig,
  setHstsHeader,
  setXFrameOptionsHeader,
  setCspReportOnlyHeader,
  handleCspViolation,
  PermissionsPolicyBuilder,
  SecurityHeadersBuilder,
};
