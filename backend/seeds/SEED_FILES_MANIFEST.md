# Seed Files Manifest

Complete inventory of all seed files created for the Marsad backend with descriptions and usage.

## 📁 File Structure

```
backend/seeds/
├── seed.ts                      ← MAIN SEED RUNNER (Start here!)
├── test-fixtures.ts             ← Test data fixtures
├── seed-utils.ts                ← Utility functions
├── seed-config.ts               ← Configuration & constants
├── advanced-scenarios.ts         ← Integration test scenarios
├── demo_data.sql                ← Legacy SQL seed data
├── README.md                    ← User guide
├── DATA_RELATIONSHIPS.md         ← ER diagrams & workflows
├── MIGRATION_GUIDE.md            ← Migration & deployment
└── SEED_FILES_MANIFEST.md        ← This file
```

## 📄 File Descriptions

### 1. seed.ts (MAIN FILE)

**Purpose:** Main seed orchestrator - generates all demo and test data  
**Size:** 1,200+ lines  
**Language:** TypeScript  
**Dependencies:** Prisma, bcryptjs, uuid

**What it does:**
- Creates 4 subscription plans
- Creates 3 platform admin users
- Creates 6 test tenants (subscriber companies)
- Creates 12+ tenant users
- Creates 10 target companies with trust scores
- Creates 12+ sample reports in various statuses
- Creates 15+ watchlist items
- Creates 20 audit logs
- Creates 5 business requests
- Creates 10 notifications
- Creates 15 invoices

**Usage:**
```bash
npm run prisma:seed
```

**Key Functions:**
- `seedPlans()` - Creates subscription tiers
- `seedAdminUsers()` - Creates platform admins
- `seedTenants()` - Creates subscriber companies
- `seedTenantUsers()` - Creates company employees
- `seedTargetCompanies()` - Creates companies being reviewed
- `seedReports()` - Creates sample deal reports
- `seedWatchlistItems()` - Creates monitoring lists
- `seedAuditLogs()` - Creates action logs
- `seedBusinessRequests()` - Creates B2B requests
- `seedNotifications()` - Creates alerts
- `seedInvoices()` - Creates subscription invoices
- `main()` - Orchestrates all functions

**Output:**
```
✓ Plans: 4
✓ Admin Users: 3
✓ Tenants: 6
✓ Tenant Users: 12+
✓ Target Companies: 10
✓ Reports: 12+
✓ Watchlist Items: 15+
✓ Audit Logs: 20
✓ Business Requests: 5
✓ Notifications: 10
✓ Invoices: 15
```

---

### 2. test-fixtures.ts

**Purpose:** Pre-built test data for unit and integration tests  
**Size:** 400+ lines  
**Language:** TypeScript  
**Type:** Data export module (no execution)

**What it contains:**
- Company test data (valid/invalid)
- User test data (all roles)
- Report test data (various scenarios)
- Subscription test data (all plans)
- Tenant test data
- Trust score test data
- Audit log test data
- Notification test data
- Invoice test data
- Query test data
- Error scenarios
- API response templates

**Usage:**
```typescript
import { testFixtures } from './test-fixtures'

// Get fixtures
const companyData = testFixtures.getCompanyData()
const userData = testFixtures.getUserData()
const reportData = testFixtures.getReportData()

// Use in tests
describe('Company Service', () => {
  it('creates valid company', async () => {
    const result = await service.create(companyData.valid[0])
    expect(result.id).toBeDefined()
  })

  it('rejects invalid data', async () => {
    expect(() => service.create(companyData.invalid[0])).toThrow()
  })
})
```

**Key Exports:**
- `getCompanyData()` - Company test cases
- `getUserData()` - User test cases
- `getReportData()` - Report test cases
- `getSubscriptionData()` - Subscription test cases
- `getTenantData()` - Tenant test cases
- `getTrustScoreData()` - Trust score test cases
- `getAuditLogData()` - Audit log test cases
- `getNotificationData()` - Notification test cases
- `getInvoiceData()` - Invoice test cases
- `getQueryData()` - Query test cases
- `getErrorScenarios()` - Error test cases
- `getResponseData()` - API response test cases

