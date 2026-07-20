import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export interface SentryConfig {
  dsn: string;
  environment: string;
  enabled: boolean;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  maxBreadcrumbs?: number;
  attachStacktrace?: boolean;
}

export class SentryService {
  private static initialized = false;

  static initialize(config: SentryConfig): void {
    if (this.initialized || !config.enabled) {
      return;
    }

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      tracesSampleRate: config.tracesSampleRate || 0.1, // Sample 10% of transactions
      profilesSampleRate: config.profilesSampleRate || 0.1, // Sample 10% of profiles
      maxBreadcrumbs: config.maxBreadcrumbs || 50,
      attachStacktrace: config.attachStacktrace !== false,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection(),
        nodeProfilingIntegration(),
      ],
      beforeSend(event, hint) {
        // Filter sensitive data
        if (event.request) {
          if (event.request.headers) {
            delete event.request.headers['Authorization'];
            delete event.request.headers['Cookie'];
            delete event.request.headers['Set-Cookie'];
          }
          if (event.request.data) {
            try {
              const data = JSON.parse(event.request.data as string);
              if (data.password) {
                data.password = '[REDACTED]';
              }
              if (data.token) {
                data.token = '[REDACTED]';
              }
              event.request.data = JSON.stringify(data);
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }

        return event;
      },
    });

    this.initialized = true;
  }

  static captureException(error: Error, context?: Record<string, any>): string {
    const eventId = Sentry.captureException(error, {
      contexts: context ? { custom: context } : undefined,
    });

    return eventId || 'unknown';
  }

  static captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): string {
    const eventId = Sentry.captureMessage(message, level);
    return eventId || 'unknown';
  }

  static setUser(userId: string, email?: string, username?: string): void {
    Sentry.setUser({
      id: userId,
      email,
      username,
    });
  }

  static clearUser(): void {
    Sentry.setUser(null);
  }

  static setTag(key: string, value: string): void {
    Sentry.setTag(key, value);
  }

  static setContext(name: string, context: Record<string, any>): void {
    Sentry.setContext(name, context);
  }

  static addBreadcrumb(
    message: string,
    data?: Record<string, any>,
    category?: string,
    level?: Sentry.SeverityLevel,
  ): void {
    Sentry.addBreadcrumb({
      message,
      data,
      category: category || 'custom',
      level: level || 'info',
      timestamp: Date.now() / 1000,
    });
  }

  static startTransaction(name: string, op: string) {
    return Sentry.startTransaction({
      name,
      op,
    });
  }

  static flush(timeout?: number): Promise<boolean> {
    return Sentry.close(timeout || 2000);
  }

  static getSentryRequestHandler() {
    return Sentry.Handlers.requestHandler();
  }

  static getSentryErrorHandler() {
    return Sentry.Handlers.errorHandler();
  }
}
