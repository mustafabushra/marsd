# Frontend Monitoring Setup Guide

Comprehensive client-side monitoring for the Marsad React application.

## Overview

The frontend monitoring system includes:
- **Error Logging**: Automatic error capture and reporting
- **Performance Monitoring**: Web Vitals and custom metrics
- **Analytics Tracking**: User behavior and feature usage
- **Crash Reporting**: Detailed crash diagnostics with breadcrumbs

## Quick Start

### 1. Import Monitoring Services

```typescript
// src/App.jsx
import { 
  errorLogger, 
  performanceMonitor, 
  analyticsTracker, 
  crashReporter 
} from './services/monitoring';

function App() {
  useEffect(() => {
    // Track page view
    analyticsTracker.trackPageView('App');

    // Cleanup on unmount
    return () => {
      performanceMonitor.destroy();
      analyticsTracker.destroy();
    };
  }, []);

  return (
    // Your app components
  );
}
```

### 2. Use in Components

```typescript
import { usePerformanceMonitoring } from './hooks/usePerformanceMonitoring';
import { errorLogger } from './services/errorLogger';

function Dashboard() {
  const { measureAsync, trackInteraction, trackError } = usePerformanceMonitoring({
    componentName: 'Dashboard',
    warnOnSlowRender: 3000
  });

  const handleLoadData = async () => {
    try {
      trackInteraction('load_button_clicked');
      
      const data = await measureAsync('fetchDashboard', async () => {
        const response = await fetch('/api/dashboard');
        return response.json();
      });

      setData(data);
    } catch (error) {
      trackError('Failed to load dashboard', error);
    }
  };

  return (
    <div>
      <button onClick={handleLoadData}>Load Data</button>
    </div>
  );
}
```

## Services

### Error Logger Service

Captures and logs client-side errors with context.

#### Setup

```typescript
import { errorLogger } from './services/errorLogger';

// Automatically captures:
// - Uncaught errors (window.onerror)
// - Unhandled promise rejections
// - Manual error logging
```

#### API

```typescript
// Log errors
errorLogger.logError('Operation failed', error, {
  context: 'user action',
  userId: 'user-123'
});

// Log warnings
errorLogger.logWarning('Slow operation detected', {
  duration: 5000,
  operation: 'fetchUsers'
});

// Log info
errorLogger.logInfo('User logged in', {
  provider: 'email',
  userId: 'user-123'
});

// Get logs
const allLogs = errorLogger.getLogs();
const errorLogs = errorLogger.getLogsByLevel('error');

// Clear logs
errorLogger.clearLogs();

// Export logs
const json = errorLogger.exportLogs();
fetch('/api/logs/export', {
  method: 'POST',
  body: json
});
```

#### Configuration

```typescript
// In errorLogger.ts, modify the export at the bottom
export const errorLogger = new ErrorLoggerService({
  apiEndpoint: '/api/logs/errors', // Where to send logs
  enableConsole: true,              // Log to console
  maxLogs: 100                       // Max logs to keep in memory
});
```

### Performance Monitor Service

Tracks Web Vitals and custom performance metrics.

#### Setup

```typescript
import { performanceMonitor } from './services/performanceMonitor';

// Automatically tracks:
// - Largest Contentful Paint (LCP)
// - First Input Delay (FID)
// - Cumulative Layout Shift (CLS)
// - First Contentful Paint (FCP)
// - Time to First Byte (TTFB)
// - Navigation timing
// - Resource timing
```

#### API

```typescript
// Record custom metric
performanceMonitor.recordMetric('Feature Loading', 250, 'ms');

// Measure function execution
const result = performanceMonitor.measureFunction('expensiveCalc', () => {
  return complexCalculation();
});

// Measure async function
const data = await performanceMonitor.measureAsyncFunction('apiCall', async () => {
  return await fetch('/api/data').then(r => r.json());
});

// Get Web Vitals
const vitals = performanceMonitor.getWebVitals();
console.log('LCP:', vitals.LCP, 'ms');
console.log('CLS:', vitals.CLS);

// Get all metrics
const metrics = performanceMonitor.getMetrics();

// Get summary statistics
const summary = performanceMonitor.getMetricsSummary();
// Returns: { "metric name": { count, min, max, avg }, ... }

// Cleanup
performanceMonitor.destroy();
```

