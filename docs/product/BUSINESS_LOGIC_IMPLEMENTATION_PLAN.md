# 🚀 BUSINESS LOGIC IMPLEMENTATION PLAN

**Goal:** Complete business logic for every page in both dashboards
**Principle:** Single source of truth — one database for both portals
**Timeline:** Implementation phase (ongoing)

---

## PHASE 1: CORE DATA FLOW

### 1.1 Company Registration
**File:** `src/pages/CompanyRegister.jsx`
**Status:** ❌ INCOMPLETE

When company registers:
```
CompanyRegister.jsx
  ↓ (user fills form)
  ↓ api.register() 
  ↓
Supabase:
  ├─ auth.users (create)
  ├─ tenants (create)
  ├─ users (create)
  ├─ companies (create)
  ├─ subscriptions (create with plan='free')
  ├─ credits (initialize)
  └─ notifications (send welcome)
  ↓
AdminDashboard.jsx
  ├─ Company appears in list
  ├─ KPIs updated
  └─ Analytics updated
```

**Business Rules:**
- ✓ Validate company uniqueness (CR number, name, tax ID)
- ✓ Create user with role='owner'
- ✓ Auto-subscribe to free plan
- ✓ Initialize 0 credits (can earn by reports)
- ✓ Send welcome email
- ✓ Log in audit_logs
- ✓ Redirect to onboarding

**Tables Used:** `auth.users`, `tenants`, `users`, `companies`, `subscriptions`, `credits`, `notifications`, `audit_logs`

---

### 1.2 Company Dashboard
**File:** `src/pages/CompanyDashboard.jsx`
**Status:** ❌ INCOMPLETE

Display:
```
Dashboard Card: {
  company: { name, logo, sector, city },
  stats: {
    trustScore: calc from reports,
    reportCount: COUNT(reports) WHERE status='approved',
    watchedBy: COUNT(watchlist_items),
    creditsBalance: SUM(credits_ledger),
    subscriptionTier: subscriptions.plan,
    subscriptionExpiry: subscriptions.expires_at
  },
  recentActivity: [
    { type: 'report_approved', date, count },
    { type: 'credit_earned', amount, reason },
    { type: 'user_invited', email, role }
  ],
  buttons: {
    editProfile,
    addUser,
    submitReport,
    viewReports,
    viewWatchlist,
    upgradeSubscription
  }
}
```

**Business Rules:**
- ✓ Show only current tenant's data
- ✓ Trust score = real calculation from reports
- ✓ Credits = sum from credits_ledger
- ✓ Subscription = active plan with expiry date
- ✓ Recent activity = aggregated events

**Tables Used:** `tenants`, `companies`, `reports`, `trust_scores`, `subscriptions`, `credits_ledger`, `notifications`

---

## PHASE 2: COMPANY PORTAL

### 2.1 Search Companies
**File:** `src/pages/Search.jsx`
**Status:** ✅ UPDATED (Knowledge Graph)

**Already implemented:**
- ✓ searchKnowledgeGraph() function
- ✓ Search in report descriptions, types, company names
- ✓ Results show companies + aggregated reports
- ✓ Filter by sector, city, risk, score

**Still needed:**
- ✓ Verify FTS on `reports` table
- ✓ Test with real data
- ✓ Anonymization (no reporter_id shown)

---

### 2.2 Add/Submit Report
**File:** `src/pages/AddReport.jsx`
**Status:** ⚠️ PARTIAL

Current flow:
```
Company fills form
  ↓
Submit
  ↓
api.submitReport()
  ↓
INSERT into reports
  ├─ target_company_id
  ├─ reporter_tenant_id (current user's tenant)
  ├─ type (delayed_payment, etc)
  ├─ description
  ├─ status: 'pending_review'
  └─ created_at
  ↓
Success screen → Redirect to /my-reports
```

**Missing Business Logic:**
- ❌ BR-05: 90-day duplicate check (prevent spam)
- ❌ BR-06: Credit deduction (1 credit per report)
- ❌ BR-07: Content validation (min 20 chars, no spam)
- ❌ BR-08: Trigger audit log
- ❌ BR-09: Trigger notification to admins
- ❌ BR-10: Company creation if not exists
- ❌ BR-11: Auto-update aggregated stats

