export interface CrashReport {
  id: string;
  timestamp: string;
  errorType: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  userId?: string;
  sessionId?: string;
  breadcrumbs: BreadcrumbEntry[];
  systemInfo: SystemInfo;
  reproductionSteps?: string[];
}

interface BreadcrumbEntry {
  timestamp: string;
  action: string;
  details?: Record<string, any>;
}

interface SystemInfo {
  userAgent: string;
  platform: string;
  language: string;
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  url: string;
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
  };
}

interface CrashReporterConfig {
  apiEndpoint?: string;
  sendReports?: boolean;
  enableConsole?: boolean;
  maxBreadcrumbs?: number;
  userId?: string;
  sessionId?: string;
}

class CrashReporterService {
  private breadcrumbs: BreadcrumbEntry[] = [];
  private config: CrashReporterConfig;
  private userId: string | null = null;
  private sessionId: string | null = null;
  private reports: CrashReport[] = [];

  constructor(config: CrashReporterConfig = {}) {
    this.config = {
      sendReports: true,
      enableConsole: process.env.NODE_ENV === 'development',
      maxBreadcrumbs: 50,
      ...config,
    };

    this.userId = config.userId || null;
    this.sessionId = config.sessionId || null;

    this.setupGlobalHandlers();
  }

  /**
   * Report a crash/error
   */
  reportCrash(
    error: Error,
    errorType: string = 'ERROR',
    reproductionSteps?: string[],
  ): string {
    const id = this.generateId();

    const report: CrashReport = {
      id,
      timestamp: new Date().toISOString(),
      errorType,
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.userId || undefined,
      sessionId: this.sessionId || undefined,
      breadcrumbs: [...this.breadcrumbs],
      systemInfo: this.captureSystemInfo(),
      reproductionSteps,
    };

    this.reports.push(report);

    if (this.config.enableConsole) {
      console.error(`[CRASH REPORT] ${errorType}: ${error.message}`, report);
    }

    if (this.config.sendReports) {
      this.sendReport(report);
    }

    return id;
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(action: string, details?: Record<string, any>): void {
    const breadcrumb: BreadcrumbEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
    };

    this.breadcrumbs.push(breadcrumb);

    // Maintain max breadcrumbs
    if (this.breadcrumbs.length > (this.config.maxBreadcrumbs || 50)) {
      this.breadcrumbs = this.breadcrumbs.slice(-(this.config.maxBreadcrumbs || 50));
    }
  }

  /**
   * Set user for crash reports
   */
  setUser(userId: string): void {
    this.userId = userId;
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get crash reports
   */
  getReports(): CrashReport[] {
    return [...this.reports];
  }

  /**
   * Get recent reports
   */
  getRecentReports(limit: number = 10): CrashReport[] {
    return this.reports.slice(-limit);
  }

  /**
   * Clear reports
   */
  clearReports(): void {
    this.reports = [];
  }

  /**
   * Get breadcrumbs
   */
  getBreadcrumbs(): BreadcrumbEntry[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Export crash data
   */
  exportCrashData(): string {
    return JSON.stringify(
      {
        reports: this.reports,
        breadcrumbs: this.breadcrumbs,
        systemInfo: this.captureSystemInfo(),
      },
      null,
      2,
    );
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    // Global error handler
    window.addEventListener('error', (event: ErrorEvent) => {
      this.addBreadcrumb('WINDOW_ERROR', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });

      this.reportCrash(event.error || new Error(event.message), 'UNCAUGHT_ERROR');
    });

    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

      this.addBreadcrumb('UNHANDLED_REJECTION', {
        reason: String(event.reason),
      });

      this.reportCrash(error, 'UNHANDLED_REJECTION');
    });

    // Track page interactions
    document.addEventListener(
      'click',
      (event: Event) => {
        const target = event.target as HTMLElement;
        this.addBreadcrumb('USER_CLICK', {
          element: target.tagName,
          id: target.id,
          class: target.className,
        });
      },
      true,
    );

    // Track navigation
    window.addEventListener('beforeunload', () => {
      this.addBreadcrumb('PAGE_UNLOAD');
    });

    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      this.addBreadcrumb('VISIBILITY_CHANGE', {
        hidden: document.hidden,
      });
    });
  }

  /**
   * Capture system information
   */
  private captureSystemInfo(): SystemInfo {
    const memory: any = {};

    // Capture memory if available
    if ((performance as any).memory) {
      const mem = (performance as any).memory;
      memory.usedJSHeapSize = mem.usedJSHeapSize;
      memory.totalJSHeapSize = mem.totalJSHeapSize;
      memory.jsHeapSizeLimit = mem.jsHeapSizeLimit;
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      memory: Object.keys(memory).length > 0 ? memory : undefined,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
      },
    };
  }

  /**
   * Send crash report to server
   */
  private async sendReport(report: CrashReport): Promise<void> {
    if (!this.config.apiEndpoint) {
      return;
    }

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch (error) {
      if (this.config.enableConsole) {
        console.debug('Failed to send crash report', error);
      }
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `crash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const crashReporter = new CrashReporterService({
  apiEndpoint: process.env.REACT_APP_CRASH_REPORTER_API || '/api/crash-reports',
  enableConsole: true,
  maxBreadcrumbs: 50,
});
