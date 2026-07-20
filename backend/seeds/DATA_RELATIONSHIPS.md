# Marsad Seeded Data Relationships

Complete visualization of seeded data structure, relationships, and workflows.

## 🗂️ Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SUBSCRIPTION HIERARCHY                           │
└─────────────────────────────────────────────────────────────────────────────┘

    PLAN (4 records)
      │
      ├─ مجاني (Free)        ─────┐
      ├─ أساسي (Basic)       ─────┤
      ├─ احترافي (Pro)       ─────┤
      └─ مؤسسات (Enterprise) ─────┤
                                   │
                              SUBSCRIPTION (6)
                                   │
    TENANT (6 records)        ────┴────────┐
      │                              │
      ├─ شركة الخليج      (Pro)     INVOICE (15)
      ├─ الشركة العربية   (Basic)
      ├─ شركة الرؤية      (Enterprise)
      ├─ النخبة للخدمات   (Basic)
      ├─ صناعات الحديد    (Pro)
      └─ تقنية الرؤية     (Basic)


┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER MANAGEMENT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    USERS (20+ records)
      │
      ├─ Platform Users (No TenantID)
      │  ├─ admin@marsad.sa          (platform_admin)
      │  ├─ reviewer@marsad.sa       (reviewer)
      │  └─ support@marsad.sa        (platform_admin)
      │
      └─ Tenant Users (Linked to Tenant)
         ├─ Tenant 1 (3 users)
         │  ├─ Admin
         │  └─ 2x Members
         ├─ Tenant 2 (2 users)
         │  ├─ Admin
         │  └─ 1x Member
         └─ ... (more tenants)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        REPORT WORKFLOW                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    TENANT (Reporter)
      │
      └─ REPORT (12+ records)
         │
         ├─ Status Statuses:
         │  ├─ draft              (not submitted)
         │  ├─ pending_review     (waiting for reviewer)
         │  ├─ approved           (✓ reviewed and OK)
         │  ├─ rejected           (✗ failed review)
         │  ├─ request_info       (need more info)
         │  └─ cancelled          (withdrawn)
         │
         ├─ Target: COMPANY
         │
         ├─ REVIEW_ACTION (created for non-draft)
         │  └─ Reviewer (platform_admin/reviewer)
         │     ├─ action: approve/reject/request_info
         │     └─ reason: optional explanation
         │
         └─ REPORT_DOCUMENT (supporting files)
            └─ S3 reference + metadata


┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPANY ASSESSMENT                                   │
└─────────────────────────────────────────────────────────────────────────────┘

    COMPANY (10 records)
      │
      ├─ Basic Info
      │  ├─ name (Arabic)
      │  ├─ crNumber (unique, 10-digit)
      │  ├─ sector
      │  └─ city
      │
      ├─ Status
      │  ├─ crStatus (active/suspended/expired)
      │  ├─ approved (boolean - visible in platform)
      │  └─ source (official/community)
      │
      ├─ TRUST_SCORE (1:1 relation)
      │  ├─ score (0-100)
      │  ├─ riskBand (low/medium/high)
      │  ├─ tier (full/preliminary/none)
      │  ├─ approvedReports (count)
      │  └─ breakdown (JSON calculation details)
      │
      ├─ REPORT[] (incoming reports from tenants)
      │  └─ Contains assessment data
      │
      ├─ WATCHLIST_ITEM[] (monitored by tenants)
      │  └─ Multiple tenants can watch this company
      │
      └─ COMPANY_PROFILE (optional 1:1)
         └─ Tenant (Company owner) → Company (Claiming tenure)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        MONITORING & ALERTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    WATCHLIST_ITEM (15+ records)
      │
      ├─ TENANT → Company relations
      │
      ├─ Each has:
      │  ├─ listName (e.g., "قائمة المراقبة الرئيسية")
      │  └─ createdAt timestamp
      │
      └─ Triggers NOTIFICATION
         ├─ report_filed
         ├─ score_changed
         └─ other_alerts