**Implementation:**
```sql
-- BR-05: Check for duplicate
SELECT * FROM reports 
WHERE reporter_tenant_id = current_tenant
  AND target_company_id = target_company
  AND created_at > NOW() - INTERVAL '90 days'
  AND status = 'approved'

-- Deduct credit
INSERT INTO credits_ledger 
VALUES (tenant_id, report_id, -1, 'report_submitted')

-- Notify admins
INSERT INTO notifications
VALUES (admin_id, 'new_report', ...)
```

**Tables Used:** `reports`, `credits_ledger`, `notifications`, `audit_logs`, `companies`

---

### 2.3 My Reports
**File:** `src/pages/MyReports.jsx`
**Status:** ❌ INCOMPLETE

Display reports from current tenant:
```
List: [
  {
    company: name,
    type: icon,
    description: preview,
    status: pending | approved | rejected,
    createdAt: date,
    creditsEarned: 0 | 10 (if approved),
    actions: [view, edit (if pending), delete (if pending)]
  }
]
```

**Business Logic:**
- ✓ Show only reports from current tenant
- ✓ Filter by status
- ✓ Sort by date (newest first)
- ✓ Show credits earned when approved
- ✓ Allow edit/delete only if pending
- ✓ Show rejection reason if rejected

**Tables Used:** `reports`, `credits_ledger`

---

### 2.4 Watchlist
**File:** `src/pages/Watchlist.jsx`
**Status:** ❌ INCOMPLETE

Display watched companies:
```
List: [
  {
    company: { name, sector, city },
    trustScore: latest,
    trend: ↑ ↓ → (improvement, decline, stable),
    recentReports: 3 (count in last 30 days),
    actions: [view, removeFromWatchlist]
  }
]
```

**Business Logic:**
- ✓ Show companies added by current tenant
- ✓ Trust score = latest value
- ✓ Trend = compare last 2 months
- ✓ Recent reports = last 30 days
- ✓ Remove = DELETE from watchlist_items
- ✓ Button "Add to Watchlist" on company cards

**Tables Used:** `watchlist_items`, `companies`, `trust_scores`, `reports`

---

### 2.5 Company Users
**File:** `src/pages/CompanyUsers.jsx`
**Status:** ⚠️ PARTIAL

Current implementation:
- ✓ Show users in same tenant
- ✓ Add user via email (creates pending_invites)
- ✓ Edit/delete users

