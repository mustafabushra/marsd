# Frontend Error Handling Guide

## Overview

This guide documents the comprehensive error handling system for the Marsad frontend. The system provides:

- **Error Boundary Component** for catching React errors
- **Toast Notification System** for user-friendly error messages
- **Error Logging Service** for capturing and sending logs to backend
- **Retry Service** with exponential backoff for failed requests
- **API Client** with integrated error handling and retry logic
- **Error Codes and Messages** matching backend error codes

## Architecture

```
┌─ React Component ─┐
       │
       ▼
[Error Boundary] ──► Catches render/lifecycle errors
       │
       ▼
[User Interaction]
       │
       ▼
[API Client]
   │
   ├─► Request with interceptors
   │
   ├─► [Retry Service] ──► Exponential backoff
   │   │
   │   └─► Max retries exceeded
   │
   ▼
[Response Handler]
   │ (error) ──► [Error Logger] ──► Local storage + Backend
   │  │
   │  ├─► Check if retryable ──► Retry
   │  │
   │  ├─► Check if requires auth ──► Redirect to login
   │  │
   │  └─► Show error toast
   │
   └─► Return response
```

## Components

### 1. Error Boundary Component

Catches React component errors and displays fallback UI.

```jsx
import { ErrorBoundary } from '@utils/ErrorBoundary'
import { ToastContainer } from '@utils/ToastContainer'

function App() {
  return (
    <ErrorBoundary>
      <ToastContainer />
      {/* Your app components */}
    </ErrorBoundary>
  )
}
```

**Features:**
- Catches render errors
- Displays user-friendly error message
- Shows error details in development mode
- Provides "Try Again" and "Reload Page" buttons
- Logs errors to error logger

### 2. Toast Notification System

Displays temporary notifications to users.

```javascript
import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
  showLoading,
} from '@utils/toast-service'

// Show success toast (auto-dismiss after 5 seconds)
showSuccess('Changes saved successfully!')

// Show error toast (auto-dismiss after 7 seconds)
showError('Failed to save changes. Please try again.')

// Show info toast (auto-dismiss after 5 seconds)
showInfo('Processing your request...')

// Show warning toast (auto-dismiss after 6 seconds)
showWarning('This action cannot be undone.')

// Show loading toast (manual dismiss required)
const loadingToast = showLoading('Uploading file...')

// Later, dismiss it
loadingToast.dismiss()
```

**Toast Options:**

```javascript
showError('Error message', {
  title: 'Error',          // Optional title
  duration: 5000,          // Auto-dismiss time (0 = manual)
  position: 'top-right',   // top-right, top-left, top-center, etc.
  dismissible: true,       // Show close button
  action: {
    label: 'Retry',
    onClick: () => { /* retry logic */ }
  }
})
```

### 3. Error Logger Service

Captures errors and sends them to backend for analysis.

```javascript
import { initializeErrorLogger } from '@utils/error-logger'

// Initialize in main.jsx
const errorLogger = initializeErrorLogger({
  apiEndpoint: '/api/logs',
  enableLocalStorage: true,
  isDevelopment: process.env.NODE_ENV === 'development',
})

// Log errors manually
errorLogger.logError(new Error('Something went wrong'), {
  component: 'Dashboard',
  action: 'Loading companies',
  userId: 123,
})

// Log API errors
errorLogger.logApiError(error, {
  endpoint: '/api/companies',
  method: 'GET',
})

// Log validation errors
errorLogger.logValidationError({
  email: 'Invalid email format',
  password: 'Password too short',
})

// Log network errors
errorLogger.logNetworkError(error, {
  endpoint: '/api/data',
})
```

**Features:**
- Batches logs before sending
- Stores errors locally in localStorage
- Global error handler for uncaught errors
- Promise rejection handler
- Automatic retry if server unavailable

### 4. Retry Service

Implements exponential backoff for failed requests.

```javascript
import { retryFetch, retryAsync } from '@utils/retry-service'

// Retry a fetch request
const response = await retryFetch('/api/data', {
  method: 'GET',
}, {
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
})

// Retry an async function
const result = await retryAsync(async () => {
  return await someAsyncOperation()
}, {
  maxRetries: 3,
  isRetryable: (error) => error.status >= 500,
})
```

**Configuration:**

```javascript
{
  maxRetries: 3,            // Maximum number of retries
  initialDelay: 1000,       // Initial delay in ms
  maxDelay: 30000,          // Maximum delay in ms
  backoffMultiplier: 2,     // Exponential backoff multiplier
  jitterFactor: 0.1,        // Add 10% randomness to prevent thundering herd
  isRetryable: (error, attempt) => {
    // Custom retry logic
    return error.status >= 500
  }
}
```

