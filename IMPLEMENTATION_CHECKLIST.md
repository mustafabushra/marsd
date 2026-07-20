# Error Handling Implementation Checklist

## Backend Setup Checklist

### Phase 1: Files Created ✅
- [x] `backend/src/common/constants/error-codes.ts` - Error code definitions (50+ codes)
- [x] `backend/src/common/exceptions/base-exception.ts` - Base exception class
- [x] `backend/src/common/exceptions/index.ts` - 11 custom exception classes
- [x] `backend/src/common/logger/logger.service.ts` - Logging service
- [x] `backend/src/common/filters/http-exception.filter.ts` - Global exception filter
- [x] `backend/src/common/pipes/validation.pipe.ts` - Enhanced validation pipe
- [x] `backend/src/common/middleware/request-logger.middleware.ts` - Request logging middleware
- [x] `backend/src/common/common.module.ts` - Module definition
- [x] `backend/src/common/index.ts` - Central exports
- [x] `backend/src/common/ERROR_HANDLING_GUIDE.md` - Documentation

### Phase 2: Package Dependencies ⚠️
Backend needs Winston logger (optional, currently uses file I/O):
```bash
cd backend
npm install winston
```

### Phase 3: App Module Integration
**File to Update:** `backend/src/app.module.ts`

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { 
  HttpExceptionFilter, 
  ValidationPipe, 
  CommonModule,
  RequestLoggerMiddleware 
} from '@common'

