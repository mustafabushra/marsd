/**
 * Logger Service with Winston
 * Comprehensive logging with structured output, rotation, and filtering
 */

import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { ErrorCode } from '../constants/error-codes'

export interface LogContext {
  userId?: string | number
  tenantId?: string | number
  requestId?: string
  path?: string
  method?: string
  statusCode?: number
  duration?: number
  [key: string]: any
}

export interface ErrorLogContext extends LogContext {
  error?: Error
  stack?: string
  errorCode?: ErrorCode
  details?: Record<string, any>
}

@Injectable()
export class LoggerService {
  private readonly logger = new Logger('Marsad')
  private readonly logsDir = path.join(process.cwd(), 'logs')
  private readonly isDevelopment = process.env.NODE_ENV === 'development'
  private readonly isProduction = process.env.NODE_ENV === 'production'

  constructor() {
    this.ensureLogsDirectory()
  }

  /**
   * Ensure logs directory exists
   */
  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }
  }

  /**
   * Get logs file path
   */
  private getLogFilePath(type: string): string {
    const timestamp = new Date().toISOString().split('T')[0]
    return path.join(this.logsDir, `${type}-${timestamp}.log`)
  }

  /**
   * Write log to file
   */
  private writeLogFile(type: string, message: string, data?: any): void {
    try {
      const logPath = this.getLogFilePath(type)
      const timestamp = new Date().toISOString()
      const logEntry = {
        timestamp,
        level: type.toUpperCase(),
        message,
        ...(data && { data }),
      }

      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf8')
    } catch (error) {
      this.logger.error('Failed to write log file', error)
    }
  }

  /**
   * Log info level message
   */
  info(message: string, context?: LogContext): void {
    const contextStr = context ? JSON.stringify(context) : ''
    this.logger.log(`${message} ${contextStr}`)

    if (this.isProduction) {
      this.writeLogFile('info', message, context)
    }
  }

  /**
   * Log warning level message
   */
  warn(message: string, context?: LogContext): void {
    const contextStr = context ? JSON.stringify(context) : ''
    this.logger.warn(`${message} ${contextStr}`)

    if (this.isProduction) {
      this.writeLogFile('warn', message, context)
    }
  }

  /**
   * Log error with full context
   */
  error(message: string, context: ErrorLogContext = {}): void {
    const { error, stack, errorCode, details, ...ctx } = context

    const errorInfo = {
      code: errorCode,
      message: error?.message || message,
      stack: stack || error?.stack,
      details,
      context: ctx,
    }

    this.logger.error(message, JSON.stringify(errorInfo))
    this.writeLogFile('error', message, errorInfo)
  }

  /**
   * Log debug level message
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const contextStr = context ? JSON.stringify(context) : ''
      this.logger.debug(`${message} ${contextStr}`)
    }

    if (this.isProduction) {
      this.writeLogFile('debug', message, context)
    }
  }

  /**
   * Log API request
   */
  logRequest(method: string, path: string, requestId: string, userId?: string | number): void {
    this.info('Incoming request', {
      method,
      path,
      requestId,
      userId,
    })
  }

  /**
   * Log API response
   */
  logResponse(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    requestId: string,
    userId?: string | number,
  ): void {
    this.info('Outgoing response', {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      requestId,
      userId,
    })
  }

  /**
   * Log authentication event
   */
  logAuth(event: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'MFA', userId?: string | number, details?: any): void {
    this.info(`Authentication event: ${event}`, {
      userId,
      event,
      ...details,
    })
  }

  /**
   * Log authorization check
   */
  logAuthorization(
    allowed: boolean,
    resource: string,
    action: string,
    userId?: string | number,
    reason?: string,
  ): void {
    const level = allowed ? 'info' : 'warn'
    const message = allowed ? 'Authorization granted' : 'Authorization denied'

    if (level === 'info') {
      this.info(message, {
        userId,
        resource,
        action,
      })
    } else {
      this.warn(message, {
        userId,
        resource,
        action,
        reason,
      })
    }
  }

  /**
   * Log database operation
   */
  logDatabase(operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', duration: number, requestId?: string): void {
    this.debug('Database operation', {
      operation,
      duration: `${duration}ms`,
      requestId,
    })
  }

  /**
   * Log external service call
   */
  logExternalService(
    serviceName: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    requestId?: string,
  ): void {
    this.info('External service call', {
      service: serviceName,
      endpoint,
      statusCode,
      duration: `${duration}ms`,
      requestId,
    })
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    userId?: string | number,
    details?: any,
  ): void {
    const level = severity === 'CRITICAL' || severity === 'HIGH' ? 'error' : 'warn'

    if (level === 'error') {
      this.error(`Security event: ${event}`, {
        userId,
        severity,
        details,
      })
    } else {
      this.warn(`Security event: ${event}`, {
        userId,
        severity,
        details,
      })
    }
  }

  /**
   * Log rate limit hit
   */
  logRateLimit(identifier: string, limit: number, window: string): void {
    this.warn('Rate limit exceeded', {
      identifier,
      limit,
      window,
    })
  }

  /**
   * Clean old log files (older than N days)
   */
  cleanOldLogs(daysToKeep: number = 30): void {
    try {
      if (!fs.existsSync(this.logsDir)) {
        return
      }

      const files = fs.readdirSync(this.logsDir)
      const now = Date.now()
      const millisecondsPerDay = 24 * 60 * 60 * 1000

      files.forEach((file) => {
        const filePath = path.join(this.logsDir, file)
        const stat = fs.statSync(filePath)
        const fileAge = now - stat.mtimeMs

        if (fileAge > daysToKeep * millisecondsPerDay) {
          fs.unlinkSync(filePath)
          this.info(`Deleted old log file: ${file}`)
        }
      })
    } catch (error) {
      this.error('Failed to clean old logs', { error })
    }
  }
}
