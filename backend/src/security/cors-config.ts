/**
 * CORS Configuration Module
 * Implements Cross-Origin Resource Sharing (CORS) security controls
 * Prevents unauthorized cross-origin requests
 *
 * OWASP Reference: A01:2021 – Broken Access Control
 */

import { CorsOptions } from 'cors';

/**
 * Whitelist of allowed origins in different environments
 * Each origin represents a trusted client that can make requests to the API
 */
const allowedOrigins = {
  development: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ],
  staging: [
    'https://staging.marsad.com',
    'https://staging-app.marsad.com',
  ],
  production: [
    'https://marsad.com',
    'https://www.marsad.com',
    'https://app.marsad.com',
  ],
};

/**
 * Allowed HTTP methods for CORS
 * Restrict to necessary methods only
 */
const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

/**
 * Allowed headers that clients can send
 * Only essential headers are whitelisted
 */
const allowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-CSRF-Token',
  'Accept',
  'Accept-Language',
  'Accept-Encoding',
  'X-API-Key',
];

/**
 * Headers that can be exposed to the client
 * Only necessary response headers are exposed
 */
const exposedHeaders = [
  'X-Total-Count',
  'X-Page-Number',
  'X-Total-Pages',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Content-Disposition',
];

/**
 * Dynamically determine CORS options based on environment
 * @param origin - The requesting origin
 * @returns Callback for CORS middleware
 */
export const getCorsOptions = (): CorsOptions => {
  const environment = process.env.NODE_ENV || 'development';
  const origins = allowedOrigins[environment as keyof typeof allowedOrigins] || allowedOrigins.development;

  return {
    /**
     * Callback to validate origin
     * Only allow requests from whitelisted origins
     */
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in whitelist
      if (origins.includes(origin)) {
        callback(null, true);
      } else {
        // Reject requests from unknown origins
        const error = new Error(`CORS policy: Origin ${origin} is not allowed`);
        callback(error);
      }
    },

    /**
     * Allow credentials (cookies, authorization headers)
     * Essential for maintaining authenticated sessions
     */
    credentials: true,

    /**
     * Allowed HTTP methods
     */
    methods: allowedMethods,

    /**
     * Allowed request headers
     */
    allowedHeaders: allowedHeaders,

    /**
     * Headers to expose to the browser
     */
    exposedHeaders: exposedHeaders,

    /**
     * How long (in seconds) the results of a preflight request can be cached
     * Reduce to 1 hour (3600 seconds) for enhanced security
     */
    maxAge: 3600,

    /**
     * Success status for CORS requests
     */
    optionsSuccessStatus: 200,
  };
};

/**
 * Restrictive CORS configuration for sensitive endpoints
 * Use for endpoints that require extra protection
 */
export const getRestrictiveCorsOptions = (): CorsOptions => {
  const environment = process.env.NODE_ENV || 'development';
  const origins = allowedOrigins[environment as keyof typeof allowedOrigins] || allowedOrigins.development;

  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 1800, // 30 minutes
    optionsSuccessStatus: 200,
  };
};

/**
 * CORS configuration for public endpoints
 * Use for endpoints that don't require authentication
 */
export const getPublicCorsOptions = (): CorsOptions => {
  return {
    origin: '*', // Allow all origins for public endpoints
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 7200, // 2 hours
    optionsSuccessStatus: 200,
  };
};

/**
 * Validate and sanitize CORS origin headers
 * Additional validation layer for origin checking
 */
export const validateOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true; // Allow requests without origin
  }

  try {
    const url = new URL(origin);
    const environment = process.env.NODE_ENV || 'development';
    const allowedList = allowedOrigins[environment as keyof typeof allowedOrigins] || allowedOrigins.development;

    return allowedList.includes(origin);
  } catch {
    return false; // Invalid URL format
  }
};

export default {
  getCorsOptions,
  getRestrictiveCorsOptions,
  getPublicCorsOptions,
  validateOrigin,
};
