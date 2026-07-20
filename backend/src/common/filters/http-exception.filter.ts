/**
 * Global HTTP Exception Filter
 * Catches all exceptions and formats them into standardized API responses
 */

import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { Request, Response } from 'express'
import { BaseException, ApiErrorResponse } from '../exceptions/base-exception'
import { LoggerService } from '../logger/logger.service'
import { ErrorCode, ErrorMessages } from '../constants/error-codes'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LoggerService) private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest<Request>()
    const response = ctx.getResponse<Response>()
    const requestId = request.headers['x-request-id'] as string || 'unknown'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let errorResponse: ApiErrorResponse

    if (exception instanceof BaseException) {
      // Handle custom application exceptions
      status = exception.getStatus()
      errorResponse = exception.toJSON()
    } else if (exception instanceof HttpException) {
      // Handle NestJS built-in exceptions
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        const messages = (exceptionResponse as any).message
        const message = Array.isArray(messages) ? messages.join(', ') : messages

        errorResponse = {
          success: false,
          error: {
            code: this.getErrorCode(status),
            message: message || ErrorMessages[ErrorCode.INVALID_REQUEST],
            timestamp: new Date().toISOString(),
            path: request.path,
            requestId,
          },
        }
      } else {
        errorResponse = {
          success: false,
          error: {
            code: this.getErrorCode(status),
            message: exception.message || ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR],
            timestamp: new Date().toISOString(),
            path: request.path,
            requestId,
          },
        }
      }
    } else if (exception instanceof Error) {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR

      errorResponse = {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR],
          timestamp: new Date().toISOString(),
          path: request.path,
          requestId,
        },
      }

      // Log unexpected error with full details
      this.logger.error('Unexpected error', {
        error: exception,
        stack: exception.stack,
        path: request.path,
        method: request.method,
        requestId,
      })
    } else {
      // Handle completely unknown errors
      status = HttpStatus.INTERNAL_SERVER_ERROR

      errorResponse = {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR],
          timestamp: new Date().toISOString(),
          path: request.path,
          requestId,
        },
      }
    }

    // Log the error response
    if (status >= 400 && status < 500) {
      this.logger.warn('Client error', {
        statusCode: status,
        errorCode: errorResponse.error.code,
        path: request.path,
        method: request.method,
        requestId,
      })
    } else if (status >= 500) {
      this.logger.error('Server error', {
        statusCode: status,
        errorCode: errorResponse.error.code,
        path: request.path,
        method: request.method,
        requestId,
      })
    }

    // Set response headers
    response.status(status).json(errorResponse)
  }

  /**
   * Get error code from HTTP status code
   */
  private getErrorCode(statusCode: number): ErrorCode {
    const errorCodeMap: Record<number, ErrorCode> = {
      400: ErrorCode.INVALID_REQUEST,
      401: ErrorCode.UNAUTHORIZED,
      403: ErrorCode.INSUFFICIENT_PERMISSIONS,
      404: ErrorCode.RESOURCE_NOT_FOUND,
      409: ErrorCode.RESOURCE_CONFLICT,
      422: ErrorCode.BUSINESS_RULE_VIOLATION,
      429: ErrorCode.RATE_LIMIT_EXCEEDED,
      500: ErrorCode.INTERNAL_SERVER_ERROR,
      502: ErrorCode.EXTERNAL_SERVICE_ERROR,
      503: ErrorCode.SERVICE_UNAVAILABLE,
    }

    return errorCodeMap[statusCode] || ErrorCode.INTERNAL_SERVER_ERROR
  }
}
