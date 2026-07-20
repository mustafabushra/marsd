/**
 * Error Codes and Messages (Frontend)
 * Mirrors backend error codes with user-friendly messages
 */

export const ErrorCode = {
  // Validation Errors
  INVALID_REQUEST: 'ERR_4001',
  VALIDATION_FAILED: 'ERR_4002',
  MISSING_REQUIRED_FIELD: 'ERR_4003',
  INVALID_EMAIL_FORMAT: 'ERR_4004',
  INVALID_PASSWORD_FORMAT: 'ERR_4005',

  // Authentication Errors
  UNAUTHORIZED: 'ERR_4100',
  INVALID_CREDENTIALS: 'ERR_4101',
  TOKEN_EXPIRED: 'ERR_4102',
  INVALID_TOKEN: 'ERR_4103',
  MISSING_TOKEN: 'ERR_4104',
  INSUFFICIENT_PERMISSIONS: 'ERR_4106',

  // Resource Errors
  RESOURCE_NOT_FOUND: 'ERR_4201',
  RESOURCE_ALREADY_EXISTS: 'ERR_4202',

  // Business Logic Errors
  INVALID_STATE_TRANSITION: 'ERR_4301',
  OPERATION_NOT_ALLOWED: 'ERR_4302',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'ERR_4401',
  TOO_MANY_REQUESTS: 'ERR_4403',

  // Server Errors
  INTERNAL_SERVER_ERROR: 'ERR_5000',
  DATABASE_ERROR: 'ERR_5001',
  EXTERNAL_SERVICE_ERROR: 'ERR_5002',
  SERVICE_UNAVAILABLE: 'ERR_5005',
}

/**
 * User-friendly error messages for common error codes
 */
export const ErrorMessages = {
  [ErrorCode.INVALID_REQUEST]: 'Invalid request. Please check your input.',
  [ErrorCode.VALIDATION_FAILED]: 'Please check the highlighted fields and try again.',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields.',
  [ErrorCode.INVALID_EMAIL_FORMAT]: 'Please enter a valid email address.',
  [ErrorCode.INVALID_PASSWORD_FORMAT]:
    'Password must be at least 8 characters with uppercase, lowercase, and numbers.',

  [ErrorCode.UNAUTHORIZED]: 'You are not authorized to perform this action.',
  [ErrorCode.INVALID_CREDENTIALS]: 'Email or password is incorrect.',
  [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCode.INVALID_TOKEN]: 'Invalid token. Please log in again.',
  [ErrorCode.MISSING_TOKEN]: 'Authorization required. Please log in.',
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action.',

  [ErrorCode.RESOURCE_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'This resource already exists.',

  [ErrorCode.INVALID_STATE_TRANSITION]: 'Invalid state transition. Please try again.',
  [ErrorCode.OPERATION_NOT_ALLOWED]: 'This operation is not allowed.',

  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait before trying again.',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests. Please wait before trying again.',

  [ErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred. Please try again later.',
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred. Please try again later.',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'An external service error occurred. Please try again later.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is currently unavailable. Please try again later.',
}

/**
 * Network error messages
 */
export const NetworkErrors = {
  TIMEOUT: 'Request timeout. Please check your internet connection.',
  NETWORK_ERROR: 'Network error. Please check your internet connection.',
  NO_INTERNET: 'No internet connection. Please check your connection.',
  CANCELLED: 'Request cancelled.',
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(errorCode, fallback = 'An error occurred. Please try again.') {
  return ErrorMessages[errorCode] || fallback
}

/**
 * Get HTTP status code from error code
 */
export function getHttpStatusCode(errorCode) {
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
 * Check if error is retryable
 */
export function isRetryable(errorCode) {
  const retryableCodes = [
    ErrorCode.INTERNAL_SERVER_ERROR,
    ErrorCode.DATABASE_ERROR,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
  ]

  return retryableCodes.includes(errorCode)
}

/**
 * Check if error requires re-authentication
 */
export function requiresReAuth(errorCode) {
  return [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.TOKEN_EXPIRED,
    ErrorCode.INVALID_TOKEN,
    ErrorCode.MISSING_TOKEN,
  ].includes(errorCode)
}
