# Marsad Frontend API Client Documentation

Complete guide for using the Marsad API client in the frontend application.

## Overview

The Marsad API Client is a production-ready HTTP client with:

- ✅ Automatic token management and refresh
- ✅ Retry logic with exponential backoff
- ✅ Error handling with structured error codes
- ✅ Type-safe responses with TypeScript
- ✅ Support for all API endpoints
- ✅ Rate limit awareness
- ✅ Request/response interceptors

## Installation & Setup

The API client is already integrated. Import it in your components:

```typescript
import { apiClient } from '@/services/api-client'
```

### Configuration

Configure the API client in your environment:

```bash
# .env.development
VITE_API_URL=http://localhost:3000

# .env.production
VITE_API_URL=https://api.marsad.local
```

## Basic Usage

### Authentication

```typescript
import { apiClient } from '@/services/api-client'
import type { AuthResponse } from '@/types/api-responses'

// Register new user
const user = await apiClient.auth.register({
  name: 'أحمد الشريف',
  email: 'ahmad@company.sa',
  password: 'SecurePass123',
  crNumber: '1010569444',
  phone: '+966501234567',
  city: 'الرياض',
  sector: 'تجارة إلكترونية',
})

// Login
const auth: AuthResponse = await apiClient.auth.login({
  email: 'ahmad@company.sa',
  password: 'SecurePass123',
})

// Tokens are automatically saved
console.log(auth.user.email) // ahmad@company.sa
console.log(auth.expiresIn) // 900 (15 minutes)

// Logout
await apiClient.auth.logout()

// Check authentication status
if (apiClient.isAuthenticated()) {
  console.log('User is logged in')
}
```

### Company Operations

```typescript
// Search companies
const results = await apiClient.companies.search({
  q: 'سابك',
  page: 1,
  limit: 20,
})

console.log(results.data) // Company[]
console.log(results.total) // 150
console.log(results.page) // 1

// Get company report
const report = await apiClient.companies.getReport('comp_123456')
console.log(report.trustScore) // 92.5
console.log(report.transactionHistory) // Transaction[]

// Request to add new company
const newCompany = await apiClient.companies.requestAdd({
  name: 'شركة التقنية المتقدمة',
  crNumber: '1234567890',
  sector: 'تكنولوجيا',
  city: 'الرياض',
})

// Claim company profile
await apiClient.companies.claimProfile('comp_123456')
```

### Report Operations

```typescript
// Submit transaction report
const report = await apiClient.reports.create({
  targetCompanyId: 'comp_123456',
  dealAmountRange: '50000-100000',
  paymentCommitment: '30',
  delayDays: 15,
  defaulted: false,
  dealtAt: new Date('2024-07-15'),
})

// Get user's reports
const myReports = await apiClient.reports.getMyReports({
  page: 1,
  limit: 20,
})

// Get review queue (reviewers only)
const queue = await apiClient.reports.getReviewQueue({
  page: 1,
  limit: 20,
})

// Approve report
const approved = await apiClient.reports.approve(report.id)

// Reject report
const rejected = await apiClient.reports.reject(report.id, 'Invalid documentation')

// Request more info
await apiClient.reports.requestInfo(report.id, 'Need additional proof')

// Upload document
const uploadResponse = await apiClient.reports.uploadDocument(
  report.id,
  {
    reportId: report.id,
    fileName: 'invoice.pdf',
    fileSize: 102400,
    mimeType: 'application/pdf',
  }
)

// Upload file to the provided URL
await fetch(uploadResponse.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'application/pdf',
  },
})
```

### Trust Score

```typescript
// Get trust score
const trustScore = await apiClient.trustScore.get('comp_123456')

console.log(trustScore.score) // 92.5 (0-100)
console.log(trustScore.level) // 'excellent'
console.log(trustScore.basedOn.totalReports) // 150
console.log(trustScore.factors) // TrustScoreFactor[]
```

### Admin Operations