#### Configuration

```typescript
// In performanceMonitor.ts, modify export
export const performanceMonitor = new PerformanceMonitorService({
  apiEndpoint: '/api/metrics/performance',
  enableConsole: true,
  sendMetrics: true,
  sampleRate: 0.1  // Send metrics for 10% of users
});
```

### Analytics Tracker Service

Tracks user interactions and feature usage.

#### Setup

```typescript
import { analyticsTracker } from './services/analyticsTracker';

// Automatically tracks:
// - Page views
// - Session start/end
// - Visibility changes (tab focus)
```

#### API

```typescript
// Track page view
analyticsTracker.trackPageView('Dashboard');
analyticsTracker.trackPageView(); // Uses document.title

// Track custom event
const eventId = analyticsTracker.trackEvent('BUTTON_CLICKED', {
  button: 'submit',
  form: 'login'
});

// Track feature usage
analyticsTracker.trackFeature('AUTH', 'login', {
  provider: 'google',
  success: true
});

// Track user interaction
analyticsTracker.trackInteraction('button', 'click', 'submit-btn');

// Track conversion
analyticsTracker.trackConversion('Premium Signup', 99.99, {
  plan: 'monthly',
  currency: 'USD'
});

// Track errors
analyticsTracker.trackError('API Error', 'NetworkError', {
  endpoint: '/api/users',
  status: 500
});

// Track performance issues
analyticsTracker.trackPerformanceIssue(
  'UserList',      // component
  'render_time',   // metric
  5500,            // value (ms)
  3000             // threshold (ms)
);

// Set user identification
analyticsTracker.setUserId('user-123');

// Set custom properties (sent with all events)
analyticsTracker.setCustomProperties({
  subscription: 'pro',
  region: 'US'
});

// Get session info
const session = analyticsTracker.getSessionInfo();
// { sessionId, userId, startTime, lastActivity, pageViews, events, duration }

// Get events
const events = analyticsTracker.getEvents();
const pageViews = analyticsTracker.getEventsByType('PAGE_VIEW');

// Export session data
const json = analyticsTracker.exportSession();
fetch('/api/analytics/export', {
  method: 'POST',
  body: json
});

// Cleanup (flushes pending events)
analyticsTracker.destroy();
```

#### Configuration

```typescript
// In analyticsTracker.ts, modify export
export const analyticsTracker = new AnalyticsTrackerService({
  apiEndpoint: '/api/analytics/track',
  enableConsole: true,
  sendEvents: true,
  batchSize: 10,           // Send after 10 events
  batchInterval: 5000      // Or every 5 seconds
});
```

### Crash Reporter Service

Detailed crash reporting with debugging breadcrumbs.

#### Setup

```typescript
import { crashReporter } from './services/crashReporter';

// Automatically captures:
// - Uncaught errors
// - Unhandled promise rejections
// - User interactions (breadcrumbs)
// - Page navigation
// - Visibility changes
```

#### API

```typescript
// Report a crash
const reportId = crashReporter.reportCrash(error, 'CRITICAL_ERROR', [
  'User navigated to settings',
  'API call initiated',
  'Form validation started'
]);

// Add breadcrumb for debugging
crashReporter.addBreadcrumb('User Navigation', {
  from: '/dashboard',
  to: '/settings'
});

crashReporter.addBreadcrumb('API Call', {
  endpoint: '/api/users',
  method: 'GET',
  status: 200
});

// Set user context
crashReporter.setUser('user-123');

// Set session ID
crashReporter.setSessionId('session-abc123');

// Get reports
const reports = crashReporter.getReports();
const recent = crashReporter.getRecentReports(5);

// Get breadcrumbs
const breadcrumbs = crashReporter.getBreadcrumbs();

// Clear data
crashReporter.clearReports();
crashReporter.clearBreadcrumbs();

// Export crash data
const json = crashReporter.exportCrashData();
fetch('/api/crash-reports/export', {
  method: 'POST',
  body: json
});
```

