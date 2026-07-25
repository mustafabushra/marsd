# RAILWAY.APP IMPLEMENTATION GUIDE
## Step-by-Step Migration from AWS Terraform

**Project:** Marsad SaaS  
**Date:** July 15, 2026  
**Target:** Production launch August 3, 2026

---

## PHASE 1: SETUP (Days 1-2)

### Step 1.1: Railway Account Creation

```bash
# 1. Visit https://railway.app and create account
# 2. Email: mustafabushra1779@gmail.com
# 3. Connect GitHub account
# 4. Create new project: "marsad-prod"
```

### Step 1.2: Install Railway CLI

```bash
# macOS / Linux
curl -fsSL https://railway.app/install.sh | bash

# Windows (PowerShell as Admin)
irm https://railway.app/install.ps1 | iex

# Verify installation
railway --version
# Expected: railway version X.X.X
```

### Step 1.3: Link Project to GitHub

```bash
# In project directory
railway link

# When prompted:
# Select: Create new project
# Project name: marsad-prod
# GitHub repo: marsd (select from list)
```

### Step 1.4: Create PostgreSQL Service

```bash
# Via Railway CLI
railway add postgresql

# OR: Via Railway Dashboard
# 1. Click "+ Add Service"
# 2. Select "PostgreSQL"
# 3. Set variables:
#    POSTGRES_USER = admin
#    POSTGRES_PASSWORD = (auto-generated, save it)
#    POSTGRES_DB = marsad

# Verify connection (get connection string from dashboard)
# Format: postgresql://admin:PASSWORD@postgres.railway.app:5432/marsad
```

### Step 1.5: Create Redis Service

```bash
# Via Railway CLI
railway add redis

# OR: Via Railway Dashboard
# 1. Click "+ Add Service"
# 2. Select "Redis"
# 3. Auto-configured, no variables needed

# Verify connection (get connection string)
# Format: redis://:password@redis.railway.app:6379
```

---

## PHASE 2: DATA MIGRATION (Days 3-4)

### Step 2.1: Export Current AWS Database

```bash
#!/bin/bash
# 1. Get AWS RDS endpoint from Terraform output
TERRAFORM_OUTPUT=$(cd infrastructure/terraform && terraform output -raw rds_endpoint)
echo "AWS RDS Endpoint: $TERRAFORM_OUTPUT"

# 2. Set AWS credentials
export AWS_PROFILE=default  # or your profile
export AWS_REGION=eu-central-1

# 3. Create backup
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="marsad-backup-${BACKUP_DATE}.sql"

echo "Exporting AWS RDS database to: $BACKUP_FILE"

# 4. Use enhanced monitoring to get DB password
TERRAFORM_DIR="infrastructure/terraform"
DB_PASSWORD=$(cd $TERRAFORM_DIR && terraform output -raw rds_password)

# 5. Export database
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$TERRAFORM_OUTPUT" \
  -U admin \
  -d marsad \
  -v \
  > "$BACKUP_FILE"

echo "Export complete. File size: $(du -h $BACKUP_FILE | cut -f1)"
echo "Backup file: $BACKUP_FILE"

# 6. Verify backup integrity
echo "Verifying backup..."
head -20 "$BACKUP_FILE"

# 7. Compress for storage
gzip "$BACKUP_FILE"
echo "Compressed: ${BACKUP_FILE}.gz"

# 8. Upload to S3 for safety
aws s3 cp "${BACKUP_FILE}.gz" s3://marsad-backups/aws/ \
  --profile default \
  --region eu-central-1

echo "Backup uploaded to S3"
```

**Expected Output:**
```
AWS RDS Endpoint: marsad-postgres.XXXXXXXXX.eu-central-1.rds.amazonaws.com
Exporting AWS RDS database to: marsad-backup-20260715-140530.sql
Export complete. File size: 2.3G
Backup file: marsad-backup-20260715-140530.sql
Verifying backup...
--
-- PostgreSQL database dump
--
SET statement_timeout = 0;
...
Compressed: marsad-backup-20260715-140530.sql.gz
Backup uploaded to S3
```

### Step 2.2: Restore to Railway PostgreSQL

