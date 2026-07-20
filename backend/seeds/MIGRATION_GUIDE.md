# Seed Data Migration Guide

Guide for seeding data after database migrations and handling data updates in different deployment scenarios.

## 📋 Quick Reference

| Scenario | Command | Notes |
|----------|---------|-------|
| Fresh Development Setup | `npx prisma migrate reset` | Runs migrations + seed |
| Add to Existing DB | `npm run prisma:seed` | Adds data without reset |
| Staging Environment | `npm run prisma:seed` | Additive, preserves existing |
| Production | ❌ DO NOT RUN | Use production data only |
| Test Environment | `NODE_ENV=test npm run prisma:seed` | Clears DB first |
| Reset Completely | `npx prisma migrate reset --force` | Drop all + migrate + seed |

## 🔄 Standard Workflow

### 1. Fresh Development Environment

```bash
# Clone repo
git clone <repo>
cd backend

# Install dependencies
npm install

# Setup database and seed
npx prisma migrate reset

# Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
```

Expected output:
```
Datasource "db": PostgreSQL database "marsad_dev", schema "public"

✓ Successfully created schema "public"
✓ Ran 5 migrations (See migration files in prisma/migrations)

📦 Seeding database...
✓ Plans created
✓ Admin users created
✓ 6 tenants created
✓ Completed!

Count: 6
```

### 2. Existing Database (Additive)

```bash
# Run seed on existing database
npm run prisma:seed

# This ADDS data without removing existing records
# Respects unique constraints (email, crNumber, etc.)
```

### 3. After Schema Changes

```bash
# Create and apply migration
npx prisma migrate dev --name add_new_field

# Re-seed (updates existing records if needed)
npm run prisma:seed
```

## 🌍 Environment-Specific Setup

### Development

```bash
# .env.development
DATABASE_URL="postgresql://user:pass@localhost:5432/marsad_dev"
NODE_ENV="development"
DEMO_MODE="true"
```

```bash
# Setup
npm install
npx prisma migrate reset
npm run dev
```

**Data Characteristics:**
- 6 test tenants
- 10 target companies
- Multiple reports in various statuses
- Full audit logs
- Real-looking demo data

### Staging

```bash
# .env.staging
DATABASE_URL="postgresql://user:pass@staging-db:5432/marsad"
NODE_ENV="staging"
DEMO_MODE="true"
```

```bash
# Initial setup
npx prisma migrate deploy
npm run prisma:seed

# Later updates
npm run prisma:seed  # Additive only
```

**Data Characteristics:**
- Same seed data
- Preserves real user data
- Additive only (no deletions)
- Production-like database size

### Test Environment

```bash
# .env.test
DATABASE_URL="postgresql://user:pass@localhost:5432/marsad_test"
NODE_ENV="test"
```

```bash
# Jest configuration (jest.config.js)
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'node',
}

// tests/setup.ts
beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  await execSync('npm run prisma:seed', { stdio: 'inherit' })
})
```

**Data Characteristics:**
- Fresh data for each test run
- Isolated test data
- No cross-test contamination
- Rapid reset capability

### Production

```bash
# ❌ DO NOT RUN SEED IN PRODUCTION
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seeding is disabled in production')
}
```

**Data Characteristics:**
- Real customer data only
- No demo data
- Manual imports for bulk operations
- Separate backup strategy

## 🔐 Data Isolation by Environment

### Development (Local)

```
Database: marsad_dev
├── Demo data: ✓ Included
├── Real users: ✗ Not included
├── Full audit logs: ✓ Generated
└── Reset frequency: Daily/As needed
```

### Staging

```
Database: marsad_staging
├── Demo data: ✓ Included (for testing)
├── Real users: ✓ Some production data
├── Full audit logs: ✓ Generated
└── Reset frequency: Weekly/On schema changes
```

### Production

```
Database: marsad_production
├── Demo data: ✗ Never
├── Real users: ✓ All customers
├── Full audit logs: ✓ Complete history
└── Reset frequency: Never
```

## 📊 Seed Data Scope

### What Gets Seeded

```typescript
// seed.ts - Main orchestrator
✓ Plans (4)
✓ Admin users (3)
✓ Test tenants (6)
✓ Tenant users (12+)
✓ Target companies (10)
✓ Sample reports (12+)
✓ Audit logs (20)
✓ Watchlist items (15)
✓ Business requests (5)
✓ Notifications (10)
✓ Invoices (15)
```

### What Does NOT Get Seeded

```
✗ Real customer data
✗ Real payment information
✗ Production credentials
✗ Real personal information
✗ Sensitive business data
✗ Historical production data
```

## 🔄 Update Existing Seeds

### Modify Seed Data

Edit `seed.ts` to update:

```typescript
// Example: Add more demo companies
async function seedTargetCompanies() {
  const companiesData = [
    // ... existing companies ...
    {
      id: 'company-new-01',
      name: 'شركة جديدة للاختبار',
      // ... more fields ...
    },
  ]
}
```

Re-run seed:
```bash
npm run prisma:seed
```

### Create Seed Variant

For different scenarios:

```typescript
// seeds/seed-variant.ts
export async function seedLargeDataset() {
  // Generate 100+ records for load testing
  const tenants = await prisma.tenant.createMany({
    data: generateLargeBatch(100)
  })
}

// Run specific variant
NODE_ENV=test npm run prisma:seed --variant=large
```

## 🛠️ Handling Schema Changes

### When Adding New Fields

```bash
# 1. Create migration
npx prisma migrate dev --name add_new_field

# 2. Update seed data if needed
# - Edit seed.ts to include new field
# - Add to test-fixtures.ts

# 3. Re-seed
npm run prisma:seed
```

### When Removing Fields

