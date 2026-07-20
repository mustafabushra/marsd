# Comprehensive Monitoring Setup Guide

This document describes the complete monitoring infrastructure for the Marsad backend and frontend applications.

## Backend Monitoring

### 1. Logger Service (`logger.service.ts`)

The core logging service using Winston with structured logging capabilities.

#### Features:
- Console and file-based logging
- Structured JSON logging
- Multiple log levels (debug, info, warn, error)
- Context tracking (request ID, user ID)
- Specialized logging methods for different event types
- Automatic log rotation (max 10MB per file)

#### Usage:

```typescript
import { LoggerService } from './logging/logger.service';

const logger = new LoggerService('MyModule');

// Basic logging
logger.debug('Debug message', { metadata: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error occurred', error, { context: 'data' });

// Set request context
logger.setContext({ requestId: '123', userId: 'user-456' });

// Specialized logging
logger.logRequest('GET', '/api/users', 200, 150); // method, path, status, duration
logger.logDatabaseQuery('SELECT * FROM users', 45); // query, duration
logger.logCacheOperation('GET', 'user:123', 5, true); // operation, key, duration, hit
logger.logSecurityEvent('Failed Login Attempt', 'HIGH', { attempts: 3 });
logger.logAuthEvent('LOGIN', 'user-456', { provider: 'email' });
```

### 2. Sentry Service (`sentry.service.ts`)

Error tracking and monitoring service integration.

#### Features:
- Automatic error capture
- Session tracking
- Performance monitoring (transaction tracing)
- Profiling support
- Sensitive data filtering
- Breadcrumb support

#### Setup:

```typescript
import { SentryService } from './logging/sentry.service';

// Initialize in main.ts
SentryService.initialize({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.SENTRY_ENABLED === 'true',
  tracesSampleRate: 0.1, // Sample 10%
  profilesSampleRate: 0.1,
});

// Use in application
SentryService.captureException(error, { context: 'operation' });
SentryService.captureMessage('Something happened', 'warning');
SentryService.setUser('user-123', 'user@example.com');
SentryService.setTag('environment', 'production');
```

### 3. Metrics Service (`metrics.service.ts`)

Application metrics collection and aggregation.

#### Features:
- Counters (increment metrics)
- Gauges (current values)
- Histograms (value distributions)
- Prometheus format export
- HTTP request tracking
- Database query tracking
- Cache operation tracking

#### Usage:

```typescript
import { metricsService } from './monitoring/metrics.service';

// Counters
metricsService.incrementCounter('user_logins', 1, { provider: 'email' });

// Gauges
metricsService.setGauge('active_connections', 42);

// Histograms
metricsService.recordHistogram('response_time_ms', 150);

// HTTP Requests
metricsService.recordHttpRequest('GET', '/api/users', 200, 150);

// Database
metricsService.recordDatabaseQuery('SELECT', 'users', 45, true);

// Cache
metricsService.recordCacheOperation('GET', 120, true);

// Get all metrics
const allMetrics = metricsService.getAllMetrics();

// Export as Prometheus
const prometheus = metricsService.exportPrometheus();
```

### 4. Request Logger Middleware (`request-logger.middleware.ts`)

Automatic request/response logging for all HTTP endpoints.

#### Features:
- Request ID generation (unique per request)
- Response time tracking
- Status code monitoring
- Header sanitization (removes sensitive data)
- Slow request detection (>5000ms)
- Automatic error logging

#### Integration in App Module:

```typescript
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';

@Module({
  // ...
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
```

### 5. Logging Interceptor (`logging.interceptor.ts`)

Handler-level logging and error tracking.

#### Features:
- Handler execution tracking
- Performance monitoring per handler
- Automatic error capture and Sentry integration
- Slow handler detection
- Metrics recording

#### Integration in Controller:

```typescript
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { UseInterceptors } from '@nestjs/common';

@Controller('users')
@UseInterceptors(LoggingInterceptor)
export class UsersController {
  // endpoints...
}
```

### 6. Health Check Endpoints (`health-check.controller.ts`)

Monitoring endpoints for application health status.

#### Endpoints:
- `GET /health/` - Liveness probe (always UP if app is running)
- `GET /health/ready` - Readiness probe (checks dependencies)
- `GET /health/deep` - Deep health check (comprehensive diagnostics)
- `GET /health/metrics` - Application metrics in JSON format
- `GET /health/metrics/prometheus` - Prometheus format metrics

#### Response Format:

```json
{
  "overall": {
    "status": "UP",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "uptime": 3600,
    "environment": "production",
    "version": "1.0.0"
  },
  "checks": {
    "database": {
      "name": "Database",
      "status": "UP",
      "details": { "responseTime": "5ms" }
    },
    "memory": {
      "name": "Memory",
      "status": "UP",
      "details": {
        "heapUsed": "256MB",
        "heapUsedPercent": "42.5%"
      }
    }
  }
}
```