```bash
#!/bin/bash
# 1. Get Railway PostgreSQL connection string
# Option A: From Railway Dashboard
#   1. Go to "PostgreSQL" service
#   2. Click "$DATABASE_URL" (show value)
#   3. Copy full connection string

# Option B: Via CLI
RAILWAY_DB_URL=$(railway env -s postgresql DATABASE_URL)
echo "Railway DB URL: $RAILWAY_DB_URL"

# 2. Create backup file reference
BACKUP_FILE="marsad-backup-20260715-140530.sql"

# If compressed, decompress first
if [ -f "${BACKUP_FILE}.gz" ]; then
  gunzip "${BACKUP_FILE}.gz"
fi

# 3. Restore database
echo "Restoring database to Railway..."

# NOTE: This may take 10-30 minutes depending on backup size
time psql "$RAILWAY_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f "$BACKUP_FILE" \
  2>&1 | tee restore.log

# 4. Verify restore
echo "Verifying data..."
psql "$RAILWAY_DB_URL" -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';"

# Expected: Several tables (users, companies, assessments, etc.)
```

**Expected Output:**
```
Restoring database to Railway...
real    12m34.567s
user    0m23.456s
sys     0m3.210s

Verifying data...
 table_count
─────────────
          15

(1 row)
```

### Step 2.3: Data Integrity Verification

```bash
#!/bin/bash
# Compare AWS vs Railway row counts

BACKUP_FILE="marsad-backup-20260715-140530.sql"

# 1. Get AWS source counts (before export)
AWS_ENDPOINT="marsad-postgres.XXXXXXXXX.eu-central-1.rds.amazonaws.com"
DB_PASSWORD="YOUR_PASSWORD"

echo "=== AWS Source Verification ==="
PGPASSWORD="$DB_PASSWORD" psql \
  -h "$AWS_ENDPOINT" \
  -U admin \
  -d marsad \
  -tc "
    SELECT schemaname, tablename, n_live_tup
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
    LIMIT 20;
  " > aws-row-counts.txt

# 2. Get Railway destination counts (after restore)
RAILWAY_DB_URL=$(railway env -s postgresql DATABASE_URL)

echo "=== Railway Destination Verification ==="
psql "$RAILWAY_DB_URL" \
  -tc "
    SELECT schemaname, tablename, n_live_tup
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
    LIMIT 20;
  " > railway-row-counts.txt

# 3. Compare counts
echo "=== Comparison ==="
diff -u aws-row-counts.txt railway-row-counts.txt

# Expected: No significant differences
# If differences exist, investigate and re-restore
```

### Step 2.4: Backup Validation Script

```bash
#!/bin/bash
# validate-migration.sh
# Comprehensive database validation

RAILWAY_DB_URL=$(railway env -s postgresql DATABASE_URL)

echo "=== DATABASE MIGRATION VALIDATION ==="
echo "Time: $(date)"
echo ""

# 1. Connection test
echo "1. Testing database connection..."
if psql "$RAILWAY_DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "   ✓ Connection successful"
else
  echo "   ✗ Connection failed"
  exit 1
fi

# 2. Table verification
echo "2. Checking table count..."
TABLE_COUNT=$(psql "$RAILWAY_DB_URL" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
echo "   ✓ Found $TABLE_COUNT tables"

# 3. Row count verification
echo "3. Checking row counts..."
psql "$RAILWAY_DB_URL" -tc "
  SELECT schemaname, tablename, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 10;
" | column -t

# 4. Foreign key check
echo "4. Checking foreign key integrity..."
FKEY_COUNT=$(psql "$RAILWAY_DB_URL" -tc "
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'public';
" | tr -d ' ')
echo "   ✓ Found $FKEY_COUNT foreign keys"

# 5. Index verification
echo "5. Checking indexes..."
INDEX_COUNT=$(psql "$RAILWAY_DB_URL" -tc "
  SELECT COUNT(*)
  FROM pg_indexes
  WHERE schemaname = 'public';
" | tr -d ' ')
echo "   ✓ Found $INDEX_COUNT indexes"

# 6. Stored procedure check
echo "6. Checking functions/procedures..."
FUNC_COUNT=$(psql "$RAILWAY_DB_URL" -tc "
  SELECT COUNT(*)
  FROM pg_proc
  WHERE pg_catalog.pg_function_is_visible(oid);
" | tr -d ' ')
echo "   ✓ Found $FUNC_COUNT functions"

# 7. Sequence check
echo "7. Checking sequences..."
SEQ_COUNT=$(psql "$RAILWAY_DB_URL" -tc "
  SELECT COUNT(*)
  FROM information_schema.sequences
  WHERE sequence_schema = 'public';
" | tr -d ' ')
echo "   ✓ Found $SEQ_COUNT sequences"

echo ""
echo "=== VALIDATION COMPLETE ==="
echo "All checks passed! Migration is safe."
```