@Module({
  imports: [
    CommonModule,
    // ... other modules
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*')
  }
}
```

**Status:** ⏳ Awaiting integration

### Phase 4: Controller Usage Testing
**Test Files to Create:**
- [ ] `backend/src/common/tests/exceptions.spec.ts` - Exception class tests
- [ ] `backend/src/common/tests/logger.spec.ts` - Logger service tests
- [ ] `backend/src/common/tests/validation.spec.ts` - Validation pipe tests

**Example Test:**
```typescript
import { ValidationException } from '@common/exceptions'

describe('Exceptions', () => {
  it('should create ValidationException', () => {
    const exc = new ValidationException('Test error', { field: 'email' })
    expect(exc.errorCode).toBe(ErrorCode.VALIDATION_FAILED)
  })
})
```

**Status:** ⏳ Not yet created

### Phase 5: Main.ts Update
**File to Update:** `backend/src/main.ts`

Current state:
```typescript
app.useGlobalPipes(new ValidationPipe({ transform: true }))
```

Should be changed to:
```typescript
// Remove the above line - it's now handled by APP_PIPE in AppModule
// The custom ValidationPipe will be registered there instead
```

**Status:** ⏳ Review needed

---

## Frontend Setup Checklist

### Phase 1: Files Created ✅
- [x] `src/utils/error-codes.js` - Error code definitions
- [x] `src/utils/toast-service.js` - Toast notification service
- [x] `src/utils/error-logger.js` - Error logging service
- [x] `src/utils/retry-service.js` - Retry logic with exponential backoff
- [x] `src/utils/api-client.js` - HTTP client with error handling
- [x] `src/utils/ErrorBoundary.jsx` - React error boundary
- [x] `src/utils/ToastContainer.jsx` - Toast container component
- [x] `src/utils/index.js` - Updated with new exports
- [x] `src/utils/ERROR_HANDLING_GUIDE.md` - Documentation

### Phase 2: App Component Integration
**File to Update:** `src/App.jsx` or `src/main.jsx`

```jsx
import { useEffect } from 'react'
import { ErrorBoundary } from '@utils/ErrorBoundary'
import { ToastContainer } from '@utils/ToastContainer'
import { initializeErrorLogger } from '@utils/error-logger'
import { initializeApiClient } from '@utils/api-client'

export default function App() {
  useEffect(() => {
    // Initialize error handling
    initializeErrorLogger({
      apiEndpoint: '/api/logs',
      isDevelopment: process.env.NODE_ENV === 'development',
    })

    // Initialize API client
    initializeApiClient({
      baseUrl: process.env.REACT_APP_API_URL,
      onUnauthorized: () => {
        // Handle token expired
        window.location.href = '/login'
      },
    })
  }, [])

  return (
    <ErrorBoundary>
      <ToastContainer />
      {/* Your routes and components */}
    </ErrorBoundary>
  )
}
```

**Status:** ⏳ Awaiting integration

### Phase 3: Component Usage Examples
**Files to Update/Create:**
- [ ] `src/pages/Dashboard.jsx` - Update with error handling
- [ ] `src/components/CompanyForm.jsx` - Update with error handling
- [ ] `src/services/companyService.js` - Use API client

**Example Usage:**
```jsx
import { getApiClient, showError, showSuccess } from '@utils'

function Dashboard() {
  const api = getApiClient()
  
  async function loadData() {
    try {
      const data = await api.get('/companies')
      showSuccess('Data loaded')
    } catch (error) {
      // Error handled by API client
    }
  }

  return <button onClick={loadData}>Load</button>
}
```

**Status:** ⏳ Not yet updated

### Phase 4: Environment Variables
**File to Create/Update:** `.env.local`

```
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_ERROR_LOG_ENDPOINT=/api/logs
REACT_APP_ENV=development
```

**Status:** ⏳ Verify/create

---

## Integration Priority

### HIGH PRIORITY (Must Do First)
1. Backend: Update `app.module.ts` to register filters/pipes/middleware
2. Frontend: Update `App.jsx` to wrap with ErrorBoundary and ToastContainer
3. Frontend: Initialize error logger and API client in useEffect

### MEDIUM PRIORITY (Do Next)
1. Update main controllers to use custom exceptions
2. Create DTO classes with validation decorators
3. Update React components to use showError/showSuccess toasts
4. Test error scenarios in development

### LOW PRIORITY (Nice to Have)
1. Create comprehensive test suite
2. Add Winston for advanced logging
3. Add error analytics/monitoring
4. Set up error rate alerts

---

## Testing Checklist

### Backend Testing
- [ ] Test ValidationException formatting
- [ ] Test NotFoundException response
- [ ] Test GlobalExceptionFilter with various exception types
- [ ] Verify request IDs are generated and logged
- [ ] Check log file creation and rotation
- [ ] Verify sensitive data is not logged

### Frontend Testing
- [ ] Test ErrorBoundary catches render errors
- [ ] Test ToastContainer displays all notification types
- [ ] Test API client retry logic with mock failures
- [ ] Test error logger batching and local storage
- [ ] Test token expiration handling
- [ ] Verify no sensitive data in logs

---

## Verification Steps

### Backend Verification
1. Start backend: `npm run start:dev`
2. Make a request with invalid data
3. Check response format:
   ```bash
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{"invalid": "data"}'
   ```
4. Verify response includes error code and message
5. Check `logs/error-YYYY-MM-DD.log` file exists

### Frontend Verification
1. Start frontend: `npm run dev`
2. Open browser console
3. Make request that will fail
4. Verify error toast appears
5. Check localStorage for error logs:
   ```javascript
   localStorage.getItem('marsad_error_logs')
   ```

---

## Troubleshooting

### Backend Issues

**Error: "Cannot find module '@common'"**
- Solution: Ensure all files are in `backend/src/common/`
- Check `tsconfig.json` has proper path mapping

**Error: "ValidationPipe is not a provider"**
- Solution: Register in app.module.ts using APP_PIPE token
- Don't use it directly in main.ts

**Logs not writing to file**
- Solution: Check file permissions on `logs/` directory
- Ensure NODE_ENV is set to 'production' for file logging

### Frontend Issues

**Error: "Cannot find module '@utils'"**
- Solution: Check file paths are relative to src/utils
- Verify index.js exports all utilities

**Toasts not appearing**
- Solution: Ensure ToastContainer is rendered
- Check CSS is loaded
- Verify z-index doesn't conflict with other elements

**API client not retrying**
- Solution: Check error is in retry-able list
- Verify retry options in initializeApiClient
- Check network tab for actual requests

---

## Files Summary

### Backend Files: 10
- Constants: 1
- Exceptions: 2
- Logger: 1
- Filters: 1
- Pipes: 1
- Middleware: 1
- Module: 1
- Index: 1
- Documentation: 1

### Frontend Files: 9
- Error Codes: 1
- Toast Service: 1
- Error Logger: 1
- Retry Service: 1
- API Client: 1
- Components: 2
- Index: 1
- Documentation: 1

### Total: 19 new files + 2 documentation files = 21 files

---

## Quick Start

### For Backend:
```bash
cd backend
# Verify files exist
ls -la src/common/

# No additional npm install needed (uses NestJS built-ins)
# Update app.module.ts with integration code above
npm run start:dev
```

### For Frontend:
```bash
cd marsd
# Verify files exist
ls -la src/utils/

# No additional npm install needed
# Update App.jsx with integration code above
npm run dev
```

---

## Next Immediate Actions

1. **Backend**: Review and update `app.module.ts` ⏳
2. **Frontend**: Review and update `App.jsx` ⏳
3. **Both**: Run tests to verify integration ⏳
4. **Both**: Deploy to staging for testing ⏳

---

## Questions?

Refer to:
- Backend: `backend/src/common/ERROR_HANDLING_GUIDE.md`
- Frontend: `src/utils/ERROR_HANDLING_GUIDE.md`
- Summary: `ERROR_HANDLING_SUMMARY.md`

Last Updated: 2026-07-18
Status: ✅ Code Complete, ⏳ Integration Pending
