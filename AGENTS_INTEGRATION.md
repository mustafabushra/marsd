# 🔗 Marsad Agents ↔ Frontend/Backend Integration

**Status:** Ready for Integration  
**Date:** 2026-07-13

---

## Overview

The Autonomous Agent System is now ready to **drive the development** of the Marsad platform frontend and backend that already exist.

Current state:
- ✅ **Frontend** — React app with components (Search, Dashboard, Reports)
- ✅ **Backend** — NestJS skeleton with Prisma schema
- ✅ **Mock API** — Working integration layer
- 🆕 **Agents** — Will orchestrate completing both

---

## Integration Architecture

```
┌─────────────────────────────────────────┐
│    Agents (Security-First Tasks)       │
│  ┌────┐ ┌──────┐ ┌────────┐ ┌──────┐ │
│  │Back│ │Front│ │Security│ │  QA  │ │
│  │End │ │End  │ │ Eng    │ │ Eng  │ │
│  └────┘ └──────┘ └────────┘ └──────┘ │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴────────────┐
    │                       │
┌───▼────────────────┐ ┌──▼──────────────────┐
│  Frontend (React)   │ │  Backend (NestJS)   │
│ ├─ components/      │ │ ├─ src/             │
│ ├─ pages/          │ │ ├─ modules/         │
│ ├─ lib/api.ts      │ │ ├─ prisma/          │
│ └─ src/App.jsx     │ │ └─ package.json     │
└────────────────────┘ └─────────────────────┘
    ▲                       ▲
    │ Uses Mock API        │ Implements Real
    │ (Currently)          │ Endpoints
    └──────────┬───────────┘
               │
        ┌──────▼──────┐
        │  Database   │
        │ PostgreSQL  │
        │ (Supabase)  │
        └─────────────┘
```

---

## What Agents Will Do

### BackendEngineer Tasks

**Phase 2: Backend API Development**

1. ✓ **Implement `/companies/search` endpoint**
   - Full-text search (pg_trgm)
   - Pagination support
   - SQL injection prevention
   - Tenant isolation

2. ✓ **Implement `/trust-score/:id` endpoint**
   - Calculate trust scores
   - Apply plan-based gating
   - Validate company ownership

3. ✓ **Implement `/reports` endpoints**
   - POST (submit report)
   - GET (retrieve)
   - Approval workflow
   - Audit logging

4. ✓ **Implement watchlist endpoints**
   - ADD/REMOVE companies
   - Tenant-scoped queries

5. ✓ **Configure database**
   - Setup PostgreSQL (Supabase)
   - Enable RLS policies
   - Add encryption for sensitive fields
   - Setup audit logging

### FrontendEngineer Tasks

**Phase 3: Frontend Component Development**

1. ✓ **Complete Search page**
   - Connect to `/companies/search` API
   - Display trust scores from API
   - Handle loading/error states
   - Implement filters (sector, city, risk level)

2. ✓ **Complete Trust Report page**
   - Display full report data
   - Apply gating logic (check plan)
   - Show 4 states (موثوق/متوسطة/غير كافي/مقفل)
   - Handle API integration

3. ✓ **Complete Dashboard**
   - KPI cards with real data
   - Watchlist integration
   - Activity feed
   - Subscription status

4. ✓ **Implement Admin panel**
   - Report review queue
   - Company management
   - User controls
   - Bulk operations

### SecurityEngineer Tasks

**Ongoing: Security Verification**

1. ✓ **Backend security audit**
   - Parameterized queries (Prisma)
   - JWT validation
   - Tenant isolation checks
   - No secret logging

2. ✓ **Frontend security audit**
   - XSS prevention (React patterns)
   - Token handling
   - Protected routes
   - CSRF prevention

3. ✓ **Database security**
   - RLS policies active
   - Encryption at rest
   - Audit trail enabled

### QAEngineer Tasks

**Phase 4: Integration Testing**

1. ✓ **End-to-end flow tests**
   - Login → Search → View Report → Gating
   - Add to watchlist → View → Remove
   - Submit report → Review → Approve

2. ✓ **Security tests**
   - SQL injection attempts (blocked)
   - XSS attempts (blocked)
   - CSRF attempts (blocked)
   - IDOR attempts (blocked)
   - Multi-tenant breach attempts (blocked)

3. ✓ **Performance tests**
   - Frontend bundle size
   - API response times
   - Database query performance

---

## Current Implementation Status

### Frontend (src/)