---

### 3. seed-utils.ts

**Purpose:** Utility functions for seeding and data generation  
**Size:** 500+ lines  
**Language:** TypeScript  
**Type:** Utility class with static methods

**What it provides:**

**Password & Security:**
- `hashPassword()` - Hash passwords with bcryptjs
- `validateEmail()` - Email format validation

**Data Generation:**
- `generateCRNumber()` - Saudi CR numbers
- `generateSaudiPhone()` - Phone numbers
- `getRandomCity()` - Saudi cities
- `getRandomSector()` - Business sectors
- `getRandomArabicName()` - Arabic names
- `generateEmail()` - Email addresses
- `generateIP()` - IP addresses
- `generateUUIDs()` - Multiple UUIDs
- `createId()` - Prefixed IDs

**Business Logic:**
- `calculateTrustScore()` - Score calculation algorithm
- `getRandomDateInRange()` - Date generation
- `getRandomDealAmount()` - Deal amount ranges
- `getRandomPaymentStatus()` - Payment statuses
- `getDelayDaysForStatus()` - Delay calculation

**Utilities:**
- `createBatch()` - Create repeated data
- `chunk()` - Split arrays for batch processing
- `randomSelect()` - Random selection
- `randomSelectMultiple()` - Multiple random selections
- `toDecimal()` - Decimal conversion
- `generateAuditEntry()` - Audit log creation
- `formatPhoneNumber()` - Phone formatting
- `getRecentDate()` - Recent dates
- `getCompanySize()` - Company size categories
- `getSubscriptionPeriod()` - Subscription dates

**Logging:**
- `logProgress()` - Progress bar
- `logSummary()` - Summary output

**Usage:**
```typescript
import { SeedUtils } from './seed-utils'

// Generate data
const cr = SeedUtils.generateCRNumber()
const phone = SeedUtils.generateSaudiPhone()
const city = SeedUtils.getRandomCity()
const name = SeedUtils.getRandomArabicName()

// Business logic
const score = SeedUtils.calculateTrustScore(10)
const delay = SeedUtils.getDelayDaysForStatus('late')

// Batching
const batch = SeedUtils.createBatch(template, 100)
const chunks = SeedUtils.chunk(data, 50)
```

---

### 4. seed-config.ts

**Purpose:** Configuration and constants for seeding  
**Size:** 400+ lines  
**Language:** TypeScript  
**Type:** Configuration export

**What it contains:**

**Environment Configuration:**
- `environment.development` - Dev settings
- `environment.test` - Test settings
- `environment.production` - Prod settings

**Quantities:**
- `quantities.plans` - Number of plans
- `quantities.tenants` - Number of tenants
- `quantities.reportsPerTenant` - Reports per tenant
- And more...

**Plans Configuration:**
- Free plan specs
- Basic plan specs
- Pro plan specs
- Enterprise plan specs

**Credentials:**
- Admin credentials
- Reviewer credentials
- Support credentials
- Test user password

**Reference Data:**
- Business sectors (10+)
- Saudi cities (10+)
- Report statuses
- Risk bands
- Payment commitments
- Deal amount ranges
- Notification types
- User roles
- Audit log actions

**Feature Flags:**
- `features.generateAuditLogs`
- `features.generateNotifications`
- `features.createInvoices`
- And more...

**Performance:**
- `performance.maxParallelInserts`
- `performance.connectionPoolSize`
- `performance.queryTimeout`

**Usage:**
```typescript
import { seedConfig } from './seed-config'

// Get configuration
const planCount = seedConfig.quantities.plans
const adminEmail = seedConfig.credentials.admin.email
const cities = seedConfig.cities
const sectors = seedConfig.sectors

// Use in code
const config = seedConfig.plans.pro
const limits = config.limits
const features = config.features
```

---

### 5. advanced-scenarios.ts

