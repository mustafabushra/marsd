import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../logging/logger.service';
import { metricsService } from '../monitoring/metrics.service';

export interface RequestWithContext extends Request {
  requestId?: string;
  startTime?: number;
  userId?: string;
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService('RequestLogger');
  }

  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const startTime = Date.now();

    // Attach request ID and context to request object
    req.requestId = requestId;
    req.startTime = startTime;

    // Extract user ID from JWT if available
    if ((req as any).user) {
      req.userId = (req as any).user.id;
    }

    // Set context for logger
    this.logger.setContext({
      requestId,
      userId: req.userId,
    });

    // Capture response data
    const originalSend = res.send;
    let responseBody = '';

    res.send = function (data: any) {
      responseBody = typeof data === 'string' ? data : JSON.stringify(data);
      return originalSend.call(this, data);
    };

    // Log request details
    this.logger.info(`Incoming request: ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: this.sanitizeHeaders(req.headers),
    });

    // Handle response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Log response
      this.logger.logRequest(req.method, req.path, statusCode, duration, {
        requestId,
        userId: req.userId,
        contentLength: res.get('content-length'),
      });

      // Record metrics
      metricsService.recordHttpRequest(
        req.method,
        req.path,
        statusCode,
        duration,
        {
          userId: req.userId,
        },
      );

      // Alert on slow requests
      if (duration > 5000) {
        this.logger.warn(`Slow request detected: ${req.method} ${req.path}`, {
          duration,
          requestId,
          statusCode,
        });
      }

      // Alert on errors
      if (statusCode >= 400) {
        const severity = statusCode >= 500 ? 'HIGH' : 'MEDIUM';
        this.logger.logSecurityEvent(`HTTP ${statusCode} Error`, severity, {
          method: req.method,
          path: req.path,
          statusCode,
          requestId,
          responseBody: this.truncateBody(responseBody),
        });
      }
    });

    // Handle errors
    res.on('error', (error: Error) => {
      this.logger.error(`Response error on ${req.method} ${req.path}`, error, {
        requestId,
        userId: req.userId,
      });
    });

    next();
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-access-token',
    ];

    sensitiveHeaders.forEach((header) => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private truncateBody(body: string, maxLength: number = 500): string {
    if (!body) return '';
    if (body.length <= maxLength) return body;
    return body.substring(0, maxLength) + '...[truncated]';
  }
}