**Retry Logic:**
- Retries on network errors
- Retries on timeouts
- Retries on 5xx server errors (500, 502, 503)
- Retries on 429 (rate limit)
- Does NOT retry on 4xx client errors (except 429)

### 5. API Client

Handles HTTP requests with integrated error handling, retry logic, and logging.

```javascript
import { initializeApiClient } from '@utils/api-client'

// Initialize in App.jsx
const api = initializeApiClient({
  baseUrl: 'http://localhost:3000/api',
  timeout: 30000,
  showErrors: true,
  retryOptions: {
    maxRetries: 3,
    initialDelay: 1000,
  },
  onUnauthorized: () => {
    // Redirect to login
    window.location.href = '/login'
  },
})

// GET request
const companies = await api.get('/companies')

// POST request
const newCompany = await api.post('/companies', {
  name: 'Acme Corp',
  industryId: 1,
})

// PUT request (full update)
const updated = await api.put('/companies/123', {
  name: 'New Name',
  industryId: 2,
})

// PATCH request (partial update)
const patched = await api.patch('/companies/123', {
  name: 'Updated Name',
})

// DELETE request
await api.delete('/companies/123')

// Upload file
const uploaded = await api.uploadFile(
  '/companies/123/logo',
  fileInput.files[0],
  { tenantId: 'tenant-123' },
  (progress) => console.log(`${progress}% uploaded`)
)
```

**Request Interceptors:**

```javascript
api.addRequestInterceptor(async (config) => {
  // Modify request before sending
  config.headers['X-Custom-Header'] = 'value'
  
  // You can also make async calls
  const token = await getAuthToken()
  config.headers['Authorization'] = `Bearer ${token}`
})
```

**Response Interceptors:**

```javascript
api.addResponseInterceptor(async (response) => {
  // Modify response after receiving
  return {
    ...response,
    processedAt: new Date(),
  }
})
```

## Error Codes

Error codes are structured by category:

```javascript
import { ErrorCode, getUserFriendlyMessage } from '@utils/error-codes'

// Validation errors
ErrorCode.INVALID_REQUEST        // "Invalid request format"
ErrorCode.VALIDATION_FAILED      // "Validation failed"
ErrorCode.MISSING_REQUIRED_FIELD // "Missing required field"
ErrorCode.INVALID_EMAIL_FORMAT   // "Invalid email format"

// Authentication errors
ErrorCode.UNAUTHORIZED           // "Unauthorized access"
ErrorCode.INVALID_CREDENTIALS    // "Invalid email or password"
ErrorCode.TOKEN_EXPIRED          // "Session expired"
ErrorCode.INSUFFICIENT_PERMISSIONS // "No permission"

// Resource errors
ErrorCode.RESOURCE_NOT_FOUND     // "Resource not found"
ErrorCode.RESOURCE_ALREADY_EXISTS // "Resource already exists"

// Server errors
ErrorCode.INTERNAL_SERVER_ERROR  // "Unexpected error"
ErrorCode.SERVICE_UNAVAILABLE    // "Service unavailable"

// Get user-friendly message
const message = getUserFriendlyMessage(
  error.errorCode,
  'An error occurred. Please try again.'
)
```

## Usage Examples

### Complete App Setup

```jsx
import React, { useEffect } from 'react'
import { ErrorBoundary } from '@utils/ErrorBoundary'
import { ToastContainer } from '@utils/ToastContainer'
import { initializeErrorLogger } from '@utils/error-logger'
import { initializeApiClient } from '@utils/api-client'

function App() {
  useEffect(() => {
    // Initialize error logging
    initializeErrorLogger({
      apiEndpoint: '/api/logs',
      isDevelopment: process.env.NODE_ENV === 'development',
    })

    // Initialize API client
    initializeApiClient({
      baseUrl: process.env.REACT_APP_API_URL,
      onUnauthorized: () => {
        // Handle unauthorized - redirect to login
        window.location.href = '/login'
      },
    })
  }, [])

  return (
    <ErrorBoundary>
      <ToastContainer />
      {/* Your app routes and components */}
    </ErrorBoundary>
  )
}

export default App
```

### Using Error Handling in a Component