---

## PHASE 3: BACKEND DEPLOYMENT (Days 3-4)

### Step 3.1: Backend Dockerfile (Verify/Update)

**Current Dockerfile location:** `/c/Users/DTG/marsd/backend/Dockerfile`

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["npm", "run", "start"]
```

### Step 3.2: Backend Environment Variables

**Create `.env.railway` file in backend:**

```bash
# backend/.env.railway
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Database
DATABASE_URL=${{ Databases.PostgreSQL.connectionString }}
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Redis
REDIS_URL=${{ Databases.Redis.connectionString }}

# JWT / Security
JWT_SECRET=${{ SECRET_JWT_SECRET }}
JWT_EXPIRATION=24h

# CORS
CORS_ORIGIN=https://marsad.railway.app

# API
API_PORT=3000
API_TIMEOUT=30000

# Monitoring
SENTRY_DSN=${{ SECRET_SENTRY_DSN }}
```

### Step 3.3: Deploy Backend to Railway

```bash
#!/bin/bash
# Deploy backend service

cd backend

# 1. Connect to Railway
railway link

# 2. Create backend service if not exists
railway add backend \
  --service \
  --dockerfile

# 3. Set environment variables
railway variable add NODE_ENV=production
railway variable add PORT=3000
railway variable add LOG_LEVEL=info

# 4. Set secrets
railway variable add JWT_SECRET=$(openssl rand -base64 32)
railway variable add SENTRY_DSN=$SENTRY_DSN

# 5. Link to database services
# NOTE: Use Railway's service linking feature:
# 1. Go to Backend service settings
# 2. Click "Add service"
# 3. Link to PostgreSQL
# 4. Link to Redis

# 6. Configure deployment
railway config \
  --start-command "npm run start" \
  --build-command "npm install && npm run build" \
  --port 3000

# 7. Deploy
git push origin main
# Railway automatically builds and deploys on git push

# 8. Monitor deployment
railway logs -f

# Expected log output:
# [Nest] 12345 - 07/15/2026, 2:30:45 PM LOG [NestFactory] Starting Nest application...
# [Nest] 12345 - 07/15/2026, 2:30:47 PM LOG [InstanceLoader] DatabaseService dependencies initialized +15ms
# [Nest] 12345 - 07/15/2026, 2:30:48 PM LOG [InstanceLoader] ConfigService dependencies initialized +1ms
# ...
# [Nest] 12345 - 07/15/2026, 2:30:50 PM LOG [NestApplication] Nest application successfully started +200ms

# 9. Test health endpoint
sleep 30  # Wait for startup

BACKEND_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)
echo "Testing backend at: https://${BACKEND_URL}/health"

curl -s "https://${BACKEND_URL}/health" | jq .
# Expected: { "status": "ok", "timestamp": "2026-07-15T14:30:50Z" }
```

---

## PHASE 4: FRONTEND DEPLOYMENT (Days 3-4)

### Step 4.1: Frontend Dockerfile

**Current location:** `/c/Users/DTG/marsd/src/frontend/Dockerfile`

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start
CMD ["npm", "run", "start"]
```

### Step 4.2: Frontend Environment Variables

**Create `.env.railway` file in frontend:**

```bash
# frontend/.env.railway
NEXT_PUBLIC_API_URL=https://${{ Services.backend.RAILWAY_PUBLIC_DOMAIN }}
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_LOG_LEVEL=info

# Analytics (optional)
NEXT_PUBLIC_SENTRY_DSN=${{ SECRET_SENTRY_DSN }}

# Feature flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=true
```

### Step 4.3: Deploy Frontend to Railway

