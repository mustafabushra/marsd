# Marsad Backend API Documentation

Complete technical documentation for the Marsad Backend REST API.

## Quick Start

### 1. Setup Swagger/OpenAPI Documentation

Install dependencies:

```bash
npm install @nestjs/swagger swagger-ui-express
```

Update `main.ts`:

```typescript
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { setupSwagger } from './docs/swagger.config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ transform: true }))
  app.enableCors()

  // Setup Swagger
  setupSwagger(app)

  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`🚀 Marsad API running on http://localhost:${port}`)
}

bootstrap()
```

### 2. Access Documentation

- **Interactive Docs:** http://localhost:3000/api/docs
- **OpenAPI JSON:** http://localhost:3000/api/docs/json
- **OpenAPI YAML:** See `openapi.yaml` in this directory

## API Overview

### Base URL
- Development: `http://localhost:3000`
- Production: `https://api.marsad.local`

### Authentication

All endpoints (except `/auth/register` and `/auth/login`) require JWT token:

```bash
Authorization: Bearer <jwt_token>
```

Token obtained from `/auth/login` endpoint. Tokens expire after 15 minutes.

### Response Format

All responses follow this structure:

```json
{
  "statusCode": 200,
  "data": { /* response data */ },
  "message": "Success",
  "timestamp": "2024-07-18T10:30:00Z"
}
```

Errors:

```json
{
  "statusCode": 400,
  "errorCode": "ERR_4002",
  "message": "Validation failed",
  "details": { /* error details */ },
  "timestamp": "2024-07-18T10:30:00Z",
  "path": "/auth/login"
}
```

## Core Modules

### 1. Authentication (`/auth`)

Handles user registration, login, and token management.

**Endpoints:**
- `POST /auth/register` - Create new user account
- `POST /auth/login` - Authenticate and get JWT
- `POST /auth/refresh` - Refresh expired token
- `POST /auth/forgot-password` - Request password reset

**Example:**

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "أحمد الشريف",
    "email": "ahmad@company.sa",
    "password": "SecurePass123",
    "crNumber": "1010569444",
    "phone": "+966501234567",
    "city": "الرياض",
    "sector": "تجارة إلكترونية"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmad@company.sa",
    "password": "SecurePass123"
  }'

# Response
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "ahmad@company.sa",
    "name": "أحمد الشريف",
    "role": "user"
  },
  "expiresIn": 900
}
```

### 2. Companies (`/companies`)

Search companies and manage company profiles.

**Endpoints:**
- `GET /companies/search` - Search by name or CR number
- `GET /companies/{id}/report` - Get detailed company report
- `POST /companies/request-add` - Request to add new company
- `POST /companies/claim-profile/{companyId}` - Claim company profile

**Example:**

```bash
# Search companies
curl -X GET "http://localhost:3000/companies/search?q=سابك&page=1&limit=20" \
  -H "Authorization: Bearer <token>"

# Get company report
curl -X GET "http://localhost:3000/companies/comp_123456/report" \
  -H "Authorization: Bearer <token>"

# Response
{
  "id": "comp_123456",
  "name": "شركة سابك",
  "crNumber": "1010569444",
  "sector": "البتروكيماويات",
  "city": "الرياض",
  "trustScore": 92.5,
  "totalReports": 150,
  "approvedReports": 145,
  "averagePaymentDelay": 3,
  "defaultRate": 0.03,
  "status": "active",
  "transactionHistory": [
    {
      "date": "2024-07-18T10:30:00Z",
      "amount": "500000",
      "paymentDelay": 5,
      "defaulted": false,
      "reportedBy": "company_xyz"
    }
  ]
}
```

### 3. Reports (`/reports`)

Submit and manage transaction reports.

**Endpoints:**
- `POST /reports` - Create new transaction report
- `GET /reports/mine` - Get user's reports
- `GET /reports/review-queue` - Get pending reports (reviewers)
- `POST /reports/{id}/approve` - Approve report (reviewers)
- `POST /reports/{id}/reject` - Reject report (reviewers)
- `POST /reports/{id}/request-info` - Request more info (reviewers)
- `POST /reports/{id}/upload-document` - Upload supporting doc

**Example:**

```bash
# Submit transaction report
curl -X POST http://localhost:3000/reports \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetCompanyId": "comp_123456",
    "dealAmountRange": "50000-100000",
    "paymentCommitment": "30",
    "delayDays": 15,
    "defaulted": false,
    "dealtAt": "2024-07-15T10:30:00Z"
  }'

# Response
{
  "id": "report_789",
  "reporterCompanyId": "comp_xyz",
  "targetCompanyId": "comp_123456",
  "dealAmountRange": "50000-100000",
  "paymentCommitment": "30",
  "delayDays": 15,
  "defaulted": false,
  "status": "pending",
  "createdAt": "2024-07-18T10:30:00Z",
  "updatedAt": "2024-07-18T10:30:00Z"
}
```

### 4. Trust Score (`/trust-score`)

Get calculated trust scores for companies.

**Endpoints:**
- `GET /trust-score/{companyId}` - Get trust score

**Example:**

```bash
curl -X GET "http://localhost:3000/trust-score/comp_123456" \
  -H "Authorization: Bearer <token>"