┌─────────────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATIONS & ALERTS                               │
└─────────────────────────────────────────────────────────────────────────────┘

    NOTIFICATION (10+ records)
      │
      ├─ Types:
      │  ├─ report_approved
      │  ├─ report_rejected
      │  ├─ score_changed
      │  ├─ request_received
      │  ├─ watchlist_alert
      │  └─ subscription_expiring
      │
      ├─ Recipients: USER
      │
      ├─ Payload (JSON):
      │  ├─ companyId
      │  ├─ oldScore/newScore
      │  └─ timestamp
      │
      └─ Status:
         └─ readAt (null = unread)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        B2B COLLABORATION                                    │
└─────────────────────────────────────────────────────────────────────────────┘

    BUSINESS_REQUEST (5 records)
      │
      ├─ fromTenant → toTenant
      │
      ├─ Fields:
      │  ├─ subject (e.g., "طلب تبادل معلومات")
      │  ├─ body (request message)
      │  └─ expiresAt (automatic expiration)
      │
      └─ Status:
         ├─ pending    (awaiting response)
         ├─ accepted   (✓ approved)
         ├─ declined   (✗ rejected)
         └─ expired    (time limit reached)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUDIT & COMPLIANCE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

    AUDIT_LOG (20+ records, append-only)
      │
      ├─ Actor Information:
      │  ├─ actorId (user or system)
      │  └─ actorRole (platform_admin, reviewer, etc.)
      │
      ├─ Action Details:
      │  ├─ action (report:create, user:login, etc.)
      │  ├─ entity (report, user, setting, etc.)
      │  └─ entityId (specific record affected)
      │
      └─ Metadata:
         ├─ ipAddress
         ├─ userAgent
         ├─ timestamp
         └─ Custom meta (JSON)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        QUOTA TRACKING                                       │
└─────────────────────────────────────────────────────────────────────────────┘

    VIEW_QUOTA_USAGE
      │
      ├─ TENANT → Monthly quota
      │
      ├─ Fields:
      │  ├─ period (YYYY-MM)
      │  └─ viewsCount (increments per view)
      │
      └─ Compared against PLAN limits
         └─ Blocks access if exceeded
```

## 📊 Data Flow Examples

### Example 1: Complete Report Workflow

```
Step 1: Company A files report against Company B
  TENANT[A].id → REPORT.reporterTenantId
  COMPANY[B].id → REPORT.targetCompanyId
  status = "draft"

Step 2: User submits for review
  REPORT.status = "pending_review"
  REPORT.submittedAt = now()

Step 3: Reviewer examines
  REVIEW_ACTION created
  reviewer → REVIEW_ACTION.reviewerId
  action = "approve" or "reject"

Step 4: Report approved
  REPORT.status = "approved"
  REPORT.approvedAt = now()
  COMPANY[B].TRUST_SCORE updated
  NOTIFICATION sent to TENANT[A] users

Step 5: Audit trail recorded
  AUDIT_LOG entry: "report:approve"
  references REPORT.id
  actor = reviewer
```

### Example 2: Trust Score Calculation

```
Given: COMPANY has 5 approved reports

Trust Score = 40 + (5 × 4) = 60
Risk Band = "medium"
Tier = "preliminary"

Breakdown JSON:
{
  "official": 65,
  "community": 55,
  "formal_data_weight": 0.3,
  "payment_history_weight": 0.4,
  "legal_status_weight": 0.3,
  "approval_count": 5,
  "calculated_at": "2024-07-18T12:00:00Z"
}
```

### Example 3: Multi-Tenant Monitoring

```
Scenario: Company monitors 3 target companies

TENANT[A]
  └─ WATCHLIST_ITEM[1] → COMPANY[X]
  └─ WATCHLIST_ITEM[2] → COMPANY[Y]
  └─ WATCHLIST_ITEM[3] → COMPANY[Z]

When COMPANY[X] trust score changes:
  1. TRUST_SCORE updated
  2. NOTIFICATION created for all users in TENANT[A]
  3. AUDIT_LOG created (score_changed action)

Users see notifications:
  "نقاط الثقة لشركة X تحسنت من 60 إلى 75"
