# Testing Setup Guide

## Overview

This document outlines the comprehensive testing infrastructure for the Marsad platform, including backend unit/integration tests and frontend component/page tests.

---

## Backend Testing (Jest + Supertest)

### Installation

All dependencies have been added to `package.json`. Install with:

```bash
cd backend
npm install
```

### Configuration

- **Jest Config**: `jest.config.js`
- **Test Setup**: `tests/setup.ts`
- **Test Environment**: `NODE_ENV=test`, uses `.env.test`

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Generate coverage report
npm test:cov
```

### Test Structure

```
backend/tests/
├── fixtures/
│   └── test-data.ts              # Test data generators & mocks
├── modules/
│   ├── auth/
│   │   └── auth.service.spec.ts  # Auth service unit tests
│   ├── admin/
│   │   └── admin.service.spec.ts # Admin operations tests
│   ├── companies/
│   │   └── companies.service.spec.ts
│   └── reports/
│       └── reports.service.spec.ts
├── integration/
│   ├── auth.integration.spec.ts  # Auth flow E2E tests
│   ├── companies.integration.spec.ts
│   └── reports.integration.spec.ts
└── setup.ts                      # Global test configuration
```

### Test Coverage

#### Auth Tests (`auth.service.spec.ts`)
- ✓ User registration with validation
- ✓ Duplicate CR number/email detection
- ✓ Login with credentials validation
- ✓ Token refresh flow
- ✓ Password hashing verification
- ✓ Audit logging on auth events

#### Admin Tests (`admin.service.spec.ts`)
- ✓ CRUD operations for reports, companies, users
- ✓ Approval/rejection workflows
- ✓ Batch operations
- ✓ Pagination and filtering
- ✓ Audit log retrieval
- ✓ Bulk import functionality

#### Companies Tests (`companies.service.spec.ts`)
- ✓ Company search (name, CR number, sector)
- ✓ Trust score calculations
- ✓ Report gating by subscription plan
- ✓ Quota enforcement
- ✓ Company claim/profile functionality
- ✓ Status indicators (locked, preliminary, full)

#### Reports Tests (`reports.service.spec.ts`)
- ✓ Report submission with validation
- ✓ User-owned report filtering
- ✓ Company report aggregation
- ✓ Report editing (pending only)
- ✓ Report deletion restrictions
- ✓ Statistics calculation

#### Integration Tests
- ✓ Full auth flow (register → login → refresh)
- ✓ Company search with pagination
- ✓ Report lifecycle (submit → edit → delete)
- ✓ Admin approval workflows
- ✓ Protected endpoint access control
- ✓ Error handling and validation

### Key Testing Utilities

#### TestDataGenerator
Pre-built factories for creating test data:

```typescript
// User
const user = await TestDataGenerator.createUser({ email: 'test@test.com' });

// Company
const company = TestDataGenerator.createCompany({ approved: true });

// Report
const report = TestDataGenerator.createReport({ status: 'pending' });

// Subscription
const subscription = TestDataGenerator.createSubscription();
```

#### Mock Prisma Service
All Prisma methods are pre-mocked:

```typescript
prismaService.user.findUnique.mockResolvedValueOnce(user);
prismaService.report.create.mockResolvedValueOnce(report);
```

### Test Environment Variables

Configuration in `.env.test`:
- `DATABASE_URL` - Test database connection
- `JWT_SECRET` - Test JWT key
- `NODE_ENV=test` - Test environment flag

### Database Testing

For integration tests requiring database operations:

1. Ensure PostgreSQL test database exists
2. Run migrations: `prisma migrate deploy --skip-generate`
3. Tests use transactions (auto-rollback after each test)

---

## Frontend Testing (Vitest + React Testing Library)

### Installation

Install dependencies:

```bash
npm install
```

### Configuration

- **Vitest Config**: `vitest.config.js`
- **Test Setup**: `src/__tests__/setup.js`
- **Test Environment**: `jsdom`

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (default)
npm test -- --watch

# Launch UI dashboard
npm test:ui

# Generate coverage report
npm test:cov
```

### Test Structure

```
src/__tests__/
├── utils/
│   └── test-utils.jsx           # Custom render, mocks, helpers
├── pages/
│   ├── AdminCompanies.spec.jsx  # Admin companies page
│   ├── AdminReports.spec.jsx    # Admin reports management
│   ├── Companies.spec.jsx       # Company search & discovery
│   └── AddReport.spec.jsx       # Report form submission
├── auth/
│   ├── auth-flow.spec.jsx       # Login/register flows
│   └── protected-routes.spec.jsx # Access control tests
└── setup.js                     # Global test config
```

### Test Coverage

#### Admin Pages
- **AdminCompanies.spec.jsx**
  - ✓ Rendering and data loading
  - ✓ Company list display
  - ✓ Pagination controls
  - ✓ Approval/rejection actions
  - ✓ Status filtering
  - ✓ Error handling

