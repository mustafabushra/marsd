# Marsad Backend Seed Data

Comprehensive seed data system for the Marsad backend. Generates production-ready demo data and test fixtures for development, testing, and staging environments.

## 📁 Files Structure

```
seeds/
├── seed.ts                 # Main seed orchestrator (all data)
├── seed.ts                 # Main seed runner
├── test-fixtures.ts        # Pre-built test data for unit/integration tests
├── seed-utils.ts           # Utility functions for seeding
├── seed-config.ts          # Configuration and constants
├── advanced-scenarios.ts    # Complex integration test scenarios
├── demo_data.sql           # SQL seed data (legacy)
└── README.md               # This file
```

## 🚀 Quick Start

### Run Complete Seed

Generate all demo and test data:

```bash
npm run prisma:seed
```

Expected output:
```
╔══════════════════════════════════════════════════════════════╗
║        Marsad Backend: Comprehensive Seed Script               ║
╚══════════════════════════════════════════════════════════════╝

📦 Seeding Plans...
✓ Created 4 plans

👨‍💼 Seeding Admin Users...
✓ Created 3 admin users

🏢 Seeding Tenants (Subscriber Companies)...
✓ Created 6 tenants with subscriptions
...

✓ All Seeds Completed Successfully
```

### Verify Seed Data

Check what was created:

```bash
# Count records
psql $DATABASE_URL -c "SELECT 'Plans' as type, COUNT(*) FROM plans UNION SELECT 'Tenants', COUNT(*) FROM tenants UNION SELECT 'Users', COUNT(*) FROM users UNION SELECT 'Reports', COUNT(*) FROM reports;"

# List admin users
psql $DATABASE_URL -c "SELECT email, role FROM users WHERE tenant_id IS NULL;"
```

## 📊 What Gets Seeded

### 1. Plans (4 plans)

| Plan | Price | Views | Users | Features |
|------|-------|-------|-------|----------|
| مجاني (Free) | $0 | 50 | 1 | Basic search, 1 watchlist |
| أساسي (Basic) | $99 | 500 | 3 | Advanced search, 3 watchlists |
| احترافي (Pro) | $299 | 5,000 | 10 | Unlimited watchlists, API access |
| مؤسسات (Enterprise) | $999 | Unlimited | 999 | Full feature set, SSO, Dedicated support |

### 2. Admin Users (3 users)

| Email | Role | Password |
|-------|------|----------|
| admin@marsad.sa | platform_admin | Admin@123456 |
| reviewer@marsad.sa | reviewer | Admin@123456 |
| support@marsad.sa | platform_admin | Admin@123456 |

### 3. Tenants (6 companies)

Example tenants:
- شركة الخليج للإنشاءات (Khalij Construction) - Pro plan
- الشركة العربية للتجارة (Arab Trade Company) - Basic plan
- شركة الرؤية للاستشارات (Vision Consulting) - Enterprise plan
- النخبة للخدمات اللوجستية (Elite Logistics) - Basic plan
- صناعات الحديد المتقدمة (Advanced Steel Industries) - Pro plan
- تقنية الرؤية المتقدمة (Advanced Vision Tech) - Basic plan

Each tenant has:
- Commercial registration number (CR)
- Contact email and phone
- Sector classification
- Active subscription
- 2+ company users (admin + members)

### 4. Target Companies (10 companies)

Companies being reviewed/assessed:
- شركة الفرسان العملاقة (Giant Knights Company)
- مجموعة الثروة التجارية (Wealth Trade Group)
- الصرح للاستشارات الهندسية (Sareh Engineering Consulting)
- And 7 more real-world business sectors

Each company has:
- CR number
- Sector and city
- Founding year
- Trust score (calculated)
- Risk band assessment

### 5. Reports (12+ reports)

Sample reports with various statuses:
- **Draft** - Not yet submitted (2 per tenant)
- **Pending Review** - Awaiting reviewer decision
- **Approved** - Reviewed and approved
- **Rejected** - Failed review
- **Request Info** - Awaiting clarification

