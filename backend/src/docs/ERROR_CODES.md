# Marsad API Error Codes Reference

Complete guide to error codes, HTTP status codes, and handling strategies.

## Error Response Format

All error responses follow this standardized format:

```json
{
  "statusCode": 400,
  "errorCode": "ERR_4002",
  "message": "Validation failed",
  "details": {
    "field": "email",
    "issue": "Invalid email format"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/auth/login"
}
```

## Error Code Categories

### Validation Errors (4000-4099)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_4001 | Invalid request format | 400 | No | Request body is malformed JSON or missing required structure |
| ERR_4002 | Validation failed | 400 | No | Input validation failed for one or more fields |
| ERR_4003 | Missing required field | 400 | No | Required field is missing from request |
| ERR_4004 | Invalid email format | 400 | No | Email format is invalid |
| ERR_4005 | Invalid password format | 400 | No | Password doesn't meet security requirements |
| ERR_4006 | Invalid query parameter | 400 | No | Query parameter has invalid value or format |

### Authentication Errors (4100-4199)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_4100 | Unauthorized access | 401 | No | No valid authentication provided |
| ERR_4101 | Invalid credentials | 401 | No | Email/password combination is incorrect |
| ERR_4102 | Token has expired | 401 | Yes | JWT token has expired, refresh needed |
| ERR_4103 | Invalid or malformed token | 401 | No | JWT token is invalid or malformed |
| ERR_4104 | Authorization token is required | 401 | No | Authorization header missing |
| ERR_4105 | Failed to refresh token | 401 | Yes | Token refresh operation failed |
| ERR_4106 | Insufficient permissions | 403 | No | User role insufficient for operation |

### Resource Errors (4200-4299)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_4201 | Resource not found | 404 | No | Resource with given ID doesn't exist |
| ERR_4202 | Resource already exists | 409 | No | Attempting to create duplicate resource |
| ERR_4203 | Resource has been deleted | 404 | No | Resource was previously deleted |
| ERR_4204 | Resource is currently locked | 423 | Yes | Resource is locked for concurrent operations |
| ERR_4205 | Invalid resource ID | 400 | No | Resource ID format is invalid |
| ERR_4206 | Resource conflict | 409 | No | Operation conflicts with resource state |

### Business Logic Errors (4300-4399)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_4301 | Cannot transition from X to Y | 422 | No | Invalid state transition attempted |
| ERR_4302 | Operation not allowed | 422 | No | Operation violates business rules |
| ERR_4303 | Insufficient funds available | 422 | No | Quota or resource limit exceeded |
| ERR_4304 | Quota exceeded for resource | 429 | Yes | Daily/monthly limit exceeded |
| ERR_4305 | Duplicate submission detected | 422 | No | Duplicate report or submission |
| ERR_4306 | Business rule violation | 422 | No | Violates business logic constraints |

### Rate Limiting (4400-4499)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_4401 | Rate limit exceeded | 429 | Yes | Request rate limit exceeded |
| ERR_4402 | Request throttled | 429 | Yes | Request was throttled, retry later |
| ERR_4403 | Too many requests | 429 | Yes | Too many concurrent requests |

**Rate Limits:**
- Global: 1000 requests/hour per IP
- Authentication: 10 failed attempts/15 minutes (IP-based)
- Search: 100 requests/minute per user
- Report submission: 50 reports/day per user

### Server Errors (5000-5999)

| Code | Message | HTTP Status | Retry | Description |
|------|---------|-------------|-------|-------------|
| ERR_5000 | An unexpected error occurred | 500 | Yes | Unhandled server error |
| ERR_5001 | Database operation failed | 500 | Yes | Database query or transaction failed |
| ERR_5002 | External service error | 502 | Yes | Third-party service failure |
| ERR_5003 | Service configuration error | 500 | No | Service misconfigured |
| ERR_5004 | Request timeout | 504 | Yes | Operation exceeded time limit |
| ERR_5005 | Service is currently unavailable | 503 | Yes | Service maintenance or overload |
| ERR_5006 | Required dependency failed | 500 | Yes | Critical dependency unavailable |

## Handling Strategies

### Non-Retryable Errors (4xxx)

These represent client errors and should not be retried:

```javascript
// Example: Validation Error
if (response.statusCode >= 400 && response.statusCode < 500) {
  // Display error to user
  console.error(response.message)
  // Fix the input and retry
}
```

### Retryable Errors (5xxx, specific 4xxx)

Implement exponential backoff with jitter:

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryable(error.errorCode)) throw error
      
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
```

### Rate Limiting Response Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1689687600
```

When rate limited (429), also included:

```
Retry-After: 60
```

## Common Error Scenarios

### 1. Authentication Failures

**Scenario:** User login attempt with wrong password

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "wrong"}'
```

**Response:**

```json
{
  "statusCode": 401,
  "errorCode": "ERR_4101",
  "message": "Invalid email or password",
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/auth/login"
}
```

### 2. Token Expiration

**Scenario:** Request with expired JWT

```bash
curl -X GET http://localhost:3000/companies/search?q=test \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**

