export interface ErrorLog {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  level: 'error' | 'warning' | 'info';
  context?: Record<string, any>;
  userAgent?: string;
  url?: string;
}

interface ErrorLoggerConfig {
  apiEndpoint?: string;
  maxLogs?: number;
  sendToServer?: boolean;
  enableConsole?: boolean;
}

class ErrorLoggerService {
  private logs: ErrorLog[] = [];
  private config: ErrorLoggerConfig;
  private readonly MAX_LOCAL_LOGS = 100;

  constructor(config: ErrorLoggerConfig = {}) {
    this.config = {
      sendToServer: true,
      enableConsole: process.env.NODE_ENV === 'development',
      maxLogs: 100,
      ...config,
    };

    this.setupGlobalErrorHandlers();
  }

  /**
   * Log an error
   */
  logError(message: string, error?: Error | string, context?: Record<string, any>): string {
    const id = this.generateId();
    const errorLog: ErrorLog = {
      id,
      timestamp: new Date().toISOString(),
      message,
      level: 'error',
      userAgent: navigator.userAgent,
      url: window.location.href,
      context,
    };

    if (error instanceof Error) {
      errorLog.stack = error.stack;
      errorLog.message = `${message}: ${error.message}`;
    } else if (typeof error === 'string') {
      errorLog.message = `${message}: ${error}`;
    }

    this.addLog(errorLog);

    if (this.config.enableConsole) {
      console.error(`[ERROR] ${errorLog.message}`, { context, stack: errorLog.stack });
    }

    if (this.config.sendToServer) {
      this.sendToServer(errorLog);
    }

    return id;
  }

  /**
   * Log a warning
   */
  logWarning(message: string, context?: Record<string, any>): string {
    const id = this.generateId();
    const warningLog: ErrorLog = {
      id,
      timestamp: new Date().toISOString(),
      message,
      level: 'warning',
      userAgent: navigator.userAgent,
      url: window.location.href,
      context,
    };

    this.addLog(warningLog);

    if (this.config.enableConsole) {
      console.warn(`[WARNING] ${message}`, context);
    }

    if (this.config.sendToServer) {
      this.sendToServer(warningLog);
    }

    return id;
  }

  /**
   * Log info
   */
  logInfo(message: string, context?: Record<string, any>): string {
    const id = this.generateId();
    const infoLog: ErrorLog = {
      id,
      timestamp: new Date().toISOString(),
      message,
      level: 'info',
      userAgent: navigator.userAgent,
      url: window.location.href,
      context,
    };

    this.addLog(infoLog);

    if (this.config.enableConsole) {
      console.info(`[INFO] ${message}`, context);
    }

    return id;
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Uncaught error handler
    window.addEventListener('error', (event: ErrorEvent) => {
      this.logError(
        'Uncaught Error',
        event.error,
        {
          type: 'UNCAUGHT_ERROR',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      );
    });

    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.logError(
        'Unhandled Promise Rejection',
        error,
        {
          type: 'UNHANDLED_REJECTION',
          reason: event.reason,
        },
      );
    });
  }

  /**
   * Add log to internal storage
   */
  private addLog(log: ErrorLog): void {
    this.logs.push(log);

    // Maintain max logs limit
    if (this.logs.length > (this.config.maxLogs || this.MAX_LOCAL_LOGS)) {
      this.logs = this.logs.slice(-this.MAX_LOCAL_LOGS);
    }

    // Also store in localStorage for persistence
    try {
      localStorage.setItem(
        'marsad_error_logs',
        JSON.stringify(this.logs.slice(-10)), // Keep last 10 in storage
      );
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Send error to server
   */
  private async sendToServer(log: ErrorLog): Promise<void> {
    if (!this.config.apiEndpoint) {
      return;
    }

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      });
    } catch (error) {
      // Silently fail if server endpoint unavailable
      if (this.config.enableConsole) {
        console.debug('Failed to send error log to server', error);
      }
    }
  }

  /**
   * Get all logs
   */
  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: 'error' | 'warning' | 'info'): ErrorLog[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    try {
      localStorage.removeItem('marsad_error_logs');
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Export logs
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const errorLogger = new ErrorLoggerService({
  apiEndpoint: process.env.REACT_APP_ERROR_LOG_API || '/api/logs/errors',
  enableConsole: true,
});