Each report includes:
- Deal amount range (0-50k, 50k-100k, etc.)
- Payment commitment status
- Delay days (0-365)
- Default flag
- Deal date

### 6. Watchlist Items (15+ items)

Companies monitored by tenants:
- 3-5 companies per tenant
- Automatic alerts on updates
- Named lists ("قائمة المراقبة الرئيسية")

### 7. Audit Logs (20 logs)

Complete audit trail:
- Report creation/approval/rejection
- User login/logout
- Settings changes
- Subscription events
- Timestamps, IP addresses, user agents

### 8. Business Requests (5 requests)

B2B collaboration requests:
- Request creation
- Acceptance/decline workflow
- Expiration handling

### 9. Notifications (10 notifications)

Event notifications:
- Report approval notifications
- Score change alerts
- Watchlist notifications
- Subscription reminders

### 10. Invoices (15+ invoices)

Subscription billing:
- Monthly invoices
- Pending/paid statuses
- VAT calculations
- Due dates

## 🔧 Configuration

### Environment Variables

```bash
# .env file
DATABASE_URL="postgresql://user:pass@localhost:5432/marsad"
NODE_ENV="development"
DEMO_MODE="true"              # Enable demo data (default)
SEED_VERBOSE="false"          # Detailed logging
```

### Seed Settings

Edit `seed-config.ts` to customize:

```typescript
seedConfig.quantities = {
  tenants: 6,                   // Number of subscriber companies
  targetCompanies: 10,          // Companies to be reviewed
  reportsPerTenant: 4,          // Reports per tenant
  // ... more options
}

seedConfig.credentials = {
  admin: {
    email: 'admin@marsad.sa',
    password: 'Admin@123456',
  },
  // ... more users
}
```

## 📚 Using Seed Utilities

### Import and Use Test Fixtures

```typescript
import { testFixtures } from './seeds/test-fixtures'

// Get test data
const companyData = testFixtures.getCompanyData()
const userData = testFixtures.getUserData()
const reportData = testFixtures.getReportData()

// Use in tests
describe('Company Service', () => {
  it('creates valid company', async () => {
    const result = await companyService.create(companyData.valid[0])
    expect(result.id).toBeDefined()
  })

  it('rejects invalid data', async () => {
    expect(() => companyService.create(companyData.invalid[0])).toThrow()
  })
})
```

### Use Seed Utilities

```typescript
import { SeedUtils } from './seeds/seed-utils'

// Generate test data
const crNumber = SeedUtils.generateCRNumber()
const phone = SeedUtils.generateSaudiPhone()
const city = SeedUtils.getRandomCity()
const sector = SeedUtils.getRandomSector()
const name = SeedUtils.getRandomArabicName()

// Hash passwords
const hashedPwd = await SeedUtils.hashPassword('password123')

// Batch operations
const batch = SeedUtils.createBatch(template, 100, (item, index) => ({
  ...item,
  email: `user${index}@company.sa`
}))

// Utility functions
const trustScore = SeedUtils.calculateTrustScore(approvedReports)
const delayDays = SeedUtils.getDelayDaysForStatus(paymentStatus)
const recentDate = SeedUtils.getRecentDate(30) // Last 30 days
```

## 🧪 Running Advanced Test Scenarios

Test complex workflows and edge cases:

```typescript
import * as scenarios from './seeds/advanced-scenarios'

// Run individual scenario
await scenarios.scenarioCompleteReportWorkflow()
await scenarios.scenarioMultiTenantTrustScore()
await scenarios.scenarioSubscriptionRenewal()

// Run all scenarios
await scenarios.runAllScenarios()
```

### Available Scenarios

1. **Complete Report Workflow** - Draft → Pending → Approved
2. **Multi-Tenant Trust Score** - Aggregate scoring across tenants
3. **Quota Usage Tracking** - Monthly view limits
4. **Subscription Renewal** - Period and invoice generation
5. **Business Request Workflow** - Request creation and acceptance
6. **Watchlist Monitoring** - Company monitoring setup
7. **Audit Trail Verification** - Complete action logging
8. **Company Profile Claiming** - Tenant claiming company

## 🧬 Integration with Tests

### Jest Setup