- **AdminReports.spec.jsx**
  - ✓ Report list with pending status
  - ✓ Approval workflow
  - ✓ Rejection with reason
  - ✓ Batch operations
  - ✓ Status filtering
  - ✓ Error states

#### Company Pages
- **Companies.spec.jsx**
  - ✓ Search functionality (name, CR number)
  - ✓ Pagination
  - ✓ Filter/sort options
  - ✓ Report view with gating
  - ✓ No results handling
  - ✓ API error handling

#### Forms
- **AddReport.spec.jsx**
  - ✓ Form rendering
  - ✓ Field validation
  - ✓ Amount validation (positive)
  - ✓ Date validation (not future)
  - ✓ Description length limits
  - ✓ Successful submission
  - ✓ Error handling
  - ✓ Form reset after submit
  - ✓ Loading state management

#### Authentication
- **auth-flow.spec.jsx**
  - ✓ Registration form validation
  - ✓ Email format validation
  - ✓ Password strength checking
  - ✓ Password confirmation matching
  - ✓ Successful registration
  - ✓ Login validation
  - ✓ Invalid credentials handling
  - ✓ Token storage
  - ✓ Logout functionality

- **protected-routes.spec.jsx**
  - ✓ Redirect unauthenticated users
  - ✓ Role-based access (admin vs. company)
  - ✓ Token refresh on expiry
  - ✓ Authorization header inclusion
  - ✓ Menu visibility by role
  - ✓ Session expiry handling
  - ✓ Redirect URL preservation

### Key Testing Utilities

#### Custom Render Function
```jsx
import { render } from './__tests__/utils/test-utils';

// Automatically wraps with BrowserRouter
render(<YourComponent />, { route: '/companies' });
```

#### Mock API Creation
```jsx
const mockApi = createMockApi();
// Returns:
// - getAdminCompanies
// - searchCompanies
// - submitReport
// - approveCompany
// - etc.
```

#### Mock User Profiles
```jsx
mockAuthUser     // Standard company user
mockAdminUser    // Platform admin user
mockApiCompany   // Sample company data
mockApiReport    // Sample report data
```

### Mocking Strategy

**API Mocking**: All `lib/api` functions are mocked globally
```javascript
vi.mock('../../lib/api');

api.searchCompanies = vi.fn().mockResolvedValue({...});
```

**Storage Mocking**: localStorage/sessionStorage pre-configured
**Router Mocking**: BrowserRouter wrapped automatically

### Testing Best Practices

1. **Always clear mocks between tests**
   ```javascript
   beforeEach(() => {
     vi.clearAllMocks();
   });
   ```

2. **Wait for async operations**
   ```javascript
   await waitFor(() => {
     expect(screen.getByText('expected text')).toBeInTheDocument();
   });
   ```

3. **Use semantic queries**
   ```javascript
   screen.getByLabelText('Email')  // ✓ Good
   screen.getByText('Submit')      // ✓ Good
   screen.getByTestId('btn')       // ✗ Avoid
   ```

4. **Test user interactions**
   ```javascript
   const user = userEvent.setup();
   await user.type(input, 'text');
   await user.click(button);
   ```

---

## Test Data Management

### Backend Test Data

Generated using `TestDataGenerator`:

```typescript
// Single record
const user = await TestDataGenerator.createUser();

// Batch records
const users = Array.from({ length: 10 }, () =>
  TestDataGenerator.createUser()
);

// With overrides
const admin = await TestDataGenerator.createUser({
  role: 'platform_admin',
  email: 'admin@test.com',
});
```

### Frontend Test Data

Mocked responses:

```javascript
const mockApi = {
  getAdminCompanies: vi.fn().mockResolvedValue({
    data: [mockApiCompany, mockApiCompany],
    pagination: { page: 1, limit: 20, total: 2, pages: 1 },
  }),
};
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm install
      - run: cd backend && npm test

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:cov
```

---

## Coverage Goals

- **Backend**: Minimum 80% coverage
- **Frontend**: Minimum 75% coverage (pages), 90% (utils)
- **Critical paths**: 100% (auth, admin operations)

---

## Troubleshooting

### Backend Tests Fail with Database Error
```bash
# Ensure test database exists
createdb marsad_test

# Run migrations
cd backend
prisma migrate deploy --skip-generate
```

### Frontend Tests Timeout
```javascript
// Increase timeout
await waitFor(() => {
  expect(element).toBeInTheDocument();
}, { timeout: 5000 });
```

### Mock Not Working
```javascript
// Ensure import is mocked BEFORE component
vi.mock('../../lib/api');
import * as api from '../../lib/api'; // Must be after mock
```

---

## Next Steps

1. **Run all tests**: `npm test` (backend), `npm test` (frontend)
2. **Review coverage**: Coverage reports in `coverage/`
3. **Add to CI/CD**: Integrate into GitHub Actions
4. **Monitor coverage**: Set up coverage thresholds
5. **Scale tests**: Add more test cases as features are developed

---

## Resources

- [Jest Docs](https://jestjs.io/)
- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Supertest Docs](https://github.com/visionmedia/supertest)