```bash
# 1. Create migration
npx prisma migrate dev --name remove_old_field

# 2. Remove from seed.ts
# - Remove field from data creation

# 3. Re-seed
npm run prisma:seed
```

### When Renaming Fields

```bash
# 1. Create migration
npx prisma migrate dev --name rename_field

# 2. Update seed.ts
# - Change field name in seed functions
# - Update test-fixtures.ts

# 3. Re-seed
npm run prisma:seed
```

## 🔍 Verification Checklist

After seeding, verify:

```bash
# Check record counts
psql $DATABASE_URL -c "
SELECT 'plans' as type, COUNT(*) FROM plans
UNION SELECT 'users', COUNT(*) FROM users
UNION SELECT 'tenants', COUNT(*) FROM tenants
UNION SELECT 'companies', COUNT(*) FROM companies
UNION SELECT 'reports', COUNT(*) FROM reports
ORDER BY type;
"

# Check admin users created
psql $DATABASE_URL -c "
SELECT email, role, created_at FROM users 
WHERE tenant_id IS NULL 
ORDER BY created_at;
"

# Check subscriptions linked
psql $DATABASE_URL -c "
SELECT t.name, p.name as plan, s.status, s.current_period_end
FROM subscriptions s
JOIN tenants t ON s.tenant_id = t.id
JOIN plans p ON s.plan_id = p.id
ORDER BY t.created_at;
"

# Check trust scores calculated
psql $DATABASE_URL -c "
SELECT c.name, ts.score, ts.risk_band, ts.approved_reports
FROM trust_scores ts
JOIN companies c ON ts.company_id = c.id
ORDER BY ts.score DESC;
"
```

Expected output:
```
 type     | count
──────────┼───────
 companies│   10
 plans    │    4
 reports  │   12
 tenants  │    6
 users    │   20
(5 rows)

 email              | role             | created_at
────────────────────┼──────────────────┼──────────────────
 admin@marsad.sa    | platform_admin   | 2024-07-18...
 reviewer@marsad.sa | reviewer         | 2024-07-18...
 support@marsad.sa  | platform_admin   | 2024-07-18...
(3 rows)
```

## 🚨 Troubleshooting

### Seed Already Exists

**Error:** `Unique constraint failed on the fields: ('email')`

**Solution:** Use `upsert` instead of `create`:

```typescript
// ✗ Wrong - fails on duplicates
await prisma.user.create({ data })

// ✓ Correct - updates if exists
await prisma.user.upsert({
  where: { email: data.email },
  update: data,
  create: data
})
```

### Foreign Key Constraint

**Error:** `Foreign key constraint failed on the field: (check the PostgreSQL errors above for context)`

**Solution:** Ensure parent records exist first:

```typescript
// ✓ Correct order
const plans = await seedPlans()
const tenants = await seedTenants(plans) // Plans must exist first
const reports = await seedReports(tenants) // Tenants must exist first
```

### Database Connection Timeout

**Error:** `Client was closed by the server (kill)`

**Solution:** Reduce batch size or delay:

```typescript
// seeds/seed-config.ts
export const seedConfig = {
  batchProcessing: {
    chunkSize: 50,      // Reduce from 100
    delayMs: 200,       // Add delay between batches
  }
}
```

### Out of Memory

**Error:** `FATAL: out of memory`

**Solution:** Seed in smaller batches:

```typescript
const chunk = 50
for (let i = 0; i < tenants.length; i += chunk) {
  const batch = tenants.slice(i, i + chunk)
  await seedReportsForTenants(batch)
  await new Promise(resolve => setTimeout(resolve, 100))
}
```

## 🔄 Seed Data Lifecycle

```
Development Workflow:
  1. Developer clones repo
  2. Runs `npx prisma migrate reset`
  3. Gets fresh seed data
  4. Works on feature
  5. Runs tests (uses seeded data)
  6. Commits code
  
  └─ Seed data is regenerated on next `migrate reset`

Staging Deployment:
  1. Code merged to main
  2. CI/CD runs migrations
  3. CI/CD runs `npm run prisma:seed`
  4. Seed data added (additive, no deletions)
  5. QA tests with combination of real + demo data
  
  └─ Seed data persists until next reset

Production Deployment:
  1. Code deployed to production
  2. Migrations run (only schema changes)
  3. ❌ NO SEEDING - real data only
  4. Monitoring and backup proceed
  
  └─ Production data never reset
```

## 📚 Related Documentation

- [Prisma Migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)
- [Seed Configuration](./seed-config.ts)
- [Test Fixtures](./test-fixtures.ts)
- [Data Relationships](./DATA_RELATIONSHIPS.md)
- [Main Seed Script](./seed.ts)

## ✅ Pre-Deployment Checklist

Before deploying to any environment:

- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Verify database schema: `npx prisma db pull`
- [ ] Run appropriate seed: `npm run prisma:seed`
- [ ] Verify seed counts match expected
- [ ] Check audit logs are generated
- [ ] Confirm no production data was affected
- [ ] Test with sample queries
- [ ] Verify API endpoints work with seed data
- [ ] Check application logs for errors
- [ ] Document any seed data changes

## 🎯 Best Practices

1. **Always use upsert** - Prevents duplicate constraint errors
2. **Seed in order** - Parents before children
3. **Use transactions** - Atomic operations
4. **Add delays** - Prevent timeout issues
5. **Log progress** - Know what completed
6. **Verify data** - Check counts and relationships
7. **Don't hardcode IDs** - Use UUID generation
8. **Comment seed changes** - Document why seed data changed
9. **Keep backups** - Before major seed changes
10. **Test in staging** - Before production

---

**Version**: 1.0  
**Last Updated**: 2024-07-18  
**Maintainer**: Marsad Development Team
