export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface WebVitals {
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  FCP?: number; // First Contentful Paint
  TTFB?: number; // Time to First Byte
  INP?: number; // Interaction to Next Paint
}

export interface PerformanceReport {
  timestamp: string;
  url: string;
  metrics: Record<string, number>;
  webVitals: WebVitals;
  resourceTiming: ResourceMetric[];
  navigationTiming: NavigationTiming;
}

interface ResourceMetric {
  name: string;
  duration: number;
  size: number;
  type: string;
}

interface NavigationTiming {
  dns: number;
  tcp: number;
  ttfb: number;
  download: number;
  domInteractive: number;
  domComplete: number;
  loadComplete: number;
}

interface PerformanceMonitorConfig {
  apiEndpoint?: string;
  sendMetrics?: boolean;
  enableConsole?: boolean;
  sampleRate?: number;
}

class PerformanceMonitorService {
  private metrics: PerformanceMetric[] = [];
  private config: PerformanceMonitorConfig;
  private observer: PerformanceObserver | null = null;
  private webVitals: WebVitals = {};

  constructor(config: PerformanceMonitorConfig = {}) {
    this.config = {
      sendMetrics: true,
      enableConsole: process.env.NODE_ENV === 'development',
      sampleRate: 0.1, // Sample 10% of sessions
      ...config,
    };

    this.initializeWebVitalsMonitoring();
    this.setupPerformanceObserver();
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private initializeWebVitalsMonitoring(): void {
    // Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.webVitals.LCP = lastEntry.renderTime || lastEntry.loadTime;
          this.recordMetric('Web Vitals - LCP', this.webVitals.LCP, 'ms');
        });
        paintObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        // Browser doesn't support LCP
      }
    }

    // First Input Delay (FID) / Interaction to Next Paint (INP)
    if ('PerformanceObserver' in window) {
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (entry.processingDuration) {
              this.webVitals.FID = entry.processingDuration;
              this.recordMetric('Web Vitals - FID', this.webVitals.FID, 'ms');
            }
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        // Browser doesn't support FID
      }
    }

    // Cumulative Layout Shift (CLS)
    if ('PerformanceObserver' in window) {
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              this.webVitals.CLS = clsValue;
              this.recordMetric('Web Vitals - CLS', this.webVitals.CLS, 'score');
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        // Browser doesn't support CLS
      }
    }

    // Navigation Timing metrics
    window.addEventListener('load', () => {
      setTimeout(() => {
        this.captureNavigationTimings();
      }, 0);
    });
  }

  /**
   * Setup Performance Observer for various metrics
   */
  private setupPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming;
            this.recordMetric(
              `Resource - ${resourceEntry.name}`,
              resourceEntry.duration,
              'ms',
            );
          }
        }
      });

      this.observer.observe({
        entryTypes: ['resource', 'navigation', 'paint'],
      });
    } catch (e) {
      // Browser doesn't support PerformanceObserver
    }
  }

  /**
   * Capture Navigation Timing metrics
   */
  private captureNavigationTimings(): void {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;

    this.webVitals.TTFB = perfData.responseStart - perfData.navigationStart;

    const navigationTiming: NavigationTiming = {
      dns: perfData.domainLookupEnd - perfData.domainLookupStart,
      tcp: perfData.connectEnd - perfData.connectStart,
      ttfb: perfData.responseStart - perfData.navigationStart,
      download: perfData.responseEnd - perfData.responseStart,
      domInteractive: perfData.domInteractive - perfData.navigationStart,
      domComplete: perfData.domComplete - perfData.navigationStart,
      loadComplete: pageLoadTime,
    };

    Object.entries(navigationTiming).forEach(([key, value]) => {
      this.recordMetric(`Navigation - ${key}`, value, 'ms');
    });

    // Send full report
    if (this.shouldSendMetrics()) {
      this.sendReport(navigationTiming);
    }
  }

  /**
   * Record custom metric
   */
  recordMetric(name: string, value: number, unit: string = 'ms'): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
    };

    this.metrics.push(metric);

    if (this.config.enableConsole) {
      console.debug(`[PERF] ${name}: ${value}${unit}`);
    }

    // Maintain max metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  /**
   * Measure function execution time
   */
  measureFunction<T>(name: string, fn: () => T): T {
    const startTime = performance.now();
    const result = fn();
    const duration = performance.now() - startTime;
    this.recordMetric(`Function - ${name}`, duration, 'ms');
    return result;
  }

  /**
   * Measure async function execution time
   */
  async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    const result = await fn();
    const duration = performance.now() - startTime;
    this.recordMetric(`AsyncFunction - ${name}`, duration, 'ms');
    return result;
  }

  /**
   * Get current Web Vitals
   */
  getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    this.metrics.forEach((metric) => {
      if (!summary[metric.name]) {
        summary[metric.name] = [];
      }
      summary[metric.name].push(metric.value);
    });

    // Calculate statistics
    const stats: Record<string, any> = {};
    Object.entries(summary).forEach(([name, values]: [string, any]) => {
      const numValues = values as number[];
      stats[name] = {
        count: numValues.length,
        min: Math.min(...numValues),
        max: Math.max(...numValues),
        avg: numValues.reduce((a, b) => a + b, 0) / numValues.length,
      };
    });

    return stats;
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Send metrics to server
   */
  private async sendReport(navigationTiming: NavigationTiming): Promise<void> {
    if (!this.config.apiEndpoint || !this.config.sendMetrics) {
      return;
    }

    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      metrics: this.getMetricsSummary(),
      webVitals: this.webVitals,
      resourceTiming: this.getResourceTimings(),
      navigationTiming,
    };

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch (error) {
      if (this.config.enableConsole) {
        console.debug('Failed to send performance report', error);
      }
    }
  }

  /**
   * Get resource timings
   */
  private getResourceTimings(): ResourceMetric[] {
    const resources: ResourceMetric[] = [];

    performance.getEntriesByType('resource').forEach((entry: PerformanceResourceTiming) => {
      resources.push({
        name: entry.name,
        duration: entry.duration,
        size: entry.transferSize || 0,
        type: entry.initiatorType,
      });
    });

    return resources;
  }

  /**
   * Determine if metrics should be sent based on sample rate
   */
  private shouldSendMetrics(): boolean {
    return Math.random() < (this.config.sampleRate || 0.1);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

export const performanceMonitor = new PerformanceMonitorService({
  apiEndpoint: process.env.REACT_APP_PERFORMANCE_API || '/api/metrics/performance',
  enableConsole: true,
  sampleRate: 0.1,
});
