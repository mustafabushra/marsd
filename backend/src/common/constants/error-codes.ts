/**
 * Error Codes and Messages
 * Structured error codes for API responses and logging
 */

export enum ErrorCode {
  // Validation Errors (4000-4099)
  INVALID_REQUEST = 'ERR_4001',
  VALIDATION_FAILED = 'ERR_4002',
  MISSING_REQUIRED_FIELD = 'ERR_4003',
  INVALID_EMAIL_FORMAT = 'ERR_4004',
  INVALID_PASSWORD_FORMAT = 'ERR_4005',
  INVALID_QUERY_PARAMETER = 'ERR_4006',

  // Authentication Errors (4100-4199)
  UNAUTHORIZED = 'ERR_4100',
  INVALID_CREDENTIALS = 'ERR_4101',
  TOKEN_EXPIRED = 'ERR_4102',
  INVALID_TOKEN = 'ERR_4103',
  MISSING_TOKEN = 'ERR_4104',
  TOKEN_REFRESH_FAILED = 'ERR_4105',
  INSUFFICIENT_PERMISSIONS = 'ERR_4106',

  // Resource Errors (4200-4299)
  RESOURCE_NOT_FOUND = 'ERR_4201',
  RESOURCE_ALREADY_EXISTS = 'ERR_4202',
  RESOURCE_DELETED = 'ERR_4203',
  RESOURCE_LOCKED = 'ERR_4204',
  INVALID_RESOURCE_ID = 'ERR_4205',
  RESOURCE_CONFLICT = 'ERR_4206',

  // Business Logic Errors (4300-4399)
  INVALID_STATE_TRANSITION = 'ERR_4301',
  OPERATION_NOT_ALLOWED = 'ERR_4302',
  INSUFFICIENT_FUNDS = 'ERR_4303',
  QUOTA_EXCEEDED = 'ERR_4304',
  DUPLICATE_SUBMISSION = 'ERR_4305',
  BUSINESS_RULE_VIOLATION = 'ERR_4306',

  // Rate Limiting & Throttling (4400-4499)
  RATE_LIMIT_EXCEEDED = 'ERR_4401',
  THROTTLED = 'ERR_4402',
  TOO_MANY_REQUESTS = 'ERR_4403',

  // Server Errors (5000-5999)
  INTERNAL_SERVER_ERROR = 'ERR_5000',
  DATABASE_ERROR = 'ERR_5001',
  EXTERNAL_SERVICE_ERROR = 'ERR_5002',
  CONFIGURATION_ERROR = 'ERR_5003',
  TIMEOUT_ERROR = 'ERR_5004',
  SERVICE_UNAVAILABLE = 'ERR_5005',
  DEPENDENCY_FAILED = 'ERR_5006',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  // Validation Errors
  [ErrorCode.INVALID_REQUEST]: 'Invalid request format',
  [ErrorCode.VALIDATION_FAILED]: 'Validation failed',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Missing required field: {field}',
  [ErrorCode.INVALID_EMAIL_FORMAT]: 'Invalid email format',
  [ErrorCode.INVALID_PASSWORD_FORMAT]: 'Password must be at least 8 characters with uppercase, lowercase, and numbers',
  [ErrorCode.INVALID_QUERY_PARAMETER]: 'Invalid query parameter: {param}',

  // Authentication Errors
  [ErrorCode.UNAUTHORIZED]: 'Unauthorized access',
  [ErrorCode.INVALID_CREDENTIALS]: 'Invalid email or password',
  [ErrorCode.TOKEN_EXPIRED]: 'Token has expired',
  [ErrorCode.INVALID_TOKEN]: 'Invalid or malformed token',
  [ErrorCode.MISSING_TOKEN]: 'Authorization token is required',
  [ErrorCode.TOKEN_REFRESH_FAILED]: 'Failed to refresh token',
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions for this action',

  // Resource Errors
  [ErrorCode.RESOURCE_NOT_FOUND]: '{resource} not found',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: '{resource} already exists',
  [ErrorCode.RESOURCE_DELETED]: '{resource} has been deleted',
  [ErrorCode.RESOURCE_LOCKED]: '{resource} is currently locked',
  [ErrorCode.INVALID_RESOURCE_ID]: 'Invalid {resource} ID',
  [ErrorCode.RESOURCE_CONFLICT]: 'Resource conflict: {details}',

  // Business Logic Errors
  [ErrorCode.INVALID_STATE_TRANSITION]: 'Cannot transition from {from} to {to}',
  [ErrorCode.OPERATION_NOT_ALLOWED]: 'Operation not allowed: {reason}',
  [ErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient funds available',
  [ErrorCode.QUOTA_EXCEEDED]: 'Quota exceeded for {resource}',
  [ErrorCode.DUPLICATE_SUBMISSION]: 'Duplicate submission detected',
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 'Business rule violation: {rule}',

  // Rate Limiting & Throttling
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please try again later.',
  [ErrorCode.THROTTLED]: 'Request throttled. Please wait before trying again.',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests. Please try again later.',

  // Server Errors
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred',
  [ErrorCode.DATABASE_ERROR]: 'Database operation failed',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'External service error: {service}',
  [ErrorCode.CONFIGURATION_ERROR]: 'Service configuration error',
  [ErrorCode.TIMEOUT_ERROR]: 'Request timeout',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is currently unavailable',
  [ErrorCode.DEPENDENCY_FAILED]: 'Required dependency failed: {dependency}',
}

/**
 * Get HTTP status code for error code
 */
export function getHttpStatusCode(errorCode: ErrorCode): number {
  const code = parseInt(errorCode.replace('ERR_', ''))

  if (code >= 4000 && code < 4100) return 400
  if (code >= 4100 && code < 4200) return 401
  if (code >= 4200 && code < 4300) return 404
  if (code >= 4300 && code < 4400) return 422
  if (code >= 4400 && code < 4500) return 429
  if (code >= 5000) return 500

  return 500
}

/**
 * Get retry-able error status
 */
export function isRetryable(errorCode: ErrorCode): boolean {
  const retryableCodes = [
    ErrorCode.TIMEOUT_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.DEPENDENCY_FAILED,
    ErrorCode.DATABASE_ERROR,
    ErrorCode.THROTTLED,
    ErrorCode.TOO_MANY_REQUESTS,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  ]

  return retryableCodes.includes(errorCode)
}
