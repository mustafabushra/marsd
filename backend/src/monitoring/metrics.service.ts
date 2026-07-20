export interface Metric {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: number;
}

export interface PerformanceMetric {
  name: string;
  duration: number;
  status: 'success' | 'error';
  metadata?: Record<string, any>;
}

export class MetricsService {
  private metrics: Map<string, Metric[]> = new Map();
  private counters: Map<string, number> = new Map();
  private timers: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.getKeyWithTags(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
    this.recordMetric(name, value, 'count', tags);
  }

  /**
   * Set a gauge metric (current value)
   */
  setGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKeyWithTags(name, tags);
    this.gauges.set(key, value);
    this.recordMetric(name, value, 'gauge', tags);
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKeyWithTags(name, tags);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    this.recordMetric(name, value, 'histogram', tags);
  }

  /**
   * Start a timer for performance tracking
   */
  startTimer(name: string): () => void {
    const startTime = Date.now();

    return (tags?: Record<string, string>) => {
      const duration = Date.now() - startTime;
      this.recordHistogram(`${name}_duration_ms`, duration, tags);
      return duration;
    };
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: Record<string, any>,
  ): void {
    const tags = {
      method,
      path,
      statusCode: String(statusCode),
      ...meta,
    };

    this.incrementCounter('http_requests_total', 1, tags);
    this.recordHistogram('http_request_duration_ms', duration, tags);

    if (statusCode >= 400) {
      this.incrementCounter('http_errors_total', 1, tags);
    }
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
  ): void {
    const tags = {
      operation,
      table,
      status: success ? 'success' : 'error',
    };

    this.incrementCounter('db_queries_total', 1, tags);
    this.recordHistogram('db_query_duration_ms', duration, tags);
  }

  /**
   * Record cache operations
   */
  recordCacheOperation(
    operation: 'GET' | 'SET' | 'DELETE',
    duration: number,
    hit?: boolean,
  ): void {
    const tags = {
      operation,
      hit: hit ? 'true' : 'false',
    };

    this.incrementCounter('cache_operations_total', 1, tags);
    this.recordHistogram('cache_operation_duration_ms', duration, tags);

    if (operation === 'GET' && hit) {
      this.incrementCounter('cache_hits', 1);
    }
  }

  /**
   * Record API call duration
   */
  recordApiCall(endpoint: string, duration: number, statusCode: number): void {
    const tags = {
      endpoint,
      statusCode: String(statusCode),
    };

    this.recordHistogram('api_call_duration_ms', duration, tags);
  }

  /**
   * Record authentication metrics
   */
  recordAuthEvent(
    event: 'login' | 'logout' | 'registration' | 'failed_auth',
    success: boolean,
  ): void {
    const tags = { event, status: success ? 'success' : 'failure' };
    this.incrementCounter('auth_events_total', 1, tags);
  }

  /**
   * Record error metrics
   */
  recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    const tags = { errorType, severity };
    this.incrementCounter('errors_total', 1, tags);
  }

  /**
   * Get all recorded metrics
   */
  getAllMetrics(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            p50: this.percentile(values, 50),
            p95: this.percentile(values, 95),
            p99: this.percentile(values, 99),
          },
        ]),
      ),
    };
  }

  /**
   * Get histogram percentile
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, any> {
    return {
      totalMetrics: this.metrics.size,
      totalCounters: this.counters.size,
      totalGauges: this.gauges.size,
      totalHistograms: this.histograms.size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    let output = '# HELP marsad_metrics Marsad application metrics\n';
    output += '# TYPE marsad_metrics gauge\n\n';

    // Counters
    for (const [key, value] of this.counters.entries()) {
      output += `marsad_counter{${key}} ${value}\n`;
    }

    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      output += `marsad_gauge{${key}} ${value}\n`;
    }

    // Histograms summary
    for (const [key, values] of this.histograms.entries()) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      output += `marsad_histogram{${key},type="avg"} ${avg}\n`;
      output += `marsad_histogram{${key},type="min"} ${Math.min(...values)}\n`;
      output += `marsad_histogram{${key},type="max"} ${Math.max(...values)}\n`;
    }

    return output;
  }

  /**
   * Private helper to create tag key
   */
  private getKeyWithTags(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    const tagString = Object.entries(tags)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${tagString}}`;
  }

  /**
   * Private helper to record metric
   */
  private recordMetric(
    name: string,
    value: number,
    unit?: string,
    tags?: Record<string, string>,
  ): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push({
      name,
      value,
      unit,
      tags,
      timestamp: Date.now(),
    });

    // Keep only last 1000 metrics per name to prevent memory issues
    const metricsList = this.metrics.get(name)!;
    if (metricsList.length > 1000) {
      metricsList.shift();
    }
  }
}

export const metricsService = new MetricsService();