**Purpose:** Complex integration test scenarios  
**Size:** 600+ lines  
**Language:** TypeScript  
**Type:** Scenario functions for testing

**Included Scenarios:**

1. **scenarioCompleteReportWorkflow()** - Full report lifecycle
   - Draft → Pending → Approved workflow
   - Review actions
   - Status transitions

2. **scenarioMultiTenantTrustScore()** - Score calculation
   - Aggregate scores from multiple reports
   - Risk band assessment
   - Tier determination

3. **scenarioQuotaUsageTracking()** - Quota management
   - Monthly view tracking
   - Plan limit enforcement
   - Usage alerts

4. **scenarioSubscriptionRenewal()** - Subscription management
   - Period renewal
   - Invoice generation
   - Payment tracking

5. **scenarioBusinessRequestWorkflow()** - B2B collaboration
   - Request creation
   - Acceptance workflow
   - Audit logging

6. **scenarioWatchlistMonitoring()** - Watchlist operations
   - Item creation
   - Monitoring setup
   - Alert generation

7. **scenarioAuditTrailVerification()** - Compliance logging
   - Action logging
   - Audit trail verification
   - Compliance checks

8. **scenarioCompanyProfileClaim()** - Company claiming
   - Profile creation
   - Ownership claiming
   - Audit recording

**Usage:**
```typescript
import * as scenarios from './advanced-scenarios'

// Run individual scenario
await scenarios.scenarioCompleteReportWorkflow()
await scenarios.scenarioMultiTenantTrustScore()

// Run all scenarios
await scenarios.runAllScenarios()
```

**Purpose:**
- Integration testing
- Workflow validation
- Complex scenario testing
- Production readiness verification

---

### 6. demo_data.sql

**Purpose:** Legacy SQL seed data  
**Size:** 350+ lines  
**Language:** SQL (PostgreSQL)  
**Status:** Legacy (kept for reference)

**Contains:**
- Raw SQL INSERT statements
- Plans definition
- Tenant data
- User data
- Company data
- Company profiles
- Subscription data

**Note:** The TypeScript version (seed.ts) is recommended. This SQL file is kept for reference and can be used if direct SQL execution is needed.

---

### 7. README.md

**Purpose:** Comprehensive user guide for seeding  
**Size:** 400+ lines  
**Type:** Documentation

**Sections:**
- Quick Start
- What Gets Seeded
- Configuration
- Using Seed Utilities
- Running Test Scenarios
- Integration with Tests
- Security Considerations
- Re-seeding Database
- Adding Custom Seeds
- Troubleshooting
- Documentation Links

---

### 8. DATA_RELATIONSHIPS.md

**Purpose:** Visual documentation of data model  
**Size:** 600+ lines  
**Type:** Technical documentation

**Includes:**
- Entity Relationship Diagrams
- Data Flow Examples
- Complete Workflows
- Relationship Cardinality
- SQL Query Examples
- Data isolation examples

**Diagrams Show:**
- Subscription hierarchy
- User management
- Report workflow
- Company assessment
- Monitoring & alerts
- B2B collaboration
- Audit & compliance
- Quota tracking

---

### 9. MIGRATION_GUIDE.md

**Purpose:** Guide for seeding in different environments  
**Size:** 500+ lines  
**Type:** Operational documentation

**Sections:**
- Quick Reference
- Standard Workflow
- Environment-Specific Setup
- Data Isolation by Environment
- Seed Data Scope
- Handling Schema Changes
- Verification Checklist
- Troubleshooting
- Seed Data Lifecycle
- Pre-Deployment Checklist
- Best Practices

**Covers:**
- Development setup
- Staging deployment
- Test environment
- Production (do not seed)
- Schema migration handling
- Data consistency
- Deployment verification

---

### 10. SEED_FILES_MANIFEST.md

**Purpose:** This file - complete inventory  
**Size:** Current document  
**Type:** Reference documentation

---

## 🔗 Dependencies

### npm Packages Required
```json
{
  "@prisma/client": "^5.6.0",
  "bcryptjs": "^2.4.3",
  "uuid": "^9.0.0"
}
```