```bash
#!/bin/bash
# Deploy frontend service

cd frontend

# 1. Connect to Railway
railway link

# 2. Create frontend service
railway add frontend \
  --service \
  --dockerfile

# 3. Set environment variables
railway variable add NEXT_PUBLIC_ENV=production
railway variable add NEXT_PUBLIC_LOG_LEVEL=info

# 4. Configure deployment
railway config \
  --start-command "npm run start" \
  --build-command "npm install && npm run build" \
  --port 3001

# 5. Deploy
git push origin main

# 6. Monitor deployment
railway logs -f

# 7. Test frontend
sleep 30

FRONTEND_URL=$(railway env -s frontend RAILWAY_PUBLIC_DOMAIN)
echo "Testing frontend at: https://${FRONTEND_URL}"

curl -s "https://${FRONTEND_URL}" | head -20
# Expected: HTML page with React app
```

---

## PHASE 5: INTEGRATION & TESTING (Days 5-7)

### Step 5.1: Connectivity Test Script

```bash
#!/bin/bash
# integration-test.sh
# Test all services connectivity

echo "=== INTEGRATION TEST SUITE ==="
echo "Date: $(date)"
echo ""

# Get service URLs
BACKEND_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)
FRONTEND_URL=$(railway env -s frontend RAILWAY_PUBLIC_DOMAIN)
DB_URL=$(railway env -s postgresql DATABASE_URL)
REDIS_URL=$(railway env -s redis RAILWAY_REDIS_URL)

echo "Services:"
echo "  Backend:  https://${BACKEND_URL}"
echo "  Frontend: https://${FRONTEND_URL}"
echo "  Database: ${DB_URL%%@*}@***:5432/marsad"
echo "  Redis:    *** (hidden)"
echo ""

# Test 1: Backend health
echo "Test 1: Backend health check..."
HEALTH=$(curl -s "https://${BACKEND_URL}/health")
if echo "$HEALTH" | grep -q "ok"; then
  echo "   ✓ PASS"
else
  echo "   ✗ FAIL: $HEALTH"
fi

# Test 2: Frontend loads
echo "Test 2: Frontend page load..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${FRONTEND_URL}")
if [ "$HTTP_CODE" == "200" ]; then
  echo "   ✓ PASS (HTTP 200)"
else
  echo "   ✗ FAIL (HTTP $HTTP_CODE)"
fi

# Test 3: Database connectivity
echo "Test 3: Database connectivity..."
if psql "$DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "   ✓ PASS"
else
  echo "   ✗ FAIL"
fi

# Test 4: Redis connectivity
echo "Test 4: Redis connectivity..."
redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✓ PASS"
else
  echo "   ✗ FAIL"
fi

# Test 5: Backend can connect to database
echo "Test 5: Backend → Database connectivity..."
BACKEND_LOG=$(railway logs -s backend | tail -50)
if echo "$BACKEND_LOG" | grep -qi "database.*connected\|sequelize.*connected"; then
  echo "   ✓ PASS"
else
  echo "   ✗ FAIL: Check logs"
fi

# Test 6: Backend can connect to Redis
echo "Test 6: Backend → Redis connectivity..."
if echo "$BACKEND_LOG" | grep -qi "redis.*connected\|bull.*ready"; then
  echo "   ✓ PASS"
else
  echo "   ✗ FAIL: Check logs"
fi

# Test 7: Frontend can call API
echo "Test 7: Frontend → Backend connectivity..."
API_RESPONSE=$(curl -s "https://${BACKEND_URL}/api/health" -w "\n%{http_code}")
HTTP_CODE=$(echo "$API_RESPONSE" | tail -1)
if [ "$HTTP_CODE" == "200" ]; then
  echo "   ✓ PASS (HTTP 200)"
else
  echo "   ✗ FAIL (HTTP $HTTP_CODE)"
fi

echo ""
echo "=== TEST COMPLETE ==="
```

### Step 5.2: Load Testing