| File | Status | Agent Task |
|------|--------|-----------|
| `src/App.jsx` | ✅ Complete | Routes all set |
| `src/pages/Login.jsx` | ✅ Integrated | Uses mock API |
| `src/pages/Search.jsx` | ✅ Integrated | Uses mock API, needs real backend |
| `src/pages/TrustReport.jsx` | ⏳ Needs completion | Gating logic ready, needs API |
| `src/pages/CompanyDashboard.jsx` | ⏳ Needs completion | Layout ready, needs data |
| `src/pages/AdminDashboard.jsx` | ⏳ Needs completion | Layout ready, needs API |
| `src/lib/api.ts` | ✅ Mock layer | Will switch to real endpoints |
| `src/components/*` | ✅ Complete | Reusable components ready |

### Backend (backend/)

| File | Status | Agent Task |
|------|--------|-----------|
| `prisma/schema.prisma` | ✅ Complete | 17 tables, RLS-ready |
| `src/modules/auth/*` | ✅ Core logic | Tested with smoke test |
| `src/modules/companies/*` | ⏳ Needs API | Search + company ops |
| `src/modules/reports/*` | ⏳ Needs API | Submission + approval |
| `src/modules/trust-score/*` | ✅ Core logic | Tested, ready for API |
| `src/modules/admin/*` | ⏳ Needs completion | Admin operations |
| `docker-compose.yml` | ✅ Ready | PostgreSQL + Redis |

### Mock API (src/lib/api.ts)

| Function | Status | Replacement |
|----------|--------|-------------|
| `login()` | ✅ Mock | → NestJS `/auth/login` |
| `register()` | ✅ Mock | → NestJS `/auth/register` |
| `searchCompanies()` | ✅ Mock | → NestJS `/companies/search` |
| `getCompanyReport()` | ✅ Mock | → NestJS `/companies/:id/report` |
| `submitReport()` | ✅ Mock | → NestJS `/reports` POST |
| `getMyReports()` | ✅ Mock | → NestJS `/reports/mine` |
| `addToWatchlist()` | ✅ Mock | → NestJS `/watchlist` POST |
| `getWatchlist()` | ✅ Mock | → NestJS `/watchlist` GET |

---

## Integration Workflow

### Step 1: Connect Frontend to Real Backend

**Agent: BackendEngineer**  
**Timeline: Day 2-3**

```typescript
// Current: mock API
// src/lib/api.ts uses hardcoded mock data

// After: Real API
// src/lib/api.ts points to http://localhost:3000

// Example change:
export async function searchCompanies(q: string) {
  // BEFORE (mock):
  // const filtered = mockCompanies.filter(...)
  
  // AFTER (real):
  const res = await fetch('http://localhost:3000/companies/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q }),
  })
  return res.json()
}
```

### Step 2: Implement Missing Backend Endpoints

**Agent: BackendEngineer**  
**Timeline: Day 3-5**

Currently missing:
- POST `/companies/search` — needs implementation
- GET `/companies/:id/report` — needs gating logic
- POST `/reports` — needs full workflow
- POST `/watchlist` — needs CRUD operations
- Admin endpoints (10+ operations)

### Step 3: Complete Frontend Pages

**Agent: FrontendEngineer**  
**Timeline: Day 5-10**

Currently incomplete:
- Trust Report page (display logic)
- Dashboard (data integration)
- Admin panel (full CRUD)
- Report form (submission workflow)

### Step 4: Security Verification

**Agent: SecurityEngineer**  
**Timeline: Ongoing (all phases)**

Continuous checks:
- Parameterized queries (Prisma)
- JWT validation
- RLS enforcement
- No secret logging

### Step 5: Integration Testing

**Agent: QAEngineer**  
**Timeline: Day 10-15**

Test flows:
- Complete auth → dashboard flow
- Search → view report → add to watchlist
- Admin: review queue → approve report
- Security: 20+ attack scenarios

---

## How Agents Will Execute

### Example: Complete Search Feature

**Task Created:**
```typescript
const task = new TaskBuilder(
  'API: Complete Search Feature',
  'Implement search with trust scores + pagination'
)
  .setPriority('critical')
  .addSecurityCheck('injection', 'SQL Injection Prevention', 'critical')
  .addSecurityCheck('multi-tenant', 'Tenant Isolation', 'critical')
  .addSecurityCheck('auth', 'JWT Required', 'critical')
  .build()
```

**BackendEngineer executes:**
1. Implement NestJS endpoint: `POST /companies/search`
   ```typescript
   @Post('search')
   @UseGuards(JwtAuthGuard)
   async search(@Body() dto: SearchDto, @Req() req) {
     // Verify JWT ✅
     // Check tenant_id ✅
     // Use Prisma (parameterized) ✅
     // Log action ✅
     return results
   }
   ```