# Response
{
  "companyId": "comp_123456",
  "score": 92.5,
  "level": "excellent",
  "basedOn": {
    "totalReports": 150,
    "approvedReports": 145,
    "averagePaymentDelay": 3,
    "defaultRate": 0.03,
    "reviewPeriod": "Last 12 months"
  },
  "factors": [
    {
      "name": "Payment History",
      "weight": 0.4,
      "impact": "positive",
      "value": 95
    },
    {
      "name": "Default Rate",
      "weight": 0.3,
      "impact": "positive",
      "value": 97
    }
  ],
  "lastCalculated": "2024-07-18T10:30:00Z"
}
```

### 5. Admin (`/admin`)

Administrative operations for platform management.

**Report Management:**
- `GET /admin/reports` - Get pending reports
- `GET /admin/reports/all` - Get all reports
- `PATCH /admin/reports/{id}/approve` - Approve report
- `POST /admin/reports/{id}/reject` - Reject report
- `POST /admin/reports/batch-approve` - Batch approve

**Company Management:**
- `GET /admin/companies` - Get companies list
- `POST /admin/companies/{id}/approve` - Approve company
- `POST /admin/companies/{id}/reject` - Reject company

**User Management:**
- `GET /admin/users` - Get users list
- `PATCH /admin/users/{id}/status` - Update user status

**Audit:**
- `GET /admin/audit-logs` - Get audit logs

**Bulk Operations:**
- `POST /admin/bulk-upload` - Bulk import companies

**Example:**

```bash
# Get pending reports
curl -X GET "http://localhost:3000/admin/reports?page=1&limit=20" \
  -H "Authorization: Bearer <admin_token>"

# Batch approve reports
curl -X POST http://localhost:3000/admin/reports/batch-approve \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reportIds": ["report_1", "report_2", "report_3"]
  }'

# Response
{
  "approved": 3,
  "failed": 0
}
```

## Authentication & Authorization

### Roles

The system has three user roles:

1. **user** - Regular user who can submit reports
2. **reviewer** - Can review and approve/reject reports
3. **platform_admin** - Full platform access

### JWT Token Structure

```javascript
{
  "sub": "user_123",        // User ID
  "email": "user@example.com",
  "role": "user",
  "tenantId": "tenant_456", // Organization ID
  "iat": 1689687000,        // Issued at
  "exp": 1689687900         // Expires in 15 minutes
}
```

### Token Refresh

Tokens expire after 15 minutes. Refresh using:

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Authorization: Bearer <current_token>"
```

## Pagination

List endpoints support pagination:

```bash
# Default: page=1, limit=20
curl -X GET "http://localhost:3000/companies/search?q=test&page=2&limit=50" \
  -H "Authorization: Bearer <token>"

# Response includes pagination info
{
  "data": [...],
  "total": 342,
  "page": 2,
  "limit": 50,
  "totalPages": 7
}
```

## Rate Limiting

Global rate limits:

- **1000 requests per hour** per IP address
- **Authentication endpoints:** 10 failed attempts per 15 minutes
- **Search:** 100 requests per minute per user
- **Report submission:** 50 reports per day per user

Rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1689687600
```

When rate limited (429 response), also includes:

```
Retry-After: 60
```

## Error Handling

See [ERROR_CODES.md](./ERROR_CODES.md) for complete error reference.

Common error scenarios:

```javascript
// Handle validation error
try {
  const response = await fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  })
  const data = await response.json()
  
  if (!response.ok) {
    console.error(`Error ${data.errorCode}: ${data.message}`)
    // Display to user, ask to fix input
  }
} catch (error) {
  console.error('Network error:', error)
}
```

## Request/Response Schemas

All request and response schemas are in [schemas.ts](./schemas.ts).

TypeScript types for all operations:

```typescript
import {
  LoginRequest,
  LoginResponse,
  ReportCreateRequest,
  ReportResponse,
  CompanyReport,
  TrustScoreResponse,
} from './schemas'

// Use types in controllers
async login(@Body() dto: LoginRequest): Promise<LoginResponse> {
  // ...
}
```

## Environment Variables

Required environment variables:

```env
# Server
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/marsad

# Email (SendGrid)
SENDGRID_API_KEY=your-api-key

# External Services
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=https://project.supabase.co
SUPABASE_KEY=your-anon-key
```

## Deployment

### Docker

```bash
# Build image
docker build -t marsad-api:latest .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="secret" \
  marsad-api:latest
```

### Development

```bash
# Install dependencies
npm install

# Watch mode with hot reload
npm run dev

# Production build
npm run build
npm run start
```

## Testing

### Unit Tests

```bash
npm run test
npm run test:watch
```

### Smoke Tests

```bash
npm run test:smoke
```

### With curl

```bash
# Health check
curl http://localhost:3000/health

# Register user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{...}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "pass"}'
```

## Security Considerations

### Best Practices

1. **Never expose secrets** in code or logs
2. **Use HTTPS** in production
3. **Validate all inputs** server-side
4. **Implement rate limiting** for protection
5. **Rotate JWT secrets** regularly
6. **Use strong passwords** with validation
7. **Implement audit logging** for compliance
8. **Use Row-Level Security** (RLS) in database

### CORS Configuration

```typescript
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

## Database Schema

Key tables:

- **users** - User accounts
- **companies** - Company profiles
- **reports** - Transaction reports
- **trust_scores** - Calculated trust scores
- **audit_logs** - Activity audit trail
- **sessions** - Active sessions

## Related Documentation

- [OpenAPI Specification](./openapi.yaml)
- [TypeScript Schemas](./schemas.ts)
- [Error Codes Reference](./ERROR_CODES.md)
- [Swagger Config](./swagger.config.ts)

## Support & Resources

- **Documentation:** https://docs.marsad.local
- **API Status:** https://status.marsad.local
- **Support Email:** support@marsad.local
- **Issues:** GitHub Issues (if applicable)

## Version History

- **1.0.0** (2024-07-18) - Initial release
  - Authentication (register, login, refresh)
  - Company search and reporting
  - Transaction reports
  - Trust score calculation
  - Admin management
  - Audit logging