#### Configuration

```typescript
// In crashReporter.ts, modify export
export const crashReporter = new CrashReporterService({
  apiEndpoint: '/api/crash-reports',
  enableConsole: true,
  sendReports: true,
  maxBreadcrumbs: 50,
  userId: undefined,
  sessionId: undefined
});
```

## React Hooks

### usePerformanceMonitoring

Complete performance monitoring hook for components.

```typescript
import { usePerformanceMonitoring } from './hooks/usePerformanceMonitoring';

function MyComponent() {
  const {
    measureAsync,        // Measure async operations
    measureSync,         // Measure sync operations
    trackInteraction,    // Track user interactions
    trackError,          // Track errors
    trackEffectCompletion // Track effect timing
  } = usePerformanceMonitoring({
    componentName: 'MyComponent',
    trackMetrics: true,
    trackInteractions: true,
    warnOnSlowRender: 3000  // ms
  });

  useEffect(() => {
    // Measure effect duration
    const startTime = performance.now();
    
    // ...effect code...
    
    const duration = performance.now() - startTime;
    trackEffectCompletion('initData', duration);
  }, []);

  const handleClick = async () => {
    trackInteraction('button_clicked');
    
    try {
      const data = await measureAsync('fetchData', async () => {
        return await fetch('/api/data').then(r => r.json());
      });
    } catch (error) {
      trackError('Failed to fetch', error, { retry: false });
    }
  };

  return <button onClick={handleClick}>Click</button>;
}
```

### useMeasureRender

Simple render performance measurement.

```typescript
import { useMeasureRender } from './hooks/usePerformanceMonitoring';

function MyComponent() {
  useMeasureRender('MyComponent');
  
  return <div>Content</div>;
}
```

### useWhyDidYouUpdate

Debug component re-renders (development only).

```typescript
import { useWhyDidYouUpdate } from './hooks/usePerformanceMonitoring';

function MyComponent(props) {
  useWhyDidYouUpdate('MyComponent', props);
  
  return <div>{props.value}</div>;
}

// Console output when props change:
// [MyComponent] Why did you update: {
//   "value": { "from": "old", "to": "new" }
// }
```

## Integration Examples

### Login Flow

```typescript
import { analyticsTracker, crashReporter } from './services/monitoring';

async function handleLogin(email, password) {
  try {
    crashReporter.addBreadcrumb('Login Attempt', { email });
    analyticsTracker.trackFeature('AUTH', 'login_started');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      analyticsTracker.trackError('Login failed', 'HTTPError', {
        status: response.status
      });
      throw new Error(`Login failed: ${response.status}`);
    }

    const { user } = await response.json();
    
    // Set user context for all future monitoring
    analyticsTracker.setUserId(user.id);
    crashReporter.setUser(user.id);

    analyticsTracker.trackEvent('LOGIN_SUCCESS', {
      userId: user.id,
      email: user.email
    });

  } catch (error) {
    crashReporter.reportCrash(error, 'LOGIN_ERROR');
    analyticsTracker.trackError('Login error', error.message);
    throw error;
  }
}
```

### Data Fetching

```typescript
import { performanceMonitor, errorLogger, analyticsTracker } from './services/monitoring';

async function fetchUserData(userId) {
  const timer = performanceMonitor.startTimer('fetchUserData');

  try {
    const response = await fetch(`/api/users/${userId}`);
    const duration = timer();

    if (duration > 3000) {
      analyticsTracker.trackPerformanceIssue('UserData', 'fetch_time', duration, 3000);
    }

    return await response.json();

  } catch (error) {
    errorLogger.logError('Failed to fetch user data', error, {
      userId,
      context: 'getUserData'
    });
    throw error;
  }
}
```

### Form Submission