```

### Example 4: B2B Request Workflow

```
TENANT[A] requests partnership with TENANT[B]

Step 1: Request created
  fromTenantId = A
  toTenantId = B
  status = "pending"
  expiresAt = now() + 30 days

Step 2: TENANT[B] users see notification
  NOTIFICATION type = "request_received"

Step 3: TENANT[B] accepts
  status = "accepted"
  AUDIT_LOG: "request:accept"

Step 4: Both can exchange information
  Share approved reports
  View each other's trust scores
```

## 🔄 Relationship Cardinality

| Relationship | Cardinality | Notes |
|---|---|---|
| Plan → Subscription | 1:N | Multiple tenants per plan |
| Subscription → Invoices | 1:N | Monthly invoices per subscription |
| Tenant → Users | 1:N | Multiple employees per tenant |
| Tenant → Reports | 1:N | Multiple reports filed |
| Company → Reports | 1:N | Multiple reports against company |
| Company → TrustScore | 1:1 | One score per company |
| Report → ReviewAction | 1:N | Multiple reviews per report |
| Report → Documents | 1:N | Supporting files |
| Company → WatchlistItems | 1:N | Monitored by multiple tenants |
| Tenant → WatchlistItems | 1:N | Can monitor multiple companies |
| User → Notifications | 1:N | Multiple notifications per user |
| Tenant → Subscriptions | 1:1 | One active subscription per tenant |
| Tenant ↔ Tenant → BusinessRequest | 1:N | Multiple requests between companies |

## 📈 Query Examples

### Get Company with Full Assessment

```sql
SELECT c.*,
       ts.score,
       ts.risk_band,
       ts.approved_reports,
       COUNT(r.id) as total_reports,
       COUNT(w.id) as watched_by_tenants
FROM companies c
LEFT JOIN trust_scores ts ON c.id = ts.company_id
LEFT JOIN reports r ON c.id = r.target_company_id
LEFT JOIN watchlist_items w ON c.id = w.company_id
WHERE c.id = $1
GROUP BY c.id, ts.id;
```

### Get Tenant Dashboard Summary

```sql
SELECT 
  t.name,
  COUNT(DISTINCT u.id) as team_members,
  COUNT(DISTINCT r.id) as reports_filed,
  COUNT(DISTINCT w.id) as watchlist_items,
  s.status as subscription_status,
  p.name as plan_name,
  (p.limits->>'views')::int as view_limit,
  COALESCE(vqu.views_count, 0) as views_used
FROM tenants t
LEFT JOIN users u ON t.id = u.tenant_id
LEFT JOIN reports r ON t.id = r.reporter_tenant_id
LEFT JOIN watchlist_items w ON t.id = w.tenant_id
LEFT JOIN subscriptions s ON t.id = s.tenant_id
LEFT JOIN plans p ON s.plan_id = p.id
LEFT JOIN view_quota_usage vqu ON t.id = vqu.tenant_id 
  AND vqu.period = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
WHERE t.id = $1
GROUP BY t.id, s.id, p.id, vqu.id;
```

### Get Active Reports for Review

```sql
SELECT 
  r.id,
  r.status,
  rt.name as reporter,
  c.name as target_company,
  r.deal_amount_range,
  r.payment_commitment,
  r.submitted_at,
  COUNT(rd.id) as document_count
FROM reports r
JOIN tenants rt ON r.reporter_tenant_id = rt.id
JOIN companies c ON r.target_company_id = c.id
LEFT JOIN report_documents rd ON r.id = rd.report_id
WHERE r.status IN ('pending_review', 'request_info')
GROUP BY r.id, rt.id, c.id
ORDER BY r.submitted_at ASC;
```

## 🎯 Using This Documentation

- **For API Development**: Reference entity relationships
- **For Testing**: Copy data flow examples
- **For Debugging**: Follow audit logs through workflows
- **For Performance**: Understand cardinality for query optimization
- **For User Education**: Visualize platform workflows

---

**Document Version**: 1.0  
**Last Updated**: 2024-07-18  
**Status**: Production-Ready
