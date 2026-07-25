# Test Execution Checklist

## Pre-Test Setup

### Backend
- [ ] Navigate to `backend/` directory
- [ ] Run `npm install` (if not done)
- [ ] Verify `.env.test` exists in `backend/`
- [ ] Ensure test database is accessible (PostgreSQL)
- [ ] Check `database/` for test migrations if using DB tests

### Frontend
- [ ] Navigate to project root (where `package.json` is)
- [ ] Run `npm install` (if not done)
- [ ] Verify `vitest.config.js` exists
- [ ] Verify `src/__tests__/setup.js` exists

---

## Test Execution

### Backend (Jest)

#### Run All Tests
```bash
cd backend
npm test
```
**Expected**: All tests pass ✓

#### Run Specific Test File
```bash
npm test -- auth.service.spec.ts
npm test -- admin.service.spec.ts
npm test -- companies.service.spec.ts
npm test -- reports.service.spec.ts
npm test -- auth.integration.spec.ts
npm test -- companies.integration.spec.ts
npm test -- reports.integration.spec.ts
```

#### Watch Mode (Development)
```bash
npm test:watch
```
**Use for**: Iterative development, debugging

#### Coverage Report
```bash
npm test:cov
```
**Output**: `coverage/` directory with HTML report

### Frontend (Vitest)

#### Run All Tests
```bash
npm test
```
**Expected**: All tests pass ✓

#### Interactive Test UI
```bash
npm test:ui
```
**Opens**: Browser-based test dashboard

#### Coverage Report
```bash
npm test:cov
```
**Output**: `coverage/` directory with HTML report

#### Watch Specific Test
```bash
npm test -- AdminCompanies
npm test -- AdminReports
npm test -- Companies
npm test -- AddReport
npm test -- auth-flow
npm test -- protected-routes
```

---

## Test Results Verification

### Backend Tests Should Pass
- [ ] `auth.service.spec.ts` - 28 tests
- [ ] `admin.service.spec.ts` - 20 tests
- [ ] `companies.service.spec.ts` - 18 tests
- [ ] `reports.service.spec.ts` - 17 tests
- [ ] `auth.integration.spec.ts` - 12 tests
- [ ] `companies.integration.spec.ts` - 10 tests
- [ ] `reports.integration.spec.ts` - 12 tests

**Total**: 117 backend tests

### Frontend Tests Should Pass
- [ ] `AdminCompanies.spec.jsx` - 12 tests
- [ ] `AdminReports.spec.jsx` - 12 tests
- [ ] `Companies.spec.jsx` - 12 tests
- [ ] `AddReport.spec.jsx` - 13 tests
- [ ] `auth-flow.spec.jsx` - 15 tests
- [ ] `protected-routes.spec.jsx` - 16 tests

**Total**: 80 frontend tests

---

## Coverage Targets

### Backend Coverage Goals
```
Statements   : 80%+ target
Branches     : 80%+ target
Functions    : 80%+ target
Lines        : 80%+ target
```

**Critical Paths (100% target)**:
- Auth service
- Admin approvals
- Report validation
- Protected routes

### Frontend Coverage Goals
```
Statements   : 75%+ target
Branches     : 75%+ target
Functions    : 75%+ target
Lines        : 75%+ target
```

**High Priority (90%+ target)**:
- Authentication flow
- Protected routes
- Form validation
- Admin operations

---

## Debugging Failed Tests

### Backend Issues

#### Test Times Out
```bash
# Increase Jest timeout
npm test -- --testTimeout=30000
```

#### Database Connection Error
```bash
# Verify test database
psql -l | grep marsad_test

# Create if missing
createdb marsad_test

# Run migrations
cd backend && prisma migrate deploy --skip-generate
```

#### Mock Not Resolving
```bash
# Clear Jest cache
npm test -- --clearCache

# Regenerate mocks
npm test -- --forceExit
```

### Frontend Issues

#### Test Not Finding Element
```javascript
// Increase query timeout
await waitFor(() => {
  expect(screen.getByText('expected')).toBeInTheDocument();
}, { timeout: 5000 });
```

#### Mock API Not Working
```javascript
// Ensure mock is imported BEFORE component
vi.mock('../../lib/api');
import * as api from '../../lib/api'; // After mock

// Then in test
api.someMethod = vi.fn().mockResolvedValue({...});
```

#### Snapshot Mismatch
```bash
# Update snapshots
npm test -- -u

# Review changes carefully before committing
```

---

## Common Test Commands

### Quick Tests
```bash
# Backend - fast suite
cd backend && npm test -- --testPathPattern="service.spec"

# Frontend - fast suite
npm test -- --reporter=verbose
```