## Frontend Monitoring

### 1. Error Logger (`errorLogger.ts`)

Client-side error logging service.

#### Features:
- Global error capture (uncaught errors, unhandled rejections)
- Structured error logging
- Error history in memory and localStorage
- Server-side error reporting
- Console logging for development

#### Usage:

```typescript
import { errorLogger } from './services/errorLogger';

// Log errors
try {
  // Some operation
} catch (error) {
  errorLogger.logError('Operation failed', error, { context: 'data' });
}

// Log warnings
errorLogger.logWarning('Resource loading slow', { resource: 'bundle.js' });

// Log info
errorLogger.logInfo('Page loaded', { loadTime: 1500 });

// Get logs
const allErrors = errorLogger.getLogs();
const errors = errorLogger.getLogsByLevel('error');

// Export for analysis
const report = errorLogger.exportLogs();
```

### 2. Performance Monitor (`performanceMonitor.ts`)

Web performance metrics tracking.

#### Features:
- Web Vitals (LCP, FID, CLS, TTFB, INP)
- Resource timing tracking
- Navigation timing analysis
- Custom metric recording
- Function execution time measurement
- Prometheus-compatible metrics

#### Usage:

```typescript
import { performanceMonitor } from './services/performanceMonitor';

// Record custom metric
performanceMonitor.recordMetric('Feature X - Process', 250, 'ms');

// Measure function
const result = performanceMonitor.measureFunction('expensiveOperation', () => {
  // Some operation
  return result;
});

// Measure async function
const data = await performanceMonitor.measureAsyncFunction('apiCall', async () => {
  return await fetch('/api/data');
});

// Get Web Vitals
const vitals = performanceMonitor.getWebVitals();

// Get all metrics
const metrics = performanceMonitor.getMetrics();

// Get summary
const summary = performanceMonitor.getMetricsSummary();
```

### 3. Analytics Tracker (`analyticsTracker.ts`)

User behavior and feature usage tracking.

#### Features:
- Session tracking with unique session IDs
- Page view tracking
- Custom event tracking
- Feature usage tracking
- Conversion tracking
- Error event tracking
- Automatic event batching
- Session storage for persistence

#### Usage:

```typescript
import { analyticsTracker } from './services/analyticsTracker';

// Track page views
analyticsTracker.trackPageView('Dashboard');

// Track custom events
analyticsTracker.trackEvent('USER_ACTION', { action: 'clicked_button' });

// Track feature usage
analyticsTracker.trackFeature('SEARCH', 'query', { query_length: 10 });

// Track interactions
analyticsTracker.trackInteraction('button', 'click', 'submit-btn');

// Track conversions
analyticsTracker.trackConversion('subscription', 99.99, { plan: 'pro' });

// Track errors
analyticsTracker.trackError('API Error', 'NetworkError', { endpoint: '/api/users' });

// Track performance issues
analyticsTracker.trackPerformanceIssue('UserList', 'render_time', 5500, 3000);

// Set user
analyticsTracker.setUserId('user-123');

// Get session info
const session = analyticsTracker.getSessionInfo();

// Export data
const data = analyticsTracker.exportSession();
```

### 4. Crash Reporter (`crashReporter.ts`)

Comprehensive crash reporting with debugging information.

#### Features:
- Automatic crash capture
- Breadcrumb trail (debugging information)
- System information capture
- Memory usage tracking
- User and session context
- Global error handlers

#### Usage:

```typescript
import { crashReporter } from './services/crashReporter';

// Manually report crash
try {
  // Some operation
} catch (error) {
  crashReporter.reportCrash(error, 'OPERATION_ERROR', [
    'User clicked submit',
    'Form validation started',
    'API call initiated'
  ]);
}

// Add breadcrumb
crashReporter.addBreadcrumb('User Navigation', {
  from: '/dashboard',
  to: '/settings'
});

// Set user context
crashReporter.setUser('user-123');

// Set session
crashReporter.setSessionId('session-456');

// Get reports
const reports = crashReporter.getReports();

// Export for analysis
const data = crashReporter.exportCrashData();
```

### 5. Performance Monitoring Hook (`usePerformanceMonitoring.ts`)

React hooks for component-level performance tracking.

#### Hooks:

```typescript
import {
  usePerformanceMonitoring,
  useMeasureRender,
  useInteractive,
  useWhyDidYouUpdate
} from './hooks/usePerformanceMonitoring';

// Main hook with all features
function MyComponent() {
  const {
    measureAsync,
    measureSync,
    trackInteraction,
    trackError,
    trackEffectCompletion
  } = usePerformanceMonitoring({
    componentName: 'MyComponent',
    warnOnSlowRender: 3000
  });

  const handleClick = async () => {
    try {
      const data = await measureAsync('fetchData', async () => {
        return await fetch('/api/data');
      });
      trackInteraction('data_loaded');
    } catch (error) {
      trackError('Failed to load data', error);
    }
  };

  useEffect(() => {
    const duration = performance.now() - startTime;
    trackEffectCompletion('initializeData', duration);
  }, []);

  return <button onClick={handleClick}>Load</button>;
}

// Simple render measurement
function SimpleMeasure() {
  useMeasureRender('SimpleMeasure');
  return <div>Content</div>;
}

// Debug re-renders
function DebugComponent(props) {
  useWhyDidYouUpdate('DebugComponent', props);
  return <div>{props.value}</div>;
}
```

## Environment Variables

### Backend
```env
# Logging
LOG_LEVEL=info

# Sentry
SENTRY_DSN=https://xxxx@sentry.io/xxxx
SENTRY_ENABLED=true
NODE_ENV=production
APP_VERSION=1.0.0

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

### Frontend
```env
REACT_APP_ERROR_LOG_API=/api/logs/errors
REACT_APP_PERFORMANCE_API=/api/metrics/performance
REACT_APP_ANALYTICS_API=/api/analytics/track
REACT_APP_CRASH_REPORTER_API=/api/crash-reports
```

## Integration in Application

### Backend Integration

1. **Import modules in app.module.ts:**
```typescript
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule, /* ... */],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
```

2. **Apply interceptors globally:**
```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

3. **Initialize Sentry in main.ts:**
```typescript
import { SentryService } from './logging/sentry.service';

async function bootstrap() {
  SentryService.initialize({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enabled: process.env.SENTRY_ENABLED === 'true',
  });

  // Rest of bootstrap...
}
```

### Frontend Integration

1. **Initialize in App.jsx:**
```typescript
import { errorLogger } from './services/errorLogger';
import { performanceMonitor } from './services/performanceMonitor';
import { analyticsTracker } from './services/analyticsTracker';
import { crashReporter } from './services/crashReporter';

useEffect(() => {
  // Initialize monitoring
  analyticsTracker.trackPageView();
  analyticsTracker.setUserId(userId); // When user logs in
}, []);
```

2. **Use in components:**
```typescript
function Dashboard() {
  const { measureAsync, trackError } = usePerformanceMonitoring({
    componentName: 'Dashboard',
    warnOnSlowRender: 2000
  });

  useEffect(() => {
    measureAsync('loadDashboard', async () => {
      try {
        return await fetchDashboardData();
      } catch (error) {
        trackError('Dashboard failed to load', error);
      }
    });
  }, []);

  return <div>Dashboard</div>;
}
```

## API Endpoints for Receiving Monitoring Data

### Error Logs
```
POST /api/logs/errors
Body: { log object }
```

### Performance Metrics
```
POST /api/metrics/performance
Body: { performance report }
```

### Analytics
```
POST /api/analytics/track
Body: { session, events }
```

### Crash Reports
```
POST /api/crash-reports
Body: { crash report }
```

## Monitoring Dashboard Access

### Health Checks
- Liveness: `GET http://localhost:3000/health/`
- Readiness: `GET http://localhost:3000/health/ready`
- Deep: `GET http://localhost:3000/health/deep`

### Metrics
- JSON: `GET http://localhost:3000/health/metrics`
- Prometheus: `GET http://localhost:3000/health/metrics/prometheus`

## Best Practices

1. **Always set request context** for tracking related logs
2. **Use appropriate log levels** to avoid log spam
3. **Sanitize sensitive data** in logs and error reports
4. **Set sample rates** appropriately for high-traffic apps
5. **Monitor memory usage** to avoid log accumulation
6. **Use structured logging** for better log parsing
7. **Tag errors with context** for better debugging
8. **Track performance metrics** for critical operations
9. **Use breadcrumbs** in crash reports for debugging
10. **Regularly review** collected monitoring data

## Troubleshooting

### Logs not appearing in files
- Check that `logs/` directory exists
- Verify file permissions
- Check available disk space

### Sentry not capturing errors
- Verify DSN is correct
- Check SENTRY_ENABLED environment variable
- Ensure error happens after Sentry initialization

### Performance metrics missing
- Browser may not support PerformanceObserver
- Check sample rate configuration
- Verify API endpoint is configured

### Analytics not batching
- Check network connectivity
- Verify batch size and interval settings
- Check localStorage for stored events