```jsx
import { useState } from 'react'
import { getApiClient } from '@utils/api-client'
import { showError, showSuccess, showLoading } from '@utils/toast-service'
import { ErrorBoundary } from '@utils/ErrorBoundary'

function CompanyForm() {
  const [loading, setLoading] = useState(false)
  const api = getApiClient()

  async function handleSubmit(formData) {
    setLoading(true)
    const loadingToast = showLoading('Saving company...')

    try {
      const result = await api.post('/companies', formData)
      loadingToast.dismiss()
      showSuccess('Company saved successfully!')
      return result
    } catch (error) {
      loadingToast.dismiss()
      // Error is already shown by API client
    } finally {
      setLoading(false)
    }
  }

  return (
    <ErrorBoundary>
      <form onSubmit={(e) => {
        e.preventDefault()
        handleSubmit(new FormData(e.target))
      }}>
        {/* Form fields */}
        <button disabled={loading}>Save</button>
      </form>
    </ErrorBoundary>
  )
}

export default CompanyForm
```

### Handling Specific Error Codes

```jsx
import { getApiClient, ErrorCode } from '@utils'

async function fetchCompany(companyId) {
  const api = getApiClient()
  
  try {
    return await api.get(`/companies/${companyId}`)
  } catch (error) {
    if (error.errorCode === ErrorCode.RESOURCE_NOT_FOUND) {
      // Handle not found
      showError('Company not found')
    } else if (error.errorCode === ErrorCode.INSUFFICIENT_PERMISSIONS) {
      // Handle permission denied
      showError('You do not have permission to view this company')
    } else {
      // Handle generic error (already shown by API client)
    }
    
    throw error
  }
}
```

### Custom Error Handling

```jsx
import { ErrorLogger, showError } from '@utils'

const errorLogger = new ErrorLogger({
  apiEndpoint: '/api/logs',
  enableLocalStorage: true,
})

try {
  // Some operation
} catch (error) {
  // Log the error
  errorLogger.logError(error, {
    component: 'Dashboard',
    action: 'Load data',
    userId: currentUser.id,
  })

  // Show user-friendly message
  showError('Failed to load data. Please try again.')
}
```

## Best Practices

1. **Always wrap components with ErrorBoundary**
   ```jsx
   <ErrorBoundary>
     <YourComponent />
   </ErrorBoundary>
   ```

2. **Use specific error codes** for handling different scenarios
   ```javascript
   if (error.errorCode === ErrorCode.UNAUTHORIZED) {
     // Handle auth
   }
   ```

3. **Provide context in error logs**
   ```javascript
   errorLogger.logError(error, {
     component: 'Dashboard',
     action: 'Load companies',
     userId: user.id,
   })
   ```

4. **Use loading toasts** for long operations
   ```javascript
   const toast = showLoading('Processing...')
   try {
     // Long operation
   } finally {
     toast.dismiss()
   }
   ```

5. **Never expose sensitive data** in error messages
   ```javascript
   // Good
   showError('Invalid email or password')

   // Bad
   showError(`User ${email} not found`)
   ```

6. **Handle network errors gracefully**
   ```javascript
   try {
     await api.get('/data')
   } catch (error) {
     if (error.message.includes('Network')) {
       showError('Network error. Please check your connection.')
     }
   }
   ```

7. **Test error scenarios**
   ```javascript
   it('should show error toast on API failure', async () => {
     jest.spyOn(api, 'get').mockRejectedValueOnce(new Error('API Error'))
     // Test error handling
   })
   ```

## Debugging

### Enable Debug Logging

```javascript
const errorLogger = initializeErrorLogger({
  isDevelopment: true,
  enableConsole: true,
})

const api = initializeApiClient({
  // API client logs will be shown in console
})
```

### View Stored Error Logs

```javascript
import { getErrorLogger } from '@utils/error-logger'

const logger = getErrorLogger()
const logs = logger.getLocalLogs()
console.log(logs) // View all stored errors
```

### Clear Stored Error Logs

```javascript
const logger = getErrorLogger()
logger.clearLocalLogs()
```

## Performance Considerations

1. **Error Batching**: Logs are batched before sending (reduces requests)
2. **Local Storage**: Errors stored locally if backend unavailable
3. **Toast Deduplication**: Same error won't show multiple toasts
4. **Retry with Backoff**: Prevents overwhelming server with retries

## Security Considerations

1. **No Sensitive Data**: Never log passwords or tokens
2. **Request ID Tracking**: All requests include unique ID for tracing
3. **Error Details**: Minimized in production responses
4. **HTTPS Only**: API client should use HTTPS in production
5. **Token Refresh**: Automatic re-authentication on token expiry