### Development Dependencies
```json
{
  "prisma": "^5.6.0",
  "ts-node": "^10.9.1",
  "typescript": "^5.2.2"
}
```

## 🚀 Getting Started

### 1. First Time Setup
```bash
cd backend
npm install
npx prisma migrate reset
npm run prisma:seed
```

### 2. Using in Development
```bash
# Edit seed.ts as needed
npm run prisma:seed
```

### 3. Using in Tests
```typescript
import { testFixtures } from '../seeds/test-fixtures'
// Use fixtures in tests
```

### 4. Using Utilities
```typescript
import { SeedUtils } from '../seeds/seed-utils'
const crNumber = SeedUtils.generateCRNumber()
```

## 📊 Data Statistics

After running seed script:

| Entity | Count | Status |
|--------|-------|--------|
| Plans | 4 | Active |
| Admin Users | 3 | Active |
| Tenants | 6 | Active |
| Tenant Users | 12+ | Mixed |
| Target Companies | 10 | 1 Unapproved |
| Reports | 12+ | Mixed Status |
| Trust Scores | 10 | Calculated |
| Watchlist Items | 15+ | Active |
| Audit Logs | 20+ | Complete |
| Business Requests | 5 | Mixed Status |
| Notifications | 10 | Mixed Read |
| Subscriptions | 6 | Active |
| Invoices | 15+ | Mixed Status |

## 🔍 Quick Verification

```bash
# Check everything seeded correctly
psql $DATABASE_URL -c "
SELECT 'Plans' as entity, COUNT(*) as count FROM plans
UNION SELECT 'Tenants', COUNT(*) FROM tenants
UNION SELECT 'Users', COUNT(*) FROM users
UNION SELECT 'Companies', COUNT(*) FROM companies
UNION SELECT 'Reports', COUNT(*) FROM reports
ORDER BY entity;
"
```

## 📝 File Maintenance

| File | Maintainer | Update Frequency |
|------|-----------|-----------------|
| seed.ts | Core Team | Per feature |
| test-fixtures.ts | QA Team | Per test changes |
| seed-utils.ts | Core Team | As needed |
| seed-config.ts | Product Team | Per plan/config changes |
| advanced-scenarios.ts | QA/Testing | Per workflow changes |
| demo_data.sql | Legacy (Reference) | Rarely |
| README.md | Documentation | Per major changes |
| DATA_RELATIONSHIPS.md | Architecture | Per schema changes |
| MIGRATION_GUIDE.md | DevOps | Per deployment strategy |

## ✅ Checklist

Before committing seed changes:

- [ ] All files follow TypeScript conventions
- [ ] No hardcoded credentials (use config)
- [ ] Proper error handling
- [ ] Idempotent operations (upsert)
- [ ] Performance considerations
- [ ] Documentation updated
- [ ] Tests passing
- [ ] No production data included
- [ ] Proper logging added
- [ ] README updated if changes

## 🤝 Contributing

To add new seed data:

1. Update `seed-config.ts` with new configuration
2. Add fixtures to `test-fixtures.ts`
3. Add utilities to `seed-utils.ts` if needed
4. Implement seed function in `seed.ts`
5. Add scenario to `advanced-scenarios.ts` if complex
6. Update `README.md` with new options
7. Update `DATA_RELATIONSHIPS.md` if schema affected
8. Test thoroughly
9. Commit with clear message

## 📞 Support

For issues with seeding:

1. Check MIGRATION_GUIDE.md
2. Review DATA_RELATIONSHIPS.md
3. Check test-fixtures.ts for examples
4. Review seed.ts comments
5. Check Prisma documentation
6. Contact development team

---

## File Summary

```
Total Lines of Code: 3,200+
Total Files: 10
Main Language: TypeScript
Documentation: 2,000+ lines
Test Fixtures: 400+ lines
Utility Functions: 500+ lines
```

**Last Updated:** 2024-07-18  
**Status:** Production-Ready  
**Version:** 1.0