2. Mark security items verified:
   - ✅ SQL Injection Prevention (Prisma)
   - ✅ Tenant Isolation (req.user.tenantId)
   - ✅ JWT Required (guard)

3. Complete task ✅

**FrontendEngineer notified:**
1. Update `src/lib/api.ts`:
   ```typescript
   export async function searchCompanies(q) {
     return fetch('http://localhost:3000/companies/search', {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${getAuthToken()}` },
       body: JSON.stringify({ query: q }),
     })
   }
   ```

2. No changes needed in `Search.jsx` (already uses API) ✅

**QAEngineer tests:**
1. ✓ Search returns results
2. ✓ Results sorted by trust score
3. ✓ Pagination works
4. ✓ SQL injection blocked
5. ✓ Cross-tenant isolation verified

---

## Deployment Path

### Phase 1: Development (Local)
```
Frontend: npm run dev (http://localhost:5173)
Backend: npm run dev (http://localhost:3000)
Database: Docker PostgreSQL
```

### Phase 2: Staging (Vercel/Railway)
```
Frontend: Vercel (auto-deployed from main)
Backend: Railway (Node.js deployment)
Database: Supabase (managed PostgreSQL)
```

### Phase 3: Production
```
Frontend: Vercel (global edge network)
Backend: Vercel Serverless (scalable)
Database: Supabase (HA PostgreSQL)
CDN: CloudFlare (DDoS protection)
Monitoring: Sentry + New Relic
```

---

## Quick Reference: What to Do Next

### For Backend Integration

1. **Install Agent system:**
   ```bash
   cd agents
   npm install
   npm run build
   ```

2. **Create backend task:**
   ```bash
   npm start
   > build-api
   API Endpoint name: POST /companies/search
   Description: Search companies
   ```

3. **Implement endpoint:**
   - Agent will verify security checklist
   - You implement the logic
   - Mark items verified

4. **Test with Frontend:**
   - Frontend automatically uses new endpoint
   - Via updated `src/lib/api.ts`

### For Frontend Integration

1. **Complete a page:**
   ```bash
   npm start
   > build-component
   Component name: SearchPage
   Description: Add API integration
   ```

2. **Agent will verify:**
   - No XSS vulnerabilities
   - Protected routes
   - JWT token handling

3. **Deploy:**
   - Push to GitHub
   - Vercel auto-deploys

---

## Files to Update

### Backend Files (NestJS)

```
backend/src/modules/
├── companies/
│   └── companies.controller.ts  ← Add POST /search
├── reports/
│   ├── reports.controller.ts    ← Add all endpoints
│   └── reports.service.ts       ← Implement workflow
├── admin/
│   ├── admin.controller.ts      ← Admin operations
│   └── admin.service.ts         ← Admin logic
└── trust-score/
    └── trust-score.controller.ts ← Add GET/:id
```

### Frontend Files (React)

```
src/
├── pages/
│   ├── TrustReport.jsx          ← Connect to API
│   ├── CompanyDashboard.jsx     ← Add real data
│   └── AdminDashboard.jsx       ← Implement
├── lib/
│   └── api.ts                   ← Point to real backend
└── components/
    └── ReportForm.jsx           ← Implement submission
```

---

## Success Criteria

✅ All agents complete their tasks  
✅ All security checks pass  
✅ All tests pass (integration + security)  
✅ No console errors  
✅ All OWASP vectors blocked  
✅ Cross-tenant isolation verified  
✅ Gating logic enforced  
✅ Performance targets met  

---

## Timeline

| Day | Phase | Status |
|-----|-------|--------|
| 1 | Agent System Built | ✅ Complete |
| 2-3 | Backend APIs | 🔄 In Progress |
| 4-7 | Frontend Pages | 🔄 In Progress |
| 8-10 | Integration & Testing | ⏳ Pending |
| 11-15 | Security Audit | ⏳ Pending |
| 16-18 | Performance Optimization | ⏳ Pending |
| 19-20 | Deployment Prep | ⏳ Pending |

---

## Questions?

Refer to:
- **AGENTS_DEPLOYMENT.md** — Complete agent system documentation
- **agents/README.md** — How to use agents
- **backend/README.md** — Backend API reference
- **INTEGRATION_STATUS.md** — Current integration state

---

**Status:** 🟢 Ready to Begin Integration

Agents are ready to drive development forward. Start bootstrap for complete automation.

```bash
cd agents && npm run bootstrap
```