```typescript
import { 
  analyticsTracker, 
  crashReporter, 
  errorLogger 
} from './services/monitoring';

async function handleFormSubmit(formData) {
  const eventId = analyticsTracker.trackEvent('FORM_SUBMIT_START', {
    form: 'profile_update',
    fields: Object.keys(formData)
  });

  crashReporter.addBreadcrumb('Form Submitted', {
    form: 'profile_update'
  });

  try {
    const response = await fetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    analyticsTracker.trackConversion('PROFILE_UPDATE', null, {
      fields_updated: Object.keys(formData)
    });

  } catch (error) {
    analyticsTracker.trackError('Form submission failed', error.message);
    errorLogger.logError('Profile update failed', error);
    throw error;
  }
}
```

## Environment Variables

```env
# .env.local or .env.production
REACT_APP_ERROR_LOG_API=http://localhost:3000/api/logs/errors
REACT_APP_PERFORMANCE_API=http://localhost:3000/api/metrics/performance
REACT_APP_ANALYTICS_API=http://localhost:3000/api/analytics/track
REACT_APP_CRASH_REPORTER_API=http://localhost:3000/api/crash-reports
```

## Backend API Endpoints

These endpoints receive monitoring data from the frontend:

### POST /api/logs/errors
```json
{
  "id": "error_123",
  "timestamp": "2024-01-15T10:30:00Z",
  "message": "Failed to load",
  "stack": "...",
  "level": "error",
  "context": {}
}
```

### POST /api/metrics/performance
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "url": "http://localhost:3000/dashboard",
  "metrics": {},
  "webVitals": {
    "LCP": 1500,
    "CLS": 0.1
  },
  "resourceTiming": [],
  "navigationTiming": {}
}
```

### POST /api/analytics/track
```json
{
  "session": {
    "sessionId": "session_123",
    "userId": "user_123",
    "events": 10
  },
  "events": [
    {
      "id": "event_123",
      "eventName": "PAGE_VIEW",
      "timestamp": "2024-01-15T10:30:00Z",
      "properties": {}
    }
  ]
}
```

### POST /api/crash-reports
```json
{
  "id": "crash_123",
  "timestamp": "2024-01-15T10:30:00Z",
  "errorType": "ERROR",
  "message": "Something went wrong",
  "stack": "...",
  "breadcrumbs": [],
  "systemInfo": {}
}
```

## Best Practices

1. **Set User Context Early**
   ```typescript
   // After login
   analyticsTracker.setUserId(user.id);
   crashReporter.setUser(user.id);
   ```

2. **Add Breadcrumbs for Important Actions**
   ```typescript
   crashReporter.addBreadcrumb('Critical Action', { action: 'delete_user' });
   ```

3. **Track Performance of Critical Operations**
   ```typescript
   const data = await performanceMonitor.measureAsyncFunction('criticalOp', fn);
   ```

4. **Use Appropriate Log Levels**
   ```typescript
   errorLogger.logInfo('Normal event');
   errorLogger.logWarning('Something unexpected');
   errorLogger.logError('Something failed', error);
   ```

5. **Monitor Slow Renders**
   ```typescript
   usePerformanceMonitoring({
     componentName: 'Dashboard',
     warnOnSlowRender: 3000
   });
   ```

6. **Export Data for Analysis**
   ```typescript
   const logs = errorLogger.exportLogs();
   const crash = crashReporter.exportCrashData();
   const session = analyticsTracker.exportSession();
   ```

7. **Cleanup on App Unmount**
   ```typescript
   useEffect(() => {
     return () => {
       performanceMonitor.destroy();
       analyticsTracker.destroy();
     };
   }, []);
   ```

## Troubleshooting

### Logs not sending to server
- Check API endpoints in configuration
- Verify network connectivity
- Check browser console for errors
- Verify CORS settings on backend

### Performance metrics missing
- Browser may not support PerformanceObserver
- Check console for errors
- Verify sample rate setting

### Memory growing over time
- Adjust maxLogs/maxBreadcrumbs
- Call destroy() on cleanup
- Monitor with browser DevTools

### Data not persisting
- Check localStorage/sessionStorage limits
- Verify quota isn't exceeded
- Check browser storage permissions