```typescript
// Get pending reports
const pending = await apiClient.admin.getPendingReports({
  page: 1,
  limit: 20,
})

// Get all reports with filter
const allReports = await apiClient.admin.getAllReports({
  page: 1,
  limit: 20,
  status: 'approved',
})

// Batch approve reports
const result = await apiClient.admin.batchApproveReports([
  'report_1',
  'report_2',
  'report_3',
])

console.log(result.approved) // 3
console.log(result.failed) // 0

// Get companies
const companies = await apiClient.admin.getCompanies({
  page: 1,
  limit: 20,
  status: 'active',
})

// Approve/reject company
await apiClient.admin.approveCompany('comp_123')
await apiClient.admin.rejectCompany('comp_456', 'Invalid CR number')

// Get users
const users = await apiClient.admin.getUsers({
  page: 1,
  limit: 20,
  role: 'user',
})

// Update user status
await apiClient.admin.updateUserStatus('user_123', 'suspended')

// Get audit logs
const logs = await apiClient.admin.getAuditLogs({
  page: 1,
  limit: 50,
  action: 'report_approved',
  entity: 'Report',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-07-18T23:59:59Z',
})

// Bulk import companies
const importResult = await apiClient.admin.bulkImportCompanies({
  companies: [
    {
      name: 'شركة أ',
      crNumber: '1234567890',
      sector: 'تجارة',
      city: 'الرياض',
    },
    {
      name: 'شركة ب',
      crNumber: '0987654321',
      sector: 'تصنيع',
      city: 'جدة',
    },
  ],
})

console.log(importResult.imported) // 2
console.log(importResult.failed) // 0
```

## Error Handling

### Basic Error Handling

```typescript
import type { ApiError } from '@/types/api-responses'

try {
  const auth = await apiClient.auth.login({
    email: 'user@example.com',
    password: 'wrong',
  })
} catch (error) {
  const apiError = error as ApiError

  console.error('Error Code:', apiError.errorCode) // ERR_4101
  console.error('Status:', apiError.statusCode) // 401
  console.error('Message:', apiError.message) // Invalid email or password
  console.error('Details:', apiError.details)
}
```

### Error Code Handling

```typescript
try {
  await apiClient.companies.search({ q: '' })
} catch (error) {
  const apiError = error as ApiError

  switch (apiError.errorCode) {
    case 'ERR_4002': // Validation error
      showValidationError(apiError.message)
      break

    case 'ERR_4102': // Token expired
      refreshToken()
      retryRequest()
      break

    case 'ERR_4106': // Insufficient permissions
      showPermissionError()
      break

    case 'ERR_4401': // Rate limited
      showRateLimitWarning()
      break

    case 'ERR_5000': // Server error
      showServerError()
      break

    default:
      showGenericError(apiError.message)
  }
}
```

### Retry Logic

The API client automatically retries failed requests with exponential backoff:

```typescript
// Retryable errors (automatically retried)
// - ERR_4102 (Token expired)
// - ERR_4401, ERR_4402, ERR_4403 (Rate limit)
// - ERR_5000, ERR_5001, ERR_5004, ERR_5005 (Server errors)

// Non-retryable errors (thrown immediately)
// - ERR_4001, ERR_4002 (Validation)
// - ERR_4101 (Invalid credentials)
// - ERR_4201 (Not found)
```

## React Integration

### Custom Hook for API Calls

```typescript
import { useState, useCallback } from 'react'
import { apiClient } from '@/services/api-client'
import type { ApiError } from '@/types/api-responses'

export function useApi<T>(apiCall: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await apiCall()
      setData(result)
      return result
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError)
      throw apiError
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  return { data, loading, error, execute }
}
```

### Usage in Component

```typescript
import { useApi } from '@/hooks/useApi'
import { apiClient } from '@/services/api-client'

function CompanySearch({ query }: { query: string }) {
  const { data, loading, error, execute } = useApi(async () => {
    return apiClient.companies.search({ q: query, page: 1, limit: 20 })
  })

  React.useEffect(() => {
    if (query) execute()
  }, [query, execute])

  if (loading) return <div>جاري البحث...</div>
  if (error) return <div>خطأ: {error.message}</div>
  if (!data) return null

  return (
    <div>
      <p>وجدت {data.total} شركة</p>
      <ul>
        {data.data.map(company => (
          <li key={company.id}>{company.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

### useQuery / useInfiniteQuery (React Query)

```typescript
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/services/api-client'