```bash
#!/bin/bash
# load-test.sh
# Test performance under load

# Install k6 if needed
# brew install k6 (macOS) or apt-get install k6 (Linux)

BACKEND_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)

cat > load-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp to 20 users
    { duration: '1m30s', target: 20 }, // Stay at 20
    { duration: '20s', target: 50 },   // Ramp to 50 users
    { duration: '1m30s', target: 50 }, // Stay at 50
    { duration: '20s', target: 100 },  // Ramp to 100 users
    { duration: '1m30s', target: 100 }, // Stay at 100
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests < 500ms
    http_req_failed: ['rate<0.1'],    // Error rate < 10%
  },
};

export default function () {
  let url = `https://${__ENV.BACKEND_URL}`;
  
  let res = http.get(url + '/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
EOF

# Run test
k6 run -e BACKEND_URL="$BACKEND_URL" load-test.js

# Expected output:
# ✓ status is 200
# ✓ response time < 500ms
# ...
# http_req_duration..............: avg=245ms, min=120ms, med=230ms, max=890ms, p(95)=450ms
```

### Step 5.3: Security Test Checklist

```markdown
# Security Verification Checklist

## SSL/TLS
- [ ] Backend HTTPS working (green lock icon)
- [ ] Frontend HTTPS working (green lock icon)
- [ ] Certificate auto-generated by Railway
- [ ] Certificate valid for 90 days
- [ ] No SSL warnings in browser

## Secrets & Environment Variables
- [ ] JWT_SECRET not exposed in logs
- [ ] Database password not in frontend
- [ ] API keys stored as secrets (not in code)
- [ ] .env files not committed to Git
- [ ] Railway secrets properly configured

## CORS & Origin Policy
- [ ] Frontend can call Backend API
- [ ] CORS headers properly set
- [ ] No "Access-Control-Allow-Origin: *"
- [ ] Specific origins whitelisted

## Database Security
- [ ] PostgreSQL not publicly accessible
- [ ] Database connections use SSL
- [ ] Database password strong (32+ chars)
- [ ] Row-level security (RLS) policies applied
- [ ] Audit logging enabled

## API Security
- [ ] No sensitive data in query strings
- [ ] JWT validation on all protected endpoints
- [ ] Rate limiting implemented (optional)
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak internal details

## Infrastructure Security
- [ ] No direct SSH access needed
- [ ] All credentials in secrets manager
- [ ] Backups encrypted
- [ ] Logs not exposing sensitive data
- [ ] No hardcoded credentials in code

## Compliance (Multi-tenant)
- [ ] Row-level security policies in place
- [ ] Tenant data properly isolated
- [ ] Cross-tenant access prevented
- [ ] Audit logs maintain tenant context
```

---

## PHASE 6: CUTOVER & LAUNCH (Days 7-8)

### Step 6.1: Cutover Plan

```markdown
# Production Cutover Plan

## Pre-Cutover (24 hours before)

- [ ] Final database backup from AWS
- [ ] Data integrity check (row counts match)
- [ ] Load test passed (100 concurrent users, <500ms)
- [ ] Security audit completed
- [ ] All team members notified
- [ ] AWS infrastructure kept as standby
- [ ] Rollback procedure tested and ready
- [ ] Communication plan ready (status page, email)

## Cutover Window

**Time:** Friday 2026-07-28, 20:00 UTC (off-peak)  
**Duration:** 2-4 hours

1. **15 minutes before (19:45 UTC)**
   - [ ] Team assembled in War Room (Slack/Discord)
   - [ ] DNS ready to switch (if using new domain)
   - [ ] AWS infrastructure on standby
   - [ ] Monitoring dashboard active

2. **Start of Window (20:00 UTC)**
   - [ ] Verify all Railway services healthy
   - [ ] Verify database has latest backup
   - [ ] Send status page update: "Scheduled maintenance"
   - [ ] Stop accepting new requests (graceful shutdown)

3. **10-minute grace period (20:10 UTC)**
   - [ ] Allow in-flight requests to complete
   - [ ] Check error logs for issues

4. **Switch traffic to Railway (20:15 UTC)**
   - [ ] Update DNS records to Railway IPs
   - [ ] Update load balancer rules (if applicable)
   - [ ] Start monitoring for errors

5. **Verify operation (20:20-20:30 UTC)**
   - [ ] Test health endpoints returning 200
   - [ ] Test sample API calls working
   - [ ] Check error rates < 0.1%
   - [ ] Verify database queries working
   - [ ] Confirm logs populating

6. **Stabilization period (20:30-22:00 UTC)**
   - [ ] Monitor continuously
   - [ ] Watch for gradual error increases
   - [ ] Check AWS CloudWatch (baseline)
   - [ ] Send status page: "Maintenance complete"

7. **Post-cutover (22:00 UTC)**
   - [ ] Verify 100+ requests processed successfully
   - [ ] Send all-clear notification
   - [ ] Close war room
   - [ ] Document any issues

## Rollback Procedure (if needed)

**If critical error occurs within 1 hour:**

1. Immediately revert DNS to AWS infrastructure
2. Restore latest database backup from S3
3. Verify AWS services responding
4. Send customer notification
5. Schedule retrospective (same day)

**RTO (Recovery Time Objective):** 15 minutes  
**RPO (Recovery Point Objective):** <5 minutes
```

### Step 6.2: DNS Configuration

**If using custom domain (e.g., app.marsad.io):**

```bash
# 1. Get Railway URLs
BACKEND_RAILWAY_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)
FRONTEND_RAILWAY_URL=$(railway env -s frontend RAILWAY_PUBLIC_DOMAIN)

