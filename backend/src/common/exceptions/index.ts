/**
 * Custom Exception Classes
 */

import { BaseException } from './base-exception'
import { ErrorCode } from '../constants/error-codes'

/**
 * Validation Exception
 * Used for input validation errors (400)
 */
export class ValidationException extends BaseException {
  constructor(message?: string, details?: Record<string, any>, requestId?: string) {
    super(ErrorCode.VALIDATION_FAILED, message, details, requestId)
    Object.setPrototypeOf(this, ValidationException.prototype)
  }
}

/**
 * Authentication Exception
 * Used for authentication errors (401)
 */
export class AuthenticationException extends BaseException {
  constructor(
    errorCode: ErrorCode = ErrorCode.UNAUTHORIZED,
    message?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    super(errorCode, message, details, requestId)
    Object.setPrototypeOf(this, AuthenticationException.prototype)
  }
}

/**
 * Authorization Exception
 * Used for permission/access errors (403)
 */
export class AuthorizationException extends BaseException {
  constructor(message?: string, details?: Record<string, any>, requestId?: string) {
    super(ErrorCode.INSUFFICIENT_PERMISSIONS, message, details, requestId)
    Object.setPrototypeOf(this, AuthorizationException.prototype)
  }
}

/**
 * Not Found Exception
 * Used when resource doesn't exist (404)
 */
export class NotFoundException extends BaseException {
  constructor(resource: string, id?: string | number, requestId?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`
    super(ErrorCode.RESOURCE_NOT_FOUND, message, { resource, id }, requestId)
    Object.setPrototypeOf(this, NotFoundException.prototype)
  }
}

/**
 * Conflict Exception
 * Used for duplicate or conflict errors (409)
 */
export class ConflictException extends BaseException {
  constructor(resource: string, details?: Record<string, any>, requestId?: string) {
    const message = `${resource} already exists`
    super(ErrorCode.RESOURCE_ALREADY_EXISTS, message, { resource, ...details }, requestId)
    Object.setPrototypeOf(this, ConflictException.prototype)
  }
}

/**
 * Business Rule Exception
 * Used for business logic violations (422)
 */
export class BusinessRuleException extends BaseException {
  constructor(
    errorCode: ErrorCode,
    message?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    super(errorCode, message, details, requestId)
    Object.setPrototypeOf(this, BusinessRuleException.prototype)
  }
}

/**
 * Rate Limit Exception
 * Used when rate limits are exceeded (429)
 */
export class RateLimitException extends BaseException {
  public readonly retryAfter: number

  constructor(retryAfterSeconds: number = 60, requestId?: string) {
    super(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Rate limit exceeded. Please try again later.',
      { retryAfterSeconds },
      requestId,
    )
    this.retryAfter = retryAfterSeconds
    Object.setPrototypeOf(this, RateLimitException.prototype)
  }
}

/**
 * Internal Server Exception
 * Used for unexpected server errors (500)
 */
export class InternalServerException extends BaseException {
  constructor(
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    message?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    super(errorCode, message, details, requestId)
    Object.setPrototypeOf(this, InternalServerException.prototype)
  }
}

/**
 * Database Exception
 * Used for database operation errors (500)
 */
export class DatabaseException extends BaseException {
  constructor(message?: string, details?: Record<string, any>, requestId?: string) {
    super(ErrorCode.DATABASE_ERROR, message, details, requestId)
    Object.setPrototypeOf(this, DatabaseException.prototype)
  }
}

/**
 * External Service Exception
 * Used for third-party service errors (502/503)
 */
export class ExternalServiceException extends BaseException {
  constructor(
    serviceName: string,
    message?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    super(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      message || `${serviceName} service error`,
      { service: serviceName, ...details },
      requestId,
    )
    Object.setPrototypeOf(this, ExternalServiceException.prototype)
  }
}

/**
 * Service Unavailable Exception
 * Used when service is temporarily unavailable (503)
 */
export class ServiceUnavailableException extends BaseException {
  constructor(message?: string, details?: Record<string, any>, requestId?: string) {
    super(ErrorCode.SERVICE_UNAVAILABLE, message, details, requestId)
    Object.setPrototypeOf(this, ServiceUnavailableException.prototype)
  }
}

export { BaseException }