// Query: Fetch data
function useCompanyReport(companyId: string) {
  return useQuery({
    queryKey: ['company', companyId],
    queryFn: () => apiClient.companies.getReport(companyId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Mutation: Create/Update data
function useSubmitReport() {
  return useMutation({
    mutationFn: (data) => apiClient.reports.create(data),
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

// Usage
function ReportForm() {
  const { mutate, isLoading } = useSubmitReport()

  const handleSubmit = (data) => {
    mutate(data)
  }

  return <form onSubmit={handleSubmit}>{/* form fields */}</form>
}
```

## Token Management

### Automatic Token Refresh

Tokens are automatically refreshed when expired:

```typescript
// Token expires after 15 minutes
// Client will automatically refresh using refreshToken
// Your request will be retried after refresh

const results = await apiClient.companies.search({ q: 'test' })
// Works even if token was expired at request start
```

### Manual Token Management

```typescript
// Set tokens from external source
apiClient.setTokens(accessToken, refreshToken)

// Get current token
const token = apiClient.getAccessToken()

// Check if authenticated
if (apiClient.isAuthenticated()) {
  // Make API calls
}

// Logout
await apiClient.auth.logout()
```

### Persist Tokens

Tokens are automatically persisted to localStorage:

```typescript
// On app start
import { apiClient } from '@/services/api-client'

// Tokens are loaded from localStorage automatically
if (apiClient.isAuthenticated()) {
  // Restore user session
}
```

## Pagination

All list endpoints support pagination:

```typescript
// Get page 1 with 20 items
const page1 = await apiClient.companies.search({
  q: 'test',
  page: 1,
  limit: 20,
})

// Get page 2
const page2 = await apiClient.companies.search({
  q: 'test',
  page: 2,
  limit: 20,
})

// Pagination info
console.log(page1.total) // 342
console.log(page1.page) // 1
console.log(page1.limit) // 20
```

## Rate Limiting

The API has rate limits. Monitor the headers:

```typescript
// Rate limit headers are in fetch response
// But API client handles retries automatically

// If you hit rate limit, the client will:
// 1. Wait the specified time
// 2. Retry the request
// 3. Transparent to caller
```

## TypeScript Types

Use TypeScript interfaces for type safety:

```typescript
import type {
  Company,
  Report,
  AuthResponse,
  CompanyReport,
  TrustScore,
  ApiError,
} from '@/types/api-responses'

// Fully typed API calls
const company: Company = await apiClient.companies.search({...})
const report: Report = await apiClient.reports.create({...})
const auth: AuthResponse = await apiClient.auth.login({...})
```

## Performance Tips

### 1. Request Deduplication

```typescript
// Multiple simultaneous requests to same endpoint
// are automatically deduplicated
const result1 = apiClient.companies.search({ q: 'test' })
const result2 = apiClient.companies.search({ q: 'test' })
// Only one HTTP request made
```

### 2. Caching with React Query

```typescript
import { useQuery } from '@tanstack/react-query'

// Automatic caching and background updates
const { data } = useQuery({
  queryKey: ['company', companyId],
  queryFn: () => apiClient.companies.getReport(companyId),
  staleTime: 5 * 60 * 1000, // Cache for 5 minutes
})
```

### 3. Pagination

Always use pagination for list endpoints:

```typescript
// ❌ Avoid
const allResults = []
for (let i = 1; i <= 100; i++) {
  const page = await apiClient.companies.search({q, page: i})
  allResults.push(...page.data)
}

// ✅ Better
const firstPage = await apiClient.companies.search({q, page: 1})
// Show first page
// Load more on demand
```

## Troubleshooting

### Issue: "Authorization token is required"

**Solution:** Ensure token is set before making authenticated requests:

```typescript
// Login first
await apiClient.auth.login(credentials)

// Then make requests
await apiClient.companies.search({...})
```

### Issue: "Token has expired"

**Solution:** Tokens are automatically refreshed. If still failing:

```typescript
// Manually refresh
await apiClient.auth.refresh()

// Or logout and login again
await apiClient.auth.logout()
await apiClient.auth.login(credentials)
```

### Issue: Network timeout

**Solution:** Check your network and server status:

```typescript
// Increase timeout
const response = await fetch(url, {
  ...options,
  timeout: 60000, // 60 seconds
})
```

### Issue: CORS errors

**Solution:** Ensure backend has CORS enabled:

```typescript
// Backend main.ts should have:
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
})
```

## API Endpoints Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login user |
| POST | `/auth/refresh` | Refresh token |
| GET | `/companies/search` | Search companies |
| GET | `/companies/:id/report` | Get company report |
| POST | `/companies/request-add` | Request add company |
| POST | `/reports` | Create report |
| GET | `/reports/mine` | Get user's reports |
| POST | `/trust-score/:id` | Get trust score |
| GET | `/admin/reports` | Get pending reports |

See [../../backend/src/docs/README.md](../../backend/src/docs/README.md) for complete endpoint reference.

## Support

- **Documentation:** https://docs.marsad.local
- **Issues:** Report bugs in GitHub Issues
- **Email:** support@marsad.local
