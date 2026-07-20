# Quick Integration Guide - Error Handling System

Copy-paste these code snippets to quickly integrate the error handling system.

## Backend Integration (5 minutes)

### 1. Update `backend/src/app.module.ts`

Replace the entire file with:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import {
  HttpExceptionFilter,
  ValidationPipe,
  CommonModule,
  RequestLoggerMiddleware,
} from '@common'

// Import other modules
// import { AuthModule } from './modules/auth/auth.module'
// import { CompaniesModule } from './modules/companies/companies.module'

@Module({
  imports: [
    CommonModule,
    // AuthModule,
    // CompaniesModule,
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

### 2. Update `backend/src/main.ts`

Replace with:

```typescript
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors()

  const port = process.env.PORT || 3000
  await app.listen(port)

  console.log(`🚀 Marsad API running on http://localhost:${port}`)
}

bootstrap()
```

### 3. Example Controller with Error Handling

Create `backend/src/modules/companies/companies.controller.ts`:

```typescript
import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { NotFoundException, ValidationException } from '@common/exceptions'
import { LoggerService } from '@common/logger/logger.service'

@Controller('api/companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly logger: LoggerService,
  ) {}

  @Post()
  async create(@Body() createCompanyDto: CreateCompanyDto) {
    this.logger.info('Creating new company', {
      name: createCompanyDto.name,
    })

    try {
      const company = await this.companiesService.create(createCompanyDto)
      return {
        success: true,
        data: company,
      }
    } catch (error) {
      this.logger.error('Failed to create company', {
        error,
        createCompanyDto,
      })
      throw error
    }
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const company = await this.companiesService.findById(id)

    if (!company) {
      throw new NotFoundException('Company', id)
    }

    return {
      success: true,
      data: company,
    }
  }
}
```

### 4. Example Service with Exceptions

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { DatabaseException, ConflictException } from '@common/exceptions'
import { LoggerService } from '@common/logger/logger.service'

@Injectable()
export class CompaniesService {
  constructor(private readonly logger: LoggerService) {}

  async create(data: any) {
    try {
      // Check if already exists
      const existing = await this.db.company.findUnique({
        where: { email: data.email },
      })

      if (existing) {
        throw new ConflictException('Company', { email: data.email })
      }

      // Create company
      return await this.db.company.create({ data })
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error
      }

      throw new DatabaseException('Failed to create company', {
        originalError: error.message,
      })
    }
  }

  async findById(id: string) {
    try {
      return await this.db.company.findUnique({ where: { id } })
    } catch (error) {
      throw new DatabaseException('Failed to find company', {
        companyId: id,
        originalError: error.message,
      })
    }
  }
}
```

## Frontend Integration (5 minutes)

### 1. Update `src/App.jsx`

Replace entire file with:

```jsx
import { useEffect } from 'react'
import { ErrorBoundary } from '@utils/ErrorBoundary'
import { ToastContainer } from '@utils/ToastContainer'
import { initializeErrorLogger } from '@utils/error-logger'
import { initializeApiClient } from '@utils/api-client'
import Router from './Router' // Your router component

export default function App() {
  useEffect(() => {
    // Initialize error logging
    initializeErrorLogger({
      apiEndpoint: '/api/logs',
      enableLocalStorage: true,
      isDevelopment: process.env.NODE_ENV === 'development',
    })

    // Initialize API client
    initializeApiClient({
      baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
      timeout: 30000,
      showErrors: true,
      onUnauthorized: () => {
        // Clear auth and redirect to login
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
      },
    })
  }, [])

  return (
    <ErrorBoundary>
      <ToastContainer />
      <Router />
    </ErrorBoundary>
  )
}
```

### 2. Example Component with Error Handling

Create `src/components/CompanyList.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { getApiClient, showError, showSuccess, showLoading } from '@utils'

export default function CompanyList() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const api = getApiClient()

  useEffect(() => {
    loadCompanies()
  }, [])

  async function loadCompanies() {
    setLoading(true)
    const toast = showLoading('Loading companies...')

    try {
      const data = await api.get('/companies')
      setCompanies(data.data || data)
      toast.dismiss()
      showSuccess('Companies loaded')
    } catch (error) {
      toast.dismiss()
      // Error already shown by API client
    } finally {
      setLoading(false)
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm('Are you sure?')) return

    const toast = showLoading('Deleting...')

    try {
      await api.delete(`/companies/${id}`)
      toast.dismiss()
      showSuccess('Company deleted')
      loadCompanies() // Reload list
    } catch (error) {
      toast.dismiss()
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <h1>Companies</h1>
      <table>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id}>
              <td>{company.name}</td>
              <td>
                <button onClick={() => deleteCompany(company.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### 3. Create `.env.local`

```bash
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_ENV=development
```

### 4. Example Form Component

Create `src/components/CompanyForm.jsx`:

```jsx
import { useState } from 'react'
import { getApiClient, showError, showSuccess, showLoading } from '@utils'

export default function CompanyForm() {
  const [formData, setFormData] = useState({ name: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const api = getApiClient()

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const toast = showLoading('Saving company...')

    try {
      const result = await api.post('/companies', formData)
      toast.dismiss()
      showSuccess('Company created successfully!')
      setFormData({ name: '', email: '' })
      // Redirect or trigger reload
    } catch (error) {
      toast.dismiss()
      // Error already shown by API client
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Company Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
      />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Company'}
      </button>
    </form>
  )
}
```

## Backend API Test

Test your backend error handling:

```bash
# Test validation error
curl -X POST http://localhost:3000/api/companies \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'

# Expected response:
# {
#   "success": false,
#   "error": {
#     "code": "ERR_4002",
#     "message": "Validation failed",
#     "details": { ... },
#     "timestamp": "2026-07-18T...",
#     "requestId": "req-..."
#   }
# }

# Test not found
curl http://localhost:3000/api/companies/invalid-id

# Expected response:
# {
#   "success": false,
#   "error": {
#     "code": "ERR_4201",
#     "message": "Company with ID invalid-id not found",
#     "timestamp": "2026-07-18T...",
#     "requestId": "req-..."
#   }
# }
```

## Frontend Testing

Test your frontend error handling:

```javascript
// In browser console

// Test toast notifications
import { showError, showSuccess, showInfo, showWarning } from '@utils'

showSuccess('Success message!')
showError('Error message!')
showInfo('Info message!')
showWarning('Warning message!')

// Test API client
import { getApiClient } from '@utils'

const api = getApiClient()

// Make a successful request
api.get('/companies')

// Make a failing request (will retry automatically)
api.get('/invalid-endpoint')

// Check error logs
localStorage.getItem('marsad_error_logs')
```

## Verification Checklist

- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Invalid request returns proper error response
- [ ] Error toast appears on frontend
- [ ] Error is logged locally in localStorage
- [ ] Error is logged to backend if server available
- [ ] Retry logic works (test with network throttling)
- [ ] Error Boundary catches React errors
- [ ] Request IDs are generated and logged

## Common Issues & Fixes

### Backend won't start
```bash
# Check if imports are correct
cd backend
npm run build

# Check if all files exist
ls -la src/common/
```

### Frontend shows blank screen
```bash
# Check browser console for errors
# Verify App.jsx is properly wrapped with ErrorBoundary
# Check that ToastContainer is rendered
```

### API calls not working
```bash
# Check REACT_APP_API_URL in .env.local
# Verify backend is running on correct port
# Check browser network tab for actual requests
```

### Error logging not working
```javascript
// Check if error logger is initialized
import { getErrorLogger } from '@utils/error-logger'
const logger = getErrorLogger()
console.log(logger) // Should exist

// Check localStorage for logs
console.log(localStorage.getItem('marsad_error_logs'))
```

## Next Steps

1. Copy the integration code above
2. Update your app files
3. Test in development
4. Review the comprehensive guides:
   - `backend/src/common/ERROR_HANDLING_GUIDE.md`
   - `src/utils/ERROR_HANDLING_GUIDE.md`
5. Deploy with confidence!

## Need Help?

- Check `ERROR_HANDLING_SUMMARY.md` for overview
- Check `IMPLEMENTATION_CHECKLIST.md` for detailed steps
- Review the comprehensive guides for deep dives
- All source files have detailed comments
