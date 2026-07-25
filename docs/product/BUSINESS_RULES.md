# MARSAD - BUSINESS RULES DOCUMENTATION

## Index

### Public Pages (No Authentication Required)
- [Landing](#landing)
- [About](#about)
- [Pricing](#pricing)
- [Partners](#partners)
- [FAQ](#faq)
- [Contact](#contact)
- [Register](#register)
- [Login](#login)
- [AdminLogin](#adminlogin)
- [ForgotPassword](#forgotpassword)
- [NotFound](#notfound)
- [Unauthorized](#unauthorized)

### Company User Pages (Authentication + company_member/company_admin role)
- [CompanyDashboard](#companydashboard)
- [Search](#search)
- [AddCompany](#addcompany)
- [AddReport](#addreport)
- [MyReports](#myreports)
- [TrustReport](#trustreport)
- [Watchlist](#watchlist)
- [Compare](#compare)
- [CompanyUsers](#companyusers)
- [Subscription](#subscription)
- [Profile](#profile)
- [Notifications](#notifications)
- [BusinessRequests](#businessrequests)

### Admin Pages (Authentication + platform_admin role)
- [AdminDashboard](#admindashboard)
- [AdminReports](#adminreports)
- [AdminCompanies](#admincompanies)
- [AdminUsers](#adminusers)
- [AdminRequests](#adminrequests)
- [AdminPlans](#adminplans)
- [AdminSubscriptions](#adminsubscriptions)
- [AdminTenants](#admintenants)
- [AdminSettings](#adminsettings)
- [AdminLogs](#adminlogs)
- [AdminPayments](#adminpayments)
- [AdminBulkImport](#adminbulkimport)
- [AdminTrustScore](#admintrustscore)
- [AdminReportAnalytics](#adminreportanalytics)
- [AdminTenantAnalytics](#admintenantanalytics)
- [AdminSystemHealth](#adminsystemhealth)
- [AdminFraudDetection](#adminfrauddetection)
- [AdminIntegrations](#adminintegrations)
- [AdminCompanyVerification](#admincompanyverification)
- [AdminDataExport](#admindataexport)
- [AdminDisputes](#admindisputes)
- [AdminEmailTemplates](#adminemailtemplates)
- [AdminAdminUsers](#adminadminusers)
- [AdminBackup](#adminbackup)

---

## PUBLIC PAGES

### Landing
**Purpose:** Introduce Marsad platform, showcase features, call-to-action  
**Access:** Public (no auth required)  
**Visibility:** Always visible as entry point  
**Actions Allowed:**
- View feature overview
- View pricing link
- View testimonials
- Navigate to Register/Login
- Contact form link

**Actions Blocked:**
- None - full read access

**Database Tables:** None (static page)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

### About
**Purpose:** Company information, mission, values, team  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- View company information
- View mission/vision
- View team members
- Contact link

**Actions Blocked:**
- None - full read access

**Database Tables:** None (static page)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

### Pricing
**Purpose:** Display subscription plans and pricing tiers  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- View all plans
- View plan features
- View plan pricing
- View limitations per tier
- "Choose Plan" → redirects to Register/Login

**Actions Blocked:**
- Cannot select plan without account

**Database Tables:** plans (read-only)  
**Permissions Required:** None  
**Subscription Restrictions:** None (informational page)  
**Credits Restrictions:** None  
**Notifications:** None

---

### Partners
**Purpose:** Display partner companies and integrations  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- View partner list
- View partner logos
- View integration details

**Actions Blocked:**
- Cannot engage partnerships without account

**Database Tables:** None (static page)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

### FAQ
**Purpose:** Answer common questions  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- View FAQ items
- Expand/collapse answers
- Contact link

**Actions Blocked:**
- None - full read access

**Database Tables:** None (static page)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

### Contact
**Purpose:** Contact form for inquiries  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- Submit contact form
- Receive confirmation email

**Actions Blocked:**
- Cannot access without form completion

**Database Tables:** None (email sent to support)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Confirmation email to user

---

### Register
**Purpose:** Create new company account  
**Access:** Public (no auth required)  
**Visibility:** Public users → visible | Logged-in users → redirect to dashboard  
**Actions Allowed:**
- Create account with email/password
- Set company name
- Accept terms
- Submit registration

**Actions Blocked:**
- Cannot register duplicate email
- Cannot use weak passwords
- Cannot skip required fields

**Database Tables:** tenants (create), users (create), subscriptions (create - default free plan)  
**Permissions Required:** None  
**Subscription Restrictions:** Defaults to "Free" plan  
**Credits Restrictions:** None  
**Notifications:** Welcome email + confirmation email

---

### Login
**Purpose:** Authenticate company users  
**Access:** Public (no auth required)  
**Visibility:** Public users → visible | Logged-in users → redirect to dashboard  
**Actions Allowed:**
- Enter email/password
- "Remember me" checkbox
- Submit login
- Forgot password link

**Actions Blocked:**
- Cannot login with wrong credentials
- Cannot login unverified email

**Database Tables:** users (read), auth.users (Supabase)  
**Permissions Required:** None  
**Subscription Restrictions:** None (disabled accounts cannot login)  
**Credits Restrictions:** None  
**Notifications:** Login email confirmation

---

### AdminLogin
**Purpose:** Authenticate platform administrators  
**Access:** Public (no auth required)  
**Visibility:** Public users → visible | Admin users → redirect to admin dashboard  
**Actions Allowed:**
- Enter email/password
- Submit login
- Redirect to /login (company login)

**Actions Blocked:**
- Cannot login without platform_admin role
- Cannot login with regular user account

**Database Tables:** users (read), auth.users (Supabase)  
**Permissions Required:** None (validated on backend)  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Admin login email

---

### ForgotPassword
**Purpose:** Reset forgotten password  
**Access:** Public (no auth required)  
**Visibility:** Always visible  
**Actions Allowed:**
- Enter email
- Receive reset link
- Set new password
- Return to login

**Actions Blocked:**
- Cannot reset without account email
- Cannot reset non-existent accounts

**Database Tables:** auth.users (Supabase)  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Password reset email

---

### NotFound
**Purpose:** Display 404 error  
**Access:** Automatic when route not found  
**Visibility:** Triggered on invalid URLs  
**Actions Allowed:**
- View error message
- Return to home link
- Search link

**Actions Blocked:**
- None - display only

**Database Tables:** None  
**Permissions Required:** None  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

### Unauthorized
**Purpose:** Display 403 Forbidden error  
**Access:** Triggered when user lacks permissions  
**Visibility:** Shown when accessing restricted pages  
**Actions Allowed:**
- View error message
- Return to dashboard/home
- Contact support

**Actions Blocked:**
- Cannot access restricted page
- Cannot escalate permissions

**Database Tables:** None  
**Permissions Required:** None (error page)  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None

---

## COMPANY USER PAGES

### CompanyDashboard
**Purpose:** View company statistics, reports overview, recent activity  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login for company users  
**Actions Allowed:**
- View dashboard statistics
- View recent reports
- View pending reviews
- View current credits balance
- View alerts/notifications
- Quick actions to add report, search companies

**Actions Blocked:**
- Cannot access if subscription suspended
- Cannot view other companies' data
- Non-admin cannot modify settings

**Database Tables:** companies, reports, trust_scores, users, subscriptions, credits_ledger, notifications  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** Cannot access if status='suspended' or status='expired'  
**Credits Restrictions:** None (view only)  
**Notifications:** Real-time dashboard updates via polling/websocket

---

### Search
**Purpose:** Search for companies by name/CR number/sector  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login for company users  
**Actions Allowed:**
- Search by company name
- Filter by sector
- Filter by city
- Filter by status
- View search results
- Click to view TrustReport
- Add to watchlist
- Compare companies

**Actions Blocked:**
- Cannot export search results (free plan)
- Cannot access if subscription suspended

**Database Tables:** companies, trust_scores, watchlist_items, subscriptions  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** 
- Free plan: 20 searches/month
- Pro plan: unlimited searches  
**Credits Restrictions:** Viewing full report requires credits  
**Notifications:** Search history saved for suggestions

---

### AddCompany
**Purpose:** Add new company to database  
**Access:** Requires authentication + company_admin (editing) OR company_member (viewing)  
**Visibility:** After login for company users  
**Actions Allowed:**
- Search existing company (read)
- Add new company (admin only) - CR number, name, sector, city

**Actions Blocked:**
- Duplicate CR numbers
- Non-admin cannot add
- Cannot add without CR number

**Database Tables:** companies, company_profiles  
**Permissions Required:** company_admin (write), company_member (read)  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Company added notification to admins

---

### AddReport
**Purpose:** Submit payment delay/default report  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- Select target company
- Choose payment commitment (full/partial/late/default)
- Enter delay days
- Optional: upload documents
- Submit report

**Actions Blocked:**
- Cannot submit duplicate report (BR-05: 90-day restriction)
- Cannot submit without selecting company
- Cannot submit if subscription suspended
- Insufficient credits (1 credit per report)
- Cannot report own company

**Database Tables:** reports, report_documents, companies, credits_ledger, audit_logs  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** Cannot submit if status='suspended'  
**Credits Restrictions:** Requires 1 credit per report. Deducted on submission.  
**Notifications:** 
- Confirmation email to reporter
- Admin notification for review
- Notification when report approved

---

### MyReports
**Purpose:** View company's submitted reports  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- View own reports list
- View report details
- View report status (pending/approved/rejected)
- View submitted date
- Filter by status
- Sort by date
- Withdraw report (admin only) - if pending_review

**Actions Blocked:**
- Cannot view other companies' reports
- Cannot modify approved reports
- Cannot withdraw approved/rejected reports

**Database Tables:** reports, review_actions, companies, audit_logs  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** None (view own reports)  
**Credits Restrictions:** None (already deducted on submission)  
**Notifications:** Status change notifications

---

### TrustReport
**Purpose:** View detailed trust score for company  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login, from search or watchlist  
**Actions Allowed:**
- View trust score (0-100)
- View risk band (low/medium/high)
- View tier (none/preliminary/full)
- View approved reports count
- View score breakdown
- View company information
- Add to watchlist
- Compare with another company

**Actions Blocked:**
- Cannot submit report on this page
- Cannot view historical scores (paid feature)
- Cannot download report if insufficient credits

**Database Tables:** companies, trust_scores, reports, watchlist_items, subscriptions  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** Historical data restricted by plan tier  
**Credits Restrictions:** 
- Free tier: cannot see full breakdown
- Premium: can see detailed analytics  
**Notifications:** Score change notifications if on watchlist

---

### Watchlist
**Purpose:** Track companies for monitoring  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- View watchlisted companies
- Add company from search
- Remove from watchlist
- Edit watchlist name
- Sort/filter by score
- View score history
- Get alerts on score changes

**Actions Blocked:**
- Free plan: max 1 watchlist
- Cannot view other companies' watchlists

**Database Tables:** watchlist_items, trust_scores, companies, notifications  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** Free plan: 1 watchlist. Pro: unlimited  
**Credits Restrictions:** None (view only)  
**Notifications:** Score change alerts for watched companies

---

### Compare
**Purpose:** Compare two or more companies side-by-side  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- Select companies to compare
- View side-by-side metrics
- View score differences
- View report counts
- Download comparison (premium)

**Actions Blocked:**
- Cannot compare > 3 companies (free plan)
- Cannot download if insufficient credits
- Cannot compare own company with others

**Database Tables:** companies, trust_scores, reports  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** Free: 2 companies. Pro: unlimited  
**Credits Restrictions:** Download requires 5 credits  
**Notifications:** None

---

### CompanyUsers
**Purpose:** Manage team members within company  
**Access:** Requires authentication + company_admin  
**Visibility:** After login for company admins  
**Actions Allowed:**
- View current users
- Invite new user (email)
- Revoke access
- Change user role (member/admin)

**Actions Blocked:**
- Non-admin cannot manage users
- Cannot remove last admin
- Cannot invite to other companies

**Database Tables:** users, pending_invites, tenants, audit_logs  
**Permissions Required:** company_admin only  
**Subscription Restrictions:** Max users by plan (Free: 3, Pro: 10)  
**Credits Restrictions:** None  
**Notifications:** Invite email to new user + acceptance notification

---

### Subscription
**Purpose:** Manage subscription and billing  
**Access:** Requires authentication + company_admin  
**Visibility:** After login for company admins  
**Actions Allowed:**
- View current plan
- View billing cycle
- View usage metrics
- Upgrade/downgrade plan
- View invoices
- Download invoice PDF
- Update payment method

**Actions Blocked:**
- Non-admin cannot manage subscription
- Cannot downgrade with pending invoices
- Cannot change billing cycle mid-cycle

**Database Tables:** subscriptions, invoices, plans, audit_logs  
**Permissions Required:** company_admin only  
**Subscription Restrictions:** None (this page manages subscriptions)  
**Credits Restrictions:** None  
**Notifications:** Invoice email + plan change confirmation

---

### Profile
**Purpose:** Update personal user profile  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- View personal info
- Update name
- Update email
- Update phone (optional)
- Change password
- Enable 2FA
- View login history

**Actions Blocked:**
- Cannot change company
- Cannot change role (admin-only)
- Cannot duplicate email

**Database Tables:** users, audit_logs  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Profile change confirmation email

---

### Notifications
**Purpose:** View and manage notifications  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- View notification list
- Mark as read
- Delete notification
- Filter by type
- Set notification preferences
- View notification history (30 days)

**Actions Blocked:**
- Cannot delete permanently (soft delete)
- Cannot mute critical alerts

**Database Tables:** notifications, audit_logs  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Notifications displayed in real-time

---

### BusinessRequests
**Purpose:** Send/receive business collaboration requests  
**Access:** Requires authentication + (company_member OR company_admin)  
**Visibility:** After login  
**Actions Allowed:**
- View received requests
- View sent requests
- Send new request to another company
- Accept request
- Decline request
- Message within request
- Set request expiry

**Actions Blocked:**
- Cannot send to self
- Cannot send duplicate within 30 days
- Request expires after 30 days (default)
- Cannot accept/decline if company suspended

**Database Tables:** business_requests, notifications, audit_logs  
**Permissions Required:** company_member or company_admin  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Request received email + response notification

---

## ADMIN PAGES

### AdminDashboard
**Purpose:** Platform overview and statistics  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View total users count
- View total companies count
- View total reports submitted
- View pending reviews count
- View system health metrics
- View recent activity log
- View report approval rate
- Quick access to admin functions

**Actions Blocked:**
- Cannot modify dashboard (read-only)
- Non-admin cannot access

**Database Tables:** users, tenants, companies, reports, subscriptions, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None (admin function)  
**Credits Restrictions:** None  
**Notifications:** Real-time dashboard metrics

---

### AdminReports
**Purpose:** Review and approve/reject submitted reports  
**Access:** Requires authentication + (platform_admin OR reviewer)  
**Visibility:** After admin login  
**Actions Allowed:**
- View all pending reports
- View report details (anonymized reporter)
- View report evidence/documents
- Approve report
- Reject report with reason
- Request more information
- Assign reviewer
- Filter by status/company/date
- Bulk approve/reject (admin only)

**Actions Blocked:**
- Cannot view reporter identity (anonymized)
- Cannot edit report content
- Cannot approve own reports
- Reviewer cannot approve (assign to other reviewer)

**Database Tables:** reports, report_documents, companies, users, review_actions, credits_ledger, audit_logs  
**Permissions Required:** platform_admin or reviewer  
**Subscription Restrictions:** None  
**Credits Restrictions:** Approved reports add credits to reporter (10 credits default)  
**Notifications:** Approval email to reporter + trust score update notification

---

### AdminCompanies
**Purpose:** Manage company database  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all companies
- Add new company
- Edit company information
- Activate/deactivate company
- View company reports
- View trust score
- Delete company (if no reports)
- Merge duplicate companies
- Verify CR number with GAZT

**Actions Blocked:**
- Cannot delete company with reports
- Cannot edit company source (official/community)
- Regular admins cannot modify

**Database Tables:** companies, trust_scores, reports, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Company modification audit log

---

### AdminUsers
**Purpose:** Manage platform users  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all users
- View user details
- Suspend/activate user
- Change user role
- Reset password
- Audit user activity
- Export user list
- Search by email/name/company

**Actions Blocked:**
- Cannot delete users (soft delete only)
- Cannot change own role
- Cannot suspend last admin

**Database Tables:** users, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** User action notifications

---

### AdminRequests
**Purpose:** Handle business request disputes/issues  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all business requests
- View request details
- Mediate disputes
- Cancel request if necessary
- View message history
- Generate report

**Actions Blocked:**
- Cannot modify user's request
- Cannot force accept/decline

**Database Tables:** business_requests, notifications, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Dispute resolution notifications

---

### AdminPlans
**Purpose:** Manage subscription plans  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all plans
- Create new plan
- Edit plan (price, limits, features)
- Activate/deactivate plan
- View plan usage

**Actions Blocked:**
- Cannot delete active plans
- Cannot modify plan id
- Changes apply to new subscribers only

**Database Tables:** plans, subscriptions, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Plan change notifications to admins

---

### AdminSubscriptions
**Purpose:** Manage company subscriptions  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all subscriptions
- Upgrade/downgrade subscription
- Cancel subscription
- Manual billing adjustments
- View payment history
- Refund invoice
- View subscription analytics

**Actions Blocked:**
- Cannot create free credits manually (except refunds)
- Cannot override payment requirements

**Database Tables:** subscriptions, invoices, plans, credits_ledger, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** Manual adjustments logged  
**Notifications:** Subscription change email to company admin

---

### AdminTenants
**Purpose:** Manage company organizations  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all tenants
- Create test tenant
- Edit tenant info
- Suspend/activate tenant
- View tenant users
- View tenant subscriptions
- Export tenant data

**Actions Blocked:**
- Cannot delete active tenants
- Cannot merge tenants

**Database Tables:** tenants, users, subscriptions, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Tenant action audit log

---

### AdminSettings
**Purpose:** Platform-wide settings  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- Update platform settings
- Configure email templates
- Configure SMS gateway
- Set feature flags
- Configure GAZT integration
- Update payment gateway settings
- Manage API keys

**Actions Blocked:**
- Cannot reset settings without confirmation
- Cannot disable security features

**Database Tables:** system_settings, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Settings change audit log

---

### AdminLogs
**Purpose:** Audit and compliance logs  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all audit logs
- Filter by action/user/entity
- Filter by date range
- Export logs
- Archive logs
- Search logs

**Actions Blocked:**
- Cannot modify logs
- Cannot delete logs (immutable)

**Database Tables:** audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None (view-only)

---

### AdminPayments
**Purpose:** Manage payment processing  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View payment history
- View failed payments
- Retry failed payments
- Process refunds
- View payment methods
- Configure payment gateway
- View payment analytics

**Actions Blocked:**
- Cannot manually bypass payment
- Cannot duplicate payment

**Database Tables:** invoices, subscriptions, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Payment notification emails

---

### AdminBulkImport
**Purpose:** Bulk import companies/users from CSV  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- Upload CSV file
- Preview import
- Validate data
- Perform bulk import
- Download import report
- Undo failed imports

**Actions Blocked:**
- Cannot import invalid data
- Cannot overwrite existing records
- Cannot import without validation

**Database Tables:** companies, users, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Import completion email

---

### AdminTrustScore
**Purpose:** Configure and manage trust score algorithm  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View current algorithm
- Adjust weighting (official/community)
- Adjust thresholds (tiers)
- View score distribution
- Recalculate scores
- Test algorithm
- View score history

**Actions Blocked:**
- Cannot change algorithm without approval
- Cannot reset scores

**Database Tables:** trust_scores, companies, reports, system_settings  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Algorithm change notifications

---

### AdminReportAnalytics
**Purpose:** Analytics on report submissions  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View report volume trends
- View report by sector/city
- View approval rates
- View average review time
- View reporter distribution
- Download report (PDF/CSV)
- Set custom date range

**Actions Blocked:**
- Cannot modify analytics
- Cannot export raw data

**Database Tables:** reports, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None (view-only)

---

### AdminTenantAnalytics
**Purpose:** Analytics per tenant/company  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View per-tenant metrics
- View usage trends
- View revenue metrics
- View churn analysis
- Download tenant report
- Set custom date range

**Actions Blocked:**
- Cannot modify analytics
- Cannot see financial data detail

**Database Tables:** subscriptions, reports, credits_ledger  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** None (view-only)

---

### AdminSystemHealth
**Purpose:** Monitor system health and performance  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View CPU/Memory usage
- View database query performance
- View API response times
- View error rates
- View system alerts
- View uptime status

**Actions Blocked:**
- Cannot modify system settings from this page
- Cannot restart services

**Database Tables:** audit_logs (for metrics)  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Critical alerts

---

### AdminFraudDetection
**Purpose:** Monitor for fraudulent reports  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View flagged reports
- View user behavior patterns
- View duplicate reports
- View rate-limiting violations
- Mark report as fraud
- Block user if necessary
- View fraud analytics

**Actions Blocked:**
- Cannot approve fraudulent reports
- Cannot delete reports (only mark fraud)

**Database Tables:** reports, users, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** Refund credits if report marked fraud  
**Notifications:** Fraud alert emails

---

### AdminIntegrations
**Purpose:** Manage third-party integrations  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View active integrations
- Configure GAZT API
- Configure email/SMS provider
- Configure payment gateway
- Generate API keys
- View integration logs

**Actions Blocked:**
- Cannot use integration without API key
- Cannot activate unverified integration

**Database Tables:** system_settings, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Integration status notifications

---

### AdminCompanyVerification
**Purpose:** Verify company CR numbers and legitimacy  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View unverified companies
- Verify against GAZT
- Mark as verified/unverified
- View verification history
- Bulk verify

**Actions Blocked:**
- Cannot approve reports from unverified companies (depends on config)
- Cannot change verification manually

**Database Tables:** companies, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Verification result emails

---

### AdminDataExport
**Purpose:** Export platform data  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- Export companies
- Export reports
- Export users
- Export subscriptions
- Schedule automated exports
- Download export files
- Delete old exports

**Actions Blocked:**
- Cannot export with sensitive data exposed
- Cannot export without anonymization

**Database Tables:** All (read-only for export)  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Export completion email

---

### AdminDisputes
**Purpose:** Handle report/data disputes  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View open disputes
- View dispute details
- Request more information
- Mediate dispute
- Resolve dispute
- Award decision
- Document resolution

**Actions Blocked:**
- Cannot delete disputes
- Dispute cannot be re-opened once closed

**Database Tables:** reports, notifications, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** Refund if dispute in favor of reporter  
**Notifications:** Dispute resolution emails to involved parties

---

### AdminEmailTemplates
**Purpose:** Manage email templates  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View email templates
- Edit template content
- Preview template
- Test send template
- Reset to default
- Create custom template

**Actions Blocked:**
- Cannot delete core templates
- Cannot use invalid variables

**Database Tables:** system_settings, audit_logs  
**Permissions Required:** platform_admin only  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Template change audit log

---

### AdminAdminUsers
**Purpose:** Manage platform administrators  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View all admin users
- Create admin user
- Edit admin permissions
- Disable admin (not delete)
- View admin activity
- Reset admin password

**Actions Blocked:**
- Cannot delete last admin
- Cannot demote self
- Cannot elevate non-employee

**Database Tables:** users, audit_logs  
**Permissions Required:** platform_admin only (super-admin can manage all)  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Admin management audit log

---

### AdminBackup
**Purpose:** Database backup management  
**Access:** Requires authentication + platform_admin  
**Visibility:** After admin login  
**Actions Allowed:**
- View backup history
- Trigger manual backup
- Download backup
- Schedule automated backups
- Test backup restore
- Restore from backup

**Actions Blocked:**
- Cannot skip automated backups
- Cannot delete recent backups

**Database Tables:** All (backup operations)  
**Permissions Required:** platform_admin only (super-admin)  
**Subscription Restrictions:** None  
**Credits Restrictions:** None  
**Notifications:** Backup completion notifications

---

## SUMMARY

**Total Pages:** 54  
**Public Pages:** 12  
**Company User Pages:** 13  
**Admin Pages:** 29  

### Next Steps:
1. Implement business logic checks in each page component
2. Add permission guards in ProtectedRoute component
3. Implement credits/subscription validation before sensitive actions
4. Add audit logging for all admin actions
5. Create API endpoints for business logic validation
