import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { LoggerService } from '../logging/logger.service';
import { metricsService } from '../monitoring/metrics.service';
import { SentryService } from '../logging/sentry.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService('LoggingInterceptor');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const classPath = `${context.getClass().name}.${context.getHandler().name}`;

    this.logger.debug(`Handler: ${classPath}`, {
      type: 'HANDLER_CALL',
      path: classPath,
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;

        this.logger.debug(`Handler completed: ${classPath}`, {
          type: 'HANDLER_COMPLETE',
          duration,
          statusCode: response.statusCode,
        });

        // Record handler execution metrics
        metricsService.recordApiCall(classPath, duration, response.statusCode);

        // Warn on slow handlers
        if (duration > 3000) {
          this.logger.warn(`Slow handler: ${classPath}`, {
            duration,
            statusCode: response.statusCode,
          });
        }

        return data;
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        const statusCode = error instanceof HttpException ? error.getStatus() : 500;

        this.logger.error(`Handler error: ${classPath}`, error, {
          type: 'HANDLER_ERROR',
          duration,
          statusCode,
          errorMessage: error.message,
        });

        // Record error metrics
        metricsService.recordError(classPath, statusCode >= 500 ? 'high' : 'medium');

        // Send to Sentry
        SentryService.captureException(error, {
          handler: classPath,
          duration,
          statusCode,
          requestId: request.requestId,
          userId: request.userId,
        });

        return throwError(() => error);
      }),
    );
  }
}
