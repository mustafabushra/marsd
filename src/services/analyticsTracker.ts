export interface AnalyticsEvent {
  id: string;
  eventName: string;
  timestamp: string;
  userId?: string;
  sessionId: string;
  properties?: Record<string, any>;
  userAgent?: string;
  url?: string;
  referrer?: string;
}

export interface AnalyticsSession {
  sessionId: string;
  userId?: string;
  startTime: string;
  lastActivity: string;
  pageViews: number;
  events: number;
  duration: number;
}

interface AnalyticsTrackerConfig {
  apiEndpoint?: string;
  sendEvents?: boolean;
  enableConsole?: boolean;
  batchSize?: number;
  batchInterval?: number;
}

class AnalyticsTrackerService {
  private events: AnalyticsEvent[] = [];
  private sessionId: string;
  private userId: string | null = null;
  private config: AnalyticsTrackerConfig;
  private pageViewCount = 0;
  private eventCount = 0;
  private sessionStartTime = Date.now();
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: AnalyticsTrackerConfig = {}) {
    this.config = {
      sendEvents: true,
      enableConsole: process.env.NODE_ENV === 'development',
      batchSize: 10,
      batchInterval: 5000, // 5 seconds
      ...config,
    };

    this.sessionId = this.generateSessionId();
    this.loadSession();
    this.setupTracking();
  }

  /**
   * Track page view
   */
  trackPageView(pageName?: string): void {
    this.pageViewCount++;

    const event: AnalyticsEvent = {
      id: this.generateId(),
      eventName: 'PAGE_VIEW',
      timestamp: new Date().toISOString(),
      userId: this.userId || undefined,
      sessionId: this.sessionId,
      properties: {
        pageName: pageName || document.title,
        url: window.location.href,
        referrer: document.referrer,
      },
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
    };

    this.addEvent(event);
  }

  /**
   * Track custom event
   */
  trackEvent(eventName: string, properties?: Record<string, any>): string {
    this.eventCount++;

    const event: AnalyticsEvent = {
      id: this.generateId(),
      eventName,
      timestamp: new Date().toISOString(),
      userId: this.userId || undefined,
      sessionId: this.sessionId,
      properties,
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
    };

    this.addEvent(event);

    if (this.config.enableConsole) {
      console.debug(`[ANALYTICS] Event: ${eventName}`, properties);
    }

    return event.id;
  }

  /**
   * Track feature usage
   */
  trackFeature(featureName: string, action: string, properties?: Record<string, any>): string {
    return this.trackEvent(`FEATURE_${featureName}`, {
      action,
      ...properties,
    });
  }

  /**
   * Track user interaction
   */
  trackInteraction(elementType: string, action: string, elementId?: string): string {
    return this.trackEvent('USER_INTERACTION', {
      elementType,
      action,
      elementId,
    });
  }

  /**
   * Track conversion/goal
   */
  trackConversion(conversionName: string, value?: number, properties?: Record<string, any>): string {
    return this.trackEvent('CONVERSION', {
      conversionName,
      value,
      ...properties,
    });
  }

  /**
   * Track user error
   */
  trackError(errorMessage: string, errorType?: string, properties?: Record<string, any>): string {
    return this.trackEvent('USER_ERROR', {
      message: errorMessage,
      type: errorType,
      ...properties,
    });
  }

  /**
   * Track performance issue
   */
  trackPerformanceIssue(
    componentName: string,
    metric: string,
    value: number,
    threshold?: number,
  ): string {
    return this.trackEvent('PERFORMANCE_ISSUE', {
      component: componentName,
      metric,
      value,
      threshold,
    });
  }

  /**
   * Set user identification
   */
  setUserId(userId: string): void {
    this.userId = userId;
    this.saveSession();
  }

  /**
   * Set custom properties for all events
   */
  setCustomProperties(properties: Record<string, any>): void {
    // Store in session storage for access across events
    try {
      const existing = this.getCustomProperties();
      sessionStorage.setItem(
        'marsad_analytics_custom',
        JSON.stringify({ ...existing, ...properties }),
      );
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Get custom properties
   */
  private getCustomProperties(): Record<string, any> {
    try {
      const stored = sessionStorage.getItem('marsad_analytics_custom');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(): AnalyticsSession {
    return {
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      startTime: new Date(this.sessionStartTime).toISOString(),
      lastActivity: new Date().toISOString(),
      pageViews: this.pageViewCount,
      events: this.eventCount,
      duration: Date.now() - this.sessionStartTime,
    };
  }

  /**
   * Get all tracked events
   */
  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(eventName: string): AnalyticsEvent[] {
    return this.events.filter((e) => e.eventName === eventName);
  }

  /**
   * Clear events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Export session data
   */
  exportSession(): string {
    return JSON.stringify(
      {
        session: this.getSessionInfo(),
        events: this.events,
      },
      null,
      2,
    );
  }

  /**
   * Setup automatic tracking
   */
  private setupTracking(): void {
    // Track initial page view
    this.trackPageView();

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackEvent('SESSION_PAUSE');
      } else {
        this.trackEvent('SESSION_RESUME');
      }
    });

    // Track unload
    window.addEventListener('beforeunload', () => {
      this.trackEvent('SESSION_END');
      this.sendBatch();
    });

    // Setup batch sending
    this.setupBatching();
  }

  /**
   * Setup event batching
   */
  private setupBatching(): void {
    this.batchTimer = setInterval(() => {
      if (this.events.length >= (this.config.batchSize || 10)) {
        this.sendBatch();
      }
    }, this.config.batchInterval || 5000);
  }

  /**
   * Add event and handle batching
   */
  private addEvent(event: AnalyticsEvent): void {
    this.events.push(event);

    // Send immediately if batch size reached
    if (this.events.length >= (this.config.batchSize || 10)) {
      this.sendBatch();
    }

    // Maintain max events in memory
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  /**
   * Send batch of events to server
   */
  private async sendBatch(): Promise<void> {
    if (!this.config.sendEvents || !this.config.apiEndpoint || this.events.length === 0) {
      return;
    }

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: this.getSessionInfo(),
          events: eventsToSend,
        }),
      });
    } catch (error) {
      // Add events back if sending failed
      this.events = [...eventsToSend, ...this.events];

      if (this.config.enableConsole) {
        console.debug('Failed to send analytics batch', error);
      }
    }
  }

  /**
   * Load session from storage
   */
  private loadSession(): void {
    try {
      const stored = sessionStorage.getItem('marsad_analytics_session');
      if (stored) {
        const session = JSON.parse(stored);
        this.sessionId = session.sessionId;
        this.userId = session.userId;
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Save session to storage
   */
  private saveSession(): void {
    try {
      sessionStorage.setItem(
        'marsad_analytics_session',
        JSON.stringify({
          sessionId: this.sessionId,
          userId: this.userId,
          startTime: this.sessionStartTime,
        }),
      );
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    try {
      const stored = sessionStorage.getItem('marsad_analytics_session');
      if (stored) {
        return JSON.parse(stored).sessionId;
      }
    } catch (e) {
      // Ignore
    }

    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate event ID
   */
  private generateId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    this.sendBatch();
  }
}

export const analyticsTracker = new AnalyticsTrackerService({
  apiEndpoint: process.env.REACT_APP_ANALYTICS_API || '/api/analytics/track',
  enableConsole: true,
  batchSize: 10,
  batchInterval: 5000,
});