**Missing:**
- ❌ Role assignment (Owner, Manager, Viewer)
- ❌ Permission checking (Owner can do anything, Viewer can't submit reports)
- ❌ Email verification flow
- ❌ Pending invites status
- ❌ Resend invitation link

**Implementation:**
```
Flow:
Admin invites user@email.com with role='Manager'
  ↓
INSERT into pending_invites (email, role, tenant_id, invited_by)
  ↓
Send email with signup link
  ↓
User clicks link and registers with that email
  ↓
Trigger: Match pending_invite with new user
  ↓
INSERT into users (tenant_id, email, role='Manager')
  ↓
UI: User appears in company's user list
```

**Tables Used:** `users`, `pending_invites`, `tenants`

---

### 2.6 Subscription
**File:** `src/pages/Subscription.jsx`
**Status:** ❌ INCOMPLETE

Display:
```
Current Plan: {
  name: 'Pro',
  price: 99,
  renewalDate: '2025-01-23',
  features: [unlimited_reports, advanced_analytics, api_access],
  billing: {
    nextInvoiceAmount: 99,
    nextInvoiceDate: '2025-01-23',
    paymentMethod: 'VISA ...1234'
  }
}

Available Plans: [
  { name, price, features, button: 'Upgrade' | 'Current' | 'Downgrade' }
]
```

**Business Logic:**
- ✓ Show current active subscription
- ✓ Show available plans with features
- ✓ Upgrade: immediately active, pro-rated billing
- ✓ Downgrade: active at renewal date
- ✓ Cancel: set expires_at = today
- ✓ Payment processing (Stripe/Moyasar)

**Business Rules:**
- BR-01: Free plan = max 5 reports/month, no analytics
- BR-02: Pro = unlimited reports, advanced analytics
- BR-03: Enterprise = custom features, dedicated support
- BR-04: Downgrade only at renewal

**Tables Used:** `subscriptions`, `plans`, `payments`, `invoices`

---

## PHASE 3: ADMIN PORTAL

### 3.1 Admin Dashboard
**File:** `src/pages/AdminDashboard.jsx`
**Status:** ⚠️ PARTIAL

Currently shows mock data. Update to real queries:
```
KPIs: {
  totalCompanies: SELECT COUNT(*) FROM companies,
  activeSubscriptions: SELECT COUNT(*) FROM subscriptions WHERE status='active',
  pendingReports: SELECT COUNT(*) FROM reports WHERE status='pending_review',
  approvedReports: SELECT COUNT(*) FROM reports WHERE status='approved',
  totalRevenue: SELECT SUM(amount) FROM invoices WHERE status='paid',
  trustScoreAverage: SELECT AVG(score) FROM trust_scores
}

RecentActivity: [
  { text, timestamp, icon }
]

TopCompanies: [
  { name, trustScore, reportCount }
]
```

**Implementation:**
Replace all hardcoded stats with real queries.

**Tables Used:** `companies`, `subscriptions`, `reports`, `invoices`, `trust_scores`, `audit_logs`

---

### 3.2 Admin Companies Management
**File:** `src/pages/AdminCompaniesManagement.jsx`
**Status:** ⚠️ PARTIAL

Features:
- ✓ List all companies
- ✓ Search/filter
- ✓ View details
- ❌ Approve/reject company
- ❌ Edit company info
- ❌ Merge duplicate companies
- ❌ View company's users
- ❌ View company's reports

**Business Logic:**
- Approval workflow (if required)
- Verification status
- Manual updates (sector, city, etc)
- Duplicate detection + merge

**Tables Used:** `companies`, `company_profiles`, `users`, `reports`

---

### 3.3 Admin Reports Review
**File:** `src/pages/AdminReports.jsx`
**Status:** ✅ IMPLEMENTED

Current flow:
```
List pending reports
  ↓ Click report
  ↓ Show details (anonymized)
  ↓ Approve or Reject
  ↓
If Approved:
  ├─ Status → 'approved'
  ├─ Compute trust_score
  ├─ Award 10 credits
  ├─ Notify reporter
  └─ Update company aggregates

If Rejected:
  ├─ Status → 'rejected'
  ├─ Save reject_reason
  ├─ Refund credits
  └─ Notify reporter
```

**Still needed:**
- ✓ Batch approval/rejection
- ✓ Filtering (by company, type, date range)
- ✓ Search by content
- ✓ Spam/fraud detection (flagging)

**Tables Used:** `reports`, `trust_scores`, `credits_ledger`, `notifications`

---

### 3.4 Admin Users
**File:** `src/pages/AdminUsers.jsx`
**Status:** ❌ INCOMPLETE

Display all users across all tenants:
```
List: [
  {
    email,
    company: { name, sector },
    role: owner | manager | viewer,
    status: active | pending | suspended,
    joinedAt,
    lastLogin,
    actions: [view, suspend, delete]
  }
]
```

**Filters:**
- Role
- Status
- Company
- Date range

**Actions:**
- ✓ Suspend user (prevent login)
- ✓ Delete user
- ✓ Verify user status
- ✓ Reset password

**Tables Used:** `users`, `tenants`, `auth.users`

---

### 3.5 Admin Subscriptions
**File:** `src/pages/AdminSubscriptions.jsx`
**Status:** ⚠️ PARTIAL

Display:
```
Active Subscriptions: [
  {
    company: name,
    plan: tier,
    renewalDate,
    monthlyRevenue,
    status: active | expiring_soon | expired,
    actions: [view, cancel, downgrade, upgrade]
  }
]

Metrics:
  ├─ MRR (Monthly Recurring Revenue)
  ├─ Churn Rate
  ├─ ARPU (Average Revenue Per User)
  └─ Lifetime Value
```

**Business Logic:**
- ✓ Show all active subscriptions
- ✓ Calculate MRR
- ✓ Identify expiring subscriptions (< 7 days)
- ✓ Send renewal reminders
- ✓ Handle failed payments

**Tables Used:** `subscriptions`, `plans`, `invoices`, `payments`

---

### 3.6 Admin Trust Score
**File:** `src/pages/AdminTrustScore.jsx`
**Status:** ❌ INCOMPLETE

Display:
```
Company Details: {
  name,
  trustScore: calc,
  tier: full | preliminary | none,
  calculation: {
    reportCount: 12,
    officialScore: 75,
    communityScore: 82,
    weighted: 0.30×75 + 0.70×82 = 80.1,
    formula: "30% official + 70% community"
  },
  reports: [
    { type, date, count, sentiment: positive|negative|neutral }
  ]
}
```

**Formula (from backend):**
```
Trust Score = 0.30 × official_score + 0.70 × community_score

Tiers:
├─ full: ≥ 5 approved reports, score ≥ 70
├─ preliminary: 2-4 approved reports, score < 70
└─ none: < 2 approved reports

Risk Bands:
├─ Low Risk: 70-100
├─ Medium Risk: 40-69
└─ High Risk: 0-39
```

**Tables Used:** `trust_scores`, `reports`, `companies`

---

## PHASE 4: CROSS-SYSTEM INTEGRATION

### Triggers & Automatic Updates

**When report is approved:**
```
1. UPDATE reports SET status='approved', approved_at=NOW()
2. CALL compute_trust_score(target_company_id)
3. INSERT INTO credits_ledger (tenant_id, report_id, +10)
4. INSERT INTO notifications (tenant_id, 'report_approved')
5. INSERT INTO audit_logs (action, actor, resource)
```

**When company is created:**
```
1. INSERT INTO companies (name, sector, city)
2. CREATE trust_score entry (initially empty)
3. Appear in AdminDashboard
4. Update KPIs
```

**When user is invited:**
```
1. INSERT INTO pending_invites (email, role)
2. Send email notification
3. When user registers with that email:
   - Auto-assign role
   - Auto-assign tenant
4. Appear in AdminUsers
```

---

## PHASE 5: VALIDATION & RULES

### Business Rules to Enforce

| Rule | Table | Condition | Action |
|------|-------|-----------|--------|
| BR-01 | subscriptions | free plan | max 5 reports/month |
| BR-02 | subscriptions | pro plan | unlimited reports |
| BR-03 | reports | duplicate | reject if same reporter + company + 90 days |
| BR-04 | credits | balance < 1 | cannot submit report |
| BR-05 | subscriptions | expiry date | send renewal reminder at -7 days |
| BR-06 | users | role=viewer | cannot submit reports |
| BR-07 | reports | content length | min 20 characters |
| BR-08 | trust_scores | calc | run after each approved report |
| BR-09 | audit_logs | all actions | log every user action |
| BR-10 | notifications | approval | notify reporter when report approved |

---

## PHASE 6: ERROR HANDLING & EDGE CASES

### Scenarios to Handle

1. **Company doesn't exist**
   - Search: return empty results
   - Report: auto-create company if valid

2. **Duplicate company**
   - Check: CR number, name, tax ID
   - Action: merge or reuse existing

3. **Duplicate report**
   - BR-05: reject if same reporter + company within 90 days
   - Action: show error "Already reported this company recently"

4. **Insufficient credits**
   - Check: credits_ledger balance < 1
   - Action: disable submit button
   - Message: "Earn credits by having reports approved"

5. **Subscription expired**
   - Check: subscriptions.expires_at < NOW()
   - Action: downgrade to free plan
   - Message: "Subscription expired. Downgrade to free plan"

6. **User role mismatch**
   - Check: role in users table vs permissions
   - Action: deny action with permission error
   - Message: "Only owners can invite users"

---

## Implementation Checklist

### Phase 1: Core Registration & Dashboard
- [ ] CompanyRegister complete flow
- [ ] CompanyDashboard real data
- [ ] AdminDashboard real stats

### Phase 2: Company Portal Operations
- [ ] AddReport with business logic
- [ ] MyReports with filtering
- [ ] Watchlist functionality
- [ ] CompanyUsers with invitations
- [ ] Subscription management

### Phase 3: Admin Operations
- [ ] AdminReports workflow
- [ ] AdminCompanies management
- [ ] AdminUsers verification
- [ ] AdminSubscriptions tracking
- [ ] AdminTrustScore calculation

### Phase 4: Integration
- [ ] Cross-system triggers
- [ ] Automatic stat updates
- [ ] Notification system
- [ ] Audit logging

### Phase 5: Validation
- [ ] All business rules enforced
- [ ] Error handling complete
- [ ] Edge cases covered

### Phase 6: Testing
- [ ] End-to-end company flow
- [ ] End-to-end admin flow
- [ ] Cross-system sync
- [ ] Data integrity

---

**Status:** Planning Phase → Implementation Phase
**Next:** Start with Phase 1 — Company Registration & Dashboard
