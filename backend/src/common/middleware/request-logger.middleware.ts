/**
 * Request Logger Middleware
 * Logs all incoming requests and responses with timing information
 */

import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { LoggerService } from '../logger/logger.service'

declare global {
  namespace Express {
    interface Request {
      requestId: string
      startTime: number
      userId?: string | number
    }
  }
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Generate request ID if not provided
    const requestId = (req.headers['x-request-id'] as string) || uuidv4()
    req.requestId = requestId
    req.startTime = Date.now()

    // Set request ID in response headers
    res.setHeader('x-request-id', requestId)

    // Extract user ID from JWT or session if available
    if ((req as any).user?.id) {
      req.userId = (req as any).user.id
    }

    // Log incoming request
    this.logger.logRequest(req.method, req.path, requestId, req.userId)

    // Intercept response to log it
    const originalSend = res.send

    res.send = function (data: any) {
      const duration = Date.now() - req.startTime
      const statusCode = res.statusCode

      // Log outgoing response
      this.logger.logResponse(req.method, req.path, statusCode, duration, requestId, req.userId)

      // Call original send
      return originalSend.call(this, data)
    }

    next()
  }
}