```json
{
  "statusCode": 401,
  "errorCode": "ERR_4102",
  "message": "Token has expired",
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/companies/search"
}
```

**Solution:** Refresh token using `/auth/refresh` endpoint

### 3. Validation Errors

**Scenario:** Invalid email in registration

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ahmed",
    "email": "invalid-email",
    "password": "SecurePass123",
    "crNumber": "1234567890"
  }'
```

**Response:**

```json
{
  "statusCode": 400,
  "errorCode": "ERR_4004",
  "message": "Invalid email format",
  "details": {
    "field": "email",
    "value": "invalid-email"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/auth/register"
}
```

### 4. Resource Not Found

**Scenario:** Accessing non-existent company

```bash
curl -X GET http://localhost:3000/companies/nonexistent/report \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "statusCode": 404,
  "errorCode": "ERR_4201",
  "message": "Company not found",
  "details": {
    "resource": "Company",
    "id": "nonexistent"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/companies/nonexistent/report"
}
```

### 5. Insufficient Permissions

**Scenario:** Non-admin accessing admin endpoint

```bash
curl -X GET http://localhost:3000/admin/reports \
  -H "Authorization: Bearer <regular_user_token>"
```

**Response:**

```json
{
  "statusCode": 403,
  "errorCode": "ERR_4106",
  "message": "Insufficient permissions for this action",
  "details": {
    "required": "platform_admin",
    "actual": "user"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/admin/reports"
}
```

### 6. Rate Limiting

**Scenario:** Exceeding rate limit

**Response:**

```json
{
  "statusCode": 429,
  "errorCode": "ERR_4401",
  "message": "Rate limit exceeded. Please try again later.",
  "details": {
    "limit": 100,
    "window": "1 minute"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/companies/search"
}
```

**Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1689687600
Retry-After: 60
```

### 7. Duplicate Resource

**Scenario:** Attempting to create duplicate company

```bash
curl -X POST http://localhost:3000/companies/request-add \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Saudi Oil Company",
    "crNumber": "1010569444"
  }'
```

**Response (second time):**

```json
{
  "statusCode": 409,
  "errorCode": "ERR_4202",
  "message": "Company already exists",
  "details": {
    "existingId": "comp_123456",
    "existingStatus": "approved"
  },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/companies/request-add"
}
```

## Error Handling Best Practices

### 1. Always Check Error Code, Not Just Status

```javascript
function handleError(error) {
  switch (error.errorCode) {
    case 'ERR_4102': // Token expired
      refreshToken()
      return retryRequest()
    
    case 'ERR_4101': // Invalid credentials
      showLoginError("Invalid email or password")
      return false
    
    case 'ERR_4401': // Rate limited
      wait(error.details.retryAfter)
      return retryRequest()
    
    default:
      showError(error.message)
      return false
  }
}
```

### 2. Implement Circuit Breaker

```javascript
class ApiClient {
  async request(endpoint, options) {
    const maxRetries = 3
    let lastError
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(endpoint, options)
        if (response.ok) return response.json()
        
        const error = await response.json()
        if (!this.isRetryable(error)) throw error
        lastError = error
        
      } catch (error) {
        lastError = error
        if (i < maxRetries - 1) {
          await this.exponentialBackoff(i)
        }
      }
    }
    throw lastError
  }
  
  isRetryable(error) {
    const retryableCodes = [
      'ERR_4401', 'ERR_4402', 'ERR_4403',
      'ERR_5000', 'ERR_5001', 'ERR_5004', 'ERR_5005'
    ]
    return retryableCodes.includes(error.errorCode)
  }
}
```

### 3. Provide User-Friendly Messages

```javascript
const UserFriendlyMessages = {
  'ERR_4102': 'Your session has expired. Please log in again.',
  'ERR_4101': 'Email or password is incorrect.',
  'ERR_4401': 'Too many requests. Please wait a moment and try again.',
  'ERR_5000': 'Something went wrong. Please try again later.',
}

function displayError(error) {
  const message = UserFriendlyMessages[error.errorCode] || error.message
  showToast('error', message)
}
```

## Testing Error Scenarios

Use these curl commands to test error handling:

```bash
# Test validation error
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid"}'

# Test unauthorized
curl -X GET http://localhost:3000/admin/reports

# Test token expired
curl -X GET http://localhost:3000/companies/search?q=test \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test not found
curl -X GET http://localhost:3000/companies/nonexistent/report \
  -H "Authorization: Bearer <valid_token>"
```

## Monitoring & Logging

Key metrics to monitor:

- **Error rate by code:** Track trends for each error code
- **Rate limit hits:** Monitor quota consumption
- **Authentication failures:** Track login attempts and patterns
- **External service failures:** Monitor third-party dependency health
- **Response times:** Alert on timeout errors

## Support

For error-related support:

- **Email:** support@marsad.local
- **Documentation:** https://docs.marsad.local/errors
- **Status Page:** https://status.marsad.local