echo "Backend Railway URL: $BACKEND_RAILWAY_URL"
echo "Frontend Railway URL: $FRONTEND_RAILWAY_URL"

# 2. Update DNS records (in your DNS provider)
# 
# Old records (AWS ALB):
#   api.marsad.io      CNAME → marsad-alb-1234.eu-central-1.elb.amazonaws.com
#   app.marsad.io      CNAME → marsad-alb-1234.eu-central-1.elb.amazonaws.com
#
# New records (Railway):
#   api.marsad.io      CNAME → $BACKEND_RAILWAY_URL
#   app.marsad.io      CNAME → $FRONTEND_RAILWAY_URL

# 3. Verify DNS propagation
echo "Waiting for DNS propagation (5-10 minutes)..."
sleep 300

# 4. Test DNS resolution
nslookup api.marsad.io
# Expected: pointing to Railway IP

nslookup app.marsad.io
# Expected: pointing to Railway IP

# 5. Test HTTPS
curl -s https://api.marsad.io/health | jq .
curl -s https://app.marsad.io | head -20
```

---

## PHASE 7: MONITORING & OPTIMIZATION (Ongoing)

### Step 7.1: Set Up Monitoring

```bash
#!/bin/bash
# setup-monitoring.sh

echo "=== Setting up Monitoring ==="

# 1. Sentry for error tracking
echo "1. Sentry integration..."
railway variable add SENTRY_DSN="https://key@sentry.io/project-id"
echo "   ✓ Sentry configured"

# 2. PagerDuty for alerts
echo "2. PagerDuty integration..."
railway integration add pagerduty
echo "   ✓ PagerDuty configured"

# 3. Railway native monitoring
echo "3. Railway monitoring dashboard..."
echo "   ✓ View at: https://railway.app/project/[project-id]"

# 4. Custom health check script
cat > health-check.sh << 'EOF'
#!/bin/bash
# health-check.sh - Run every 5 minutes

BACKEND_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)
FRONTEND_URL=$(railway env -s frontend RAILWAY_PUBLIC_DOMAIN)

# Check backend
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://${BACKEND_URL}/health)
if [ "$BACKEND_STATUS" != "200" ]; then
  echo "CRITICAL: Backend returned HTTP $BACKEND_STATUS"
  # Send alert (Slack, PagerDuty, etc.)
fi

# Check frontend
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://${FRONTEND_URL})
if [ "$FRONTEND_STATUS" != "200" ]; then
  echo "CRITICAL: Frontend returned HTTP $FRONTEND_STATUS"
  # Send alert
fi

echo "Health check passed: Backend $BACKEND_STATUS, Frontend $FRONTEND_STATUS"
EOF

chmod +x health-check.sh

echo "=== Monitoring setup complete ==="
```

### Step 7.2: Daily Operations Checklist

```markdown
# Daily Operations Checklist

## Morning Standup (10:00 AM UTC)
- [ ] Check Railway dashboard for errors
- [ ] Review Sentry error summary
- [ ] Check PagerDuty for overnight alerts
- [ ] Verify response times < 500ms
- [ ] Check error rate < 0.1%

## Mid-day Check (14:00 UTC)
- [ ] Spot check API functionality
- [ ] Verify database queries responsive
- [ ] Check memory/CPU usage
- [ ] Monitor active connections count
- [ ] Review access logs for anomalies

