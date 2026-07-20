import * as winston from 'winston';
import * as path from 'path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogContext {
  userId?: string;
  requestId?: string;
  timestamp?: string;
  [key: string]: any;
}

export class LoggerService {
  private logger: winston.Logger;
  private context: LogContext = {};

  constructor(module?: string) {
    const logDir = path.join(process.cwd(), 'logs');

    // Define log format
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
      winston.format.printf((info) => {
        const meta = { ...info, level: undefined, message: undefined, timestamp: undefined };
        return JSON.stringify({
          timestamp: info.timestamp,
          level: info.level.toUpperCase(),
          module: module || 'App',
          message: info.message,
          ...(Object.keys(meta).length > 0 && { metadata: meta }),
          ...(info.stack && { stack: info.stack }),
        });
      }),
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf((info) => {
        const prefix = `[${info.timestamp}] [${module || 'App'}]`;
        return `${prefix} ${info.level}: ${info.message}`;
      }),
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: customFormat,
      defaultMeta: { service: 'marsad-backend' },
      transports: [
        // Console output
        new winston.transports.Console({
          format: consoleFormat,
        }),

        // File: all logs
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 14, // 2 weeks
        }),

        // File: error logs only
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 14,
        }),

        // File: warning logs
        new winston.transports.File({
          filename: path.join(logDir, 'warning.log'),
          level: 'warn',
          maxsize: 5 * 1024 * 1024, // 5MB
          maxFiles: 7,
        }),
      ],
    });
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private enrichLog(message: string, meta?: any): any {
    return {
      message,
      ...this.context,
      ...(meta && { metadata: meta }),
    };
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, this.enrichLog(message, meta));
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, this.enrichLog(message, meta));
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, this.enrichLog(message, meta));
  }

  error(message: string, error?: Error | string, meta?: any): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.logger.error(message, {
      ...this.enrichLog(message, meta),
      stack: errorObj.stack,
      errorMessage: errorObj.message,
    });
  }

  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: any,
  ): void {
    this.info(`${method} ${path}`, {
      type: 'REQUEST',
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      ...meta,
    });
  }

  logException(error: Error, context?: string): void {
    this.error(`Unhandled Exception${context ? ` (${context})` : ''}`, error, {
      type: 'EXCEPTION',
    });
  }

  logDatabaseQuery(query: string, duration: number, meta?: any): void {
    this.debug('Database Query', {
      type: 'DB_QUERY',
      query,
      duration: `${duration}ms`,
      ...meta,
    });
  }

  logCacheOperation(
    operation: 'GET' | 'SET' | 'DELETE',
    key: string,
    duration: number,
    hit?: boolean,
  ): void {
    this.debug(`Cache ${operation}`, {
      type: 'CACHE_OP',
      operation,
      key,
      duration: `${duration}ms`,
      cacheHit: hit,
    });
  }

  logSecurityEvent(
    event: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    meta?: any,
  ): void {
    const logFn = severity === 'CRITICAL' || severity === 'HIGH' ? this.error : this.warn;
    logFn.call(this, `Security Event: ${event}`, {
      type: 'SECURITY',
      event,
      severity,
      ...meta,
    });
  }

  logAuthEvent(
    event: 'LOGIN' | 'LOGOUT' | 'REGISTRATION' | 'FAILED_AUTH' | 'TOKEN_REFRESH',
    userId?: string,
    meta?: any,
  ): void {
    this.info(`Auth Event: ${event}`, {
      type: 'AUTH',
      event,
      userId,
      ...meta,
    });
  }
}