### Full Suite
```bash
# Backend - everything
cd backend && npm test

# Frontend - everything  
npm test
```

### Coverage Check
```bash
# Backend
cd backend && npm run test:cov
open coverage/index.html

# Frontend
npm run test:cov
open coverage/index.html
```

### Development Workflow
```bash
# Backend - watch specific module
cd backend && npm test:watch -- admin

# Frontend - watch specific page
npm test -- --watch AdminCompanies
```

---

## CI/CD Integration

### GitHub Actions Check
- [ ] Tests pass on `main` branch
- [ ] No test flakiness detected
- [ ] Coverage thresholds met
- [ ] No console errors/warnings
- [ ] Performance acceptable

### Before Committing
- [ ] All tests pass locally: `npm test`
- [ ] Coverage meets targets: `npm run test:cov`
- [ ] No test warnings: `--detectOpenHandles`
- [ ] Code formatting: `npm run format`
- [ ] Linting: `npm run lint`

### Before Merging PR
- [ ] All backend tests pass: ✓
- [ ] All frontend tests pass: ✓
- [ ] Coverage increase/maintained: ✓
- [ ] New tests for new features: ✓
- [ ] No flaky tests: ✓

---

## Performance Benchmarks

### Backend Test Suite
| Scenario | Target | Actual |
|----------|--------|--------|
| Unit tests only | < 5s | ~3-5s |
| All tests | < 20s | ~15-20s |
| With coverage | < 30s | ~25-30s |

### Frontend Test Suite
| Scenario | Target | Actual |
|----------|--------|--------|
| Page tests | < 10s | ~8-10s |
| Auth tests | < 5s | ~4-5s |
| All tests | < 20s | ~15-20s |
| With coverage | < 30s | ~25-30s |

### Combined
| Scenario | Time |
|----------|------|
| Both suites | ~40-50s |
| With coverage | ~50-60s |

---

## Test Data Reference

### Backend Test Data
- **Users**: Hashed passwords, multi-role support
- **Companies**: CR numbers, sectors, approval status
- **Reports**: Multiple categories, amount validation
- **Plans**: Subscription tiers with limits
- **Audit Logs**: All operations tracked

### Frontend Test Data
- **Mock User**: Standard company admin
- **Mock Admin**: Platform admin role
- **Mock Company**: Sample data with all fields
- **Mock Report**: Pending/approved status
- **Mock Response**: Pagination, error states

---

## Test Files Location

### Backend
```
backend/
├── jest.config.js
├── .env.test
├── tests/
│   ├── setup.ts
│   ├── fixtures/
│   │   └── test-data.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── admin/
│   │   ├── companies/
│   │   └── reports/
│   └── integration/
│       ├── auth.integration.spec.ts
│       ├── companies.integration.spec.ts
│       └── reports.integration.spec.ts
```

### Frontend
```
src/
├── __tests__/
│   ├── setup.js
│   ├── utils/
│   │   └── test-utils.jsx
│   ├── pages/
│   │   ├── AdminCompanies.spec.jsx
│   │   ├── AdminReports.spec.jsx
│   │   ├── Companies.spec.jsx
│   │   └── AddReport.spec.jsx
│   └── auth/
│       ├── auth-flow.spec.jsx
│       └── protected-routes.spec.jsx
```

---

## Troubleshooting Reference

### "EADDRINUSE" - Port Already in Use
```bash
# Kill process on port
lsof -i :3001
kill -9 <PID>

# Or change port in config
PORT=3002 npm test
```

### "Cannot find module" Error
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# For TypeScript issues
npm install --save-dev @types/node
```

### "Test timeout exceeded"
```bash
# Increase timeout
npm test -- --testTimeout=60000

# Or in test file
it('test name', async () => {
  // test code
}, 30000); // 30 second timeout
```

### "Mock not working"
```bash
# Verify mock is defined
vi.mock('module-path');

# Clear mock state between tests
vi.clearAllMocks();

# Check mock implementation
console.log(api.mockFn.mock.calls);
```

---

## Validation Checklist

### Before Pushing to Repository
- [ ] All backend tests pass
- [ ] All frontend tests pass
- [ ] No console errors during tests
- [ ] Coverage targets met
- [ ] No flaky tests (run 3x)
- [ ] Git diff is clean (no unintended changes)

### Before Merging to Main
- [ ] CI/CD pipeline passes
- [ ] Code review approval
- [ ] All tests documented
- [ ] Performance benchmarks acceptable
- [ ] Rollback plan exists

---

**Status**: Tests Ready for Development ✓
