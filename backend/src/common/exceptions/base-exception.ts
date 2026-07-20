/**
 * Base Custom Exception
 * All application exceptions inherit from this
 */

import { HttpException } from '@nestjs/common'
import { ErrorCode, ErrorMessages, getHttpStatusCode } from '../constants/error-codes'

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, any>
    timestamp: string
    path?: string
    requestId?: string
  }
}

export class BaseException extends HttpException {
  public readonly errorCode: ErrorCode
  public readonly details?: Record<string, any>
  public readonly requestId?: string

  constructor(
    errorCode: ErrorCode,
    message?: string,
    details?: Record<string, any>,
    requestId?: string,
  ) {
    const statusCode = getHttpStatusCode(errorCode)
    const formattedMessage = message || ErrorMessages[errorCode]

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: errorCode,
        message: formattedMessage,
        details: details,
        timestamp: new Date().toISOString(),
        requestId,
      },
    }

    super(response, statusCode)

    this.errorCode = errorCode
    this.details = details
    this.requestId = requestId

    // Maintain proper stack trace
    Object.setPrototypeOf(this, BaseException.prototype)
  }

  public toJSON(): ApiErrorResponse {
    return this.getResponse() as ApiErrorResponse
  }
}