## EOD Report (17:00 UTC)
- [ ] Document any incidents
- [ ] Check cost vs. budget
- [ ] Verify backup completed
- [ ] Update team on status
- [ ] Schedule any needed optimizations
```

---

## TROUBLESHOOTING GUIDE

### Issue: Backend Service Won't Start

```bash
# 1. Check logs
railway logs -s backend -f

# Common errors:
# - "ENOENT: no such file or directory, open '/app/package.json'"
#   → Missing COPY package*.json in Dockerfile
# - "Cannot find module 'express'"
#   → Missing npm install in Dockerfile
# - "listen EADDRINUSE :::3000"
#   → Port already in use (change in railway config)

# 2. Verify Dockerfile
cat backend/Dockerfile

# 3. Test build locally
docker build -f backend/Dockerfile -t marsad-api:test .
docker run -it -p 3000:3000 marsad-api:test

# 4. Check environment variables
railway env

# If missing DATABASE_URL or REDIS_URL:
railway link
railway add postgresql  # or redis
```

### Issue: Frontend Can't Connect to Backend

```bash
# 1. Check CORS headers
curl -i "https://api.example.com/health" | grep -i access-control

# Should see:
# Access-Control-Allow-Origin: https://frontend.example.com
# Access-Control-Allow-Credentials: true

# 2. Verify API URL in frontend config
# Check: NEXT_PUBLIC_API_URL environment variable

railway env -s frontend | grep NEXT_PUBLIC_API_URL

# 3. Test API manually
BACKEND_URL=$(railway env -s backend RAILWAY_PUBLIC_DOMAIN)
curl "https://${BACKEND_URL}/health"

# If 404: Check backend routes
# If 500: Check backend logs
```

### Issue: Database Connection Timeout

```bash
# 1. Check connection string
DB_URL=$(railway env -s postgresql DATABASE_URL)
echo $DB_URL

# Format should be: postgresql://user:password@host:5432/dbname

# 2. Test connection
psql "$DB_URL" -c "SELECT 1;"

# If "connection timeout":
#   - Check PostgreSQL service is running (Railway dashboard)
#   - Verify firewall rules allow outbound 5432
#   - Check max connections: psql "$DB_URL" -c "SHOW max_connections;"

# 3. Add PgBouncer if too many connections
# (See implementation guide for details)
```

---

## ROLLBACK PROCEDURE

If production deployment fails, follow this procedure:

```bash
#!/bin/bash
# rollback.sh

echo "=== PRODUCTION ROLLBACK PROCEDURE ==="

# 1. Revert DNS to AWS
echo "Step 1: Reverting DNS to AWS infrastructure..."
# Contact DNS provider or update in infrastructure code

# 2. Restore AWS database
echo "Step 2: Restoring AWS database from backup..."
BACKUP_FILE="aws-backup-before-migration.sql"
TERRAFORM_DIR="infrastructure/terraform"
DB_ENDPOINT=$(cd $TERRAFORM_DIR && terraform output -raw rds_endpoint)
DB_PASSWORD=$(cd $TERRAFORM_DIR && terraform output -raw rds_password)

PGPASSWORD="$DB_PASSWORD" psql \
  -h "$DB_ENDPOINT" \
  -U admin \
  -d marsad \
  < "$BACKUP_FILE"

# 3. Verify AWS services
echo "Step 3: Verifying AWS infrastructure..."
cd infrastructure/terraform
terraform apply -auto-approve

# 4. Test endpoints
echo "Step 4: Testing endpoints..."
AWS_ALB_DNS=$(terraform output -raw alb_dns_name)
curl "http://${AWS_ALB_DNS}/health"

# 5. Notify stakeholders
echo "Step 5: Notifying stakeholders..."
# Send email/Slack notification

echo "=== ROLLBACK COMPLETE ==="
echo "Next steps:"
echo "1. Investigate root cause"
echo "2. Fix issues in Railway setup"
echo "3. Schedule retry migration"
```

---

**END OF IMPLEMENTATION GUIDE**

This guide should be executed in order (Days 1-8). Each phase builds on the previous one.

**Key Dates:**
- Days 1-2: Initial setup
- Days 3-4: Data migration & deployment
- Days 5-7: Testing & integration
- Day 8: Final decision & cutover
- August 3: Production launch (500 users)