```typescript
// tests/setup.ts
import { execSync } from 'child_process'

beforeAll(async () => {
  // Seed test database
  process.env.NODE_ENV = 'test'
  execSync('npm run prisma:seed', { stdio: 'inherit' })
})

afterAll(async () => {
  // Clean up
  await prisma.$disconnect()
})
```

### Using Fixtures in Tests

```typescript
import { testFixtures } from '../seeds/test-fixtures'

describe('Report Service', () => {
  let tenantId: string

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: testFixtures.getTenantData().valid[0]
    })
    tenantId = tenant.id
  })

  it('creates report with valid data', async () => {
    const data = testFixtures.getReportData().valid[0]
    const report = await reportService.create(tenantId, data)
    expect(report.status).toBe('draft')
  })

  it('rejects invalid data', async () => {
    const data = testFixtures.getReportData().invalid[0]
    expect(() => reportService.create(tenantId, data)).toThrow()
  })
})
```

## 🔒 Security Considerations

### Do NOT Use in Production

- Seeds contain dummy data only
- Default passwords are public
- Use only in dev/staging/test environments

### Environment Protection

```bash
# Only allow seeding in safe environments
if (process.env.NODE_ENV === 'production') {
  throw new Error('❌ Seeding disabled in production')
}
```

### Data Privacy

- All names and companies are fictional
- No real personal data used
- No real payment information stored

## 📊 Database State After Seeding

```sql
-- Check seeded data
SELECT COUNT(*) as total_plans FROM plans;           -- 4
SELECT COUNT(*) as total_users FROM users;           -- 20+
SELECT COUNT(*) as total_tenants FROM tenants;       -- 6
SELECT COUNT(*) as total_companies FROM companies;   -- 10
SELECT COUNT(*) as total_reports FROM reports;       -- 12+
SELECT COUNT(*) as total_subscriptions FROM subscriptions;  -- 6
SELECT COUNT(*) as total_invoices FROM invoices;     -- 15+
```

## 🔄 Re-seeding Database

### Clear and Re-seed

```bash
# Drop all tables and re-run migrations
npx prisma migrate reset

# Run seed again
npm run prisma:seed
```

### Partial Updates

Update only specific seed data:

```typescript
import { seedAdminUsers } from './seeds/seed'

// Re-seed only admin users (preserves other data)
await seedAdminUsers()
```

## 📝 Adding Custom Seeds

Create a new seed function:

```typescript
// seeds/custom-seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedCustomData() {
  console.log('Custom seeding...')
  
  // Your custom seed logic
  const result = await prisma.tenant.create({
    data: { /* ... */ }
  })
  
  console.log('✓ Custom seed complete')
  return result
}

// Add to main seed.ts
import { seedCustomData } from './custom-seed'

async function main() {
  // ... existing seeds ...
  await seedCustomData()
}
```

## 🐛 Troubleshooting

### "Relation already exists"

Duplicate CR numbers or emails. Use unique values:

```typescript
const crNumber = SeedUtils.generateCRNumber()
const email = `unique-${Date.now()}@company.sa`
```

### "Foreign key constraint failed"

Ensure parent records exist before creating child records:

```typescript
// ✓ Correct order
const plan = await seedPlans()
const tenant = await seedTenants(plan) // Plan must exist first
```

### "Connection timeout"

Increase connection pool or batch size:

```typescript
seedConfig.performance.maxParallelInserts = 3
seedConfig.batchProcessing.chunkSize = 50
```

## 📖 Documentation Links

- [Prisma Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding-your-database)
- [Testing with Fixtures](https://jestjs.io/docs/setup-teardown)
- [Database Testing Best Practices](https://martinfowler.com/articles/testing-strategies.html)

## 🤝 Contributing

To add new seed data:

1. Create fixture in `test-fixtures.ts`
2. Add utility function in `seed-utils.ts`
3. Add configuration in `seed-config.ts`
4. Implement seed function in `seed.ts`
5. Update this README

## 📄 License

Part of Marsad Platform - Confidential

---

**Questions or Issues?**
Check the Marsad documentation or contact the development team.
