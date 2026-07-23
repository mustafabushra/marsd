# MARSAD QA TEST CASES — Registration & Onboarding Flow

## Test Environment Setup
- Database: Supabase (ccvmggffzdyomymvonvf)
- Auth: Clerk
- Frontend: React + Vite

---

## CASE A: NEW COMPANY REGISTRATION

### Test Case A1: New company with all fields
**Steps:**
1. Sign up with Clerk (new user)
2. Redirected to `/company-onboarding`
3. Fill Step 1:
   - Company Name: "شركة النجاح الحديثة"
   - CR Number: "1234567890" (unique, not in database)
   - Sector: "البناء والمقاولات"
   - City: "الرياض"
4. Click "التالي" → Goes to Step 2
5. Upload CR document (PDF or image)
6. Click "إرسال"

**Expected Result:**
- ✓ New company created in `companies` table with status='pending'
- ✓ Tenant created in `tenants` table linked to company_id
- ✓ User record created in `users` table with company_id and tenant_id
- ✓ Registration request created in `registration_requests` table
- ✓ Notification sent to admin
- ✓ Redirected to `/registration-pending`
- ✓ Shows "تم استقبال طلبك"

### Test Case A2: Duplicate CR Number (should find existing)
**Steps:**
1. Existing company: "الرياض العقارية" (CR: 12336544566)
2. New user signs up
3. Go to onboarding
4. Fill Step 1 with same CR: "12336544566"
5. Click "التالي"

**Expected Result:**
- ✓ Smart detection finds company
- ✓ Goes to Step 2
- ✓ Displays: "ℹ️ وجدنا شركتك"
- ✓ Proceeds to CASE B flow (Claim)

### Test Case A3: Missing required fields
**Steps:**
1. Go to onboarding
2. Leave company name empty
3. Click "التالي"

**Expected Result:**
- ✓ Error: "❌ اسم الشركة مطلوب"
- ✓ Form not submitted

---

## CASE B: EXISTING COMPANY CLAIM

### Test Case B1: User claims existing company (new Clerk user)
**Steps:**
1. Company "الرياض العقارية" exists with CR: 12336544566
2. New Clerk user signs up
3. Go to onboarding
4. Fill with existing company CR number
5. Step 2: Upload document
6. Submit

**Expected Result:**
- ✓ Smart detection finds company
- ✓ Shows company name in Step 2
- ✓ Claim request created in `claim_requests` table
- ✓ User record created (NOT linked to company_id yet)
- ✓ Redirected to `/company-claim-pending`
- ✓ Shows "طلب الملكية قيد المراجعة"

### Test Case B2: Admin approves claim
**Steps:**
1. User submitted claim from Test Case B1
2. Go to `/admin/claim-requests`
3. Select pending claim
4. Click "موافقة"

**Expected Result:**
- ✓ Claim request status → 'approved'
- ✓ Tenant created (if not exists)
- ✓ User.company_id linked to company
- ✓ Notification sent to user
- ✓ User can now login to dashboard

### Test Case B3: Admin rejects claim with reason
**Steps:**
1. User submitted claim
2. Go to `/admin/claim-requests`
3. Select claim
4. Enter rejection reason: "بيانات غير صحيحة"
5. Click "رفض"

**Expected Result:**
- ✓ Claim request status → 'rejected'
- ✓ rejection_reason stored
- ✓ Notification sent to user with reason
- ✓ User cannot access dashboard

---

## CASE C: EXISTING OWNER RE-LOGIN

### Test Case C1: Approved company owner login
**Steps:**
1. User owns approved company
2. Sign out
3. Sign in again with same Clerk account

**Expected Result:**
- ✓ Routed to `/dashboard` (NOT `/company-onboarding`)
- ✓ Company status checked from database
- ✓ CompanyStatusRouter shows dashboard

### Test Case C2: Pending company owner login
**Steps:**
1. User owns pending company (registration submitted)
2. Sign out
3. Sign in again

**Expected Result:**
- ✓ Routed to `/registration-pending`
- ✓ NOT `/company-onboarding`
- ✓ Displays: "تم استقبال طلبك"

### Test Case C3: Rejected company owner login
**Steps:**
1. User's registration was rejected
2. Sign in

**Expected Result:**
- ✓ Routed to `/account-rejected`
- ✓ Shows: "تم رفض التسجيل"

### Test Case C4: Suspended company owner login
**Steps:**
1. Company status = 'suspended'
2. User signs in

**Expected Result:**
- ✓ Routed to `/account-suspended`
- ✓ Shows: "تم تعليق الحساب"

---

## SMART COMPANY DETECTION

### Test Case D1: Search by CR Number (Primary)
**Expected:** CR match has priority over all others

### Test Case D2: Search by Unified Number
**Expected:** If no CR match, check unified_number

### Test Case D3: Search by License Number
**Expected:** If no CR/Unified, check license_number

### Test Case D4: Search by Official Email
**Expected:** If no CR/Unified/License, check email

### Test Case D5: Search by Company Name (Fuzzy)
**Expected:** Disabled by default (prevent false positives)

---

## DATABASE INTEGRITY

### Test Case E1: No Duplicate Companies
**Steps:**
1. Search by CR: "1234567890"
2. Count companies with same CR_NUMBER

**Expected Result:**
- ✓ Exactly 1 company record
- ✓ No duplicates

### Test Case E2: One Tenant per Company
**Steps:**
1. Find company
2. Count tenants with company_id

**Expected Result:**
- ✓ Tenant.company_id references exactly 1 company
- ✓ Foreign key integrity maintained

### Test Case E3: User linked to Company
**Steps:**
1. User logs in
2. Check users.company_id

**Expected Result:**
- ✓ User.company_id → Company.id
- ✓ User.tenant_id → Tenant.id
- ✓ Tenant.company_id → Company.id (chain integrity)

---

## NOTIFICATION SYSTEM

### Test Case F1: Admin notified on new registration
**Expected:**
- ✓ Notification created with type='company_registration_submitted'
- ✓ Admin can see in notifications

### Test Case F2: Admin notified on new claim
**Expected:**
- ✓ Notification with type='claim_request_submitted'
- ✓ Shows company name and email

### Test Case F3: User notified on approval
**Expected:**
- ✓ Notification sent to user
- ✓ Message: "✅ تمت الموافقة..."

### Test Case F4: User notified on rejection
**Expected:**
- ✓ Notification with rejection reason
- ✓ Message includes admin's reason

---

## ROUTING LOGIC (DATABASE-DRIVEN)

### Test Case G1: Routing depends on companies.status, NOT session
**Steps:**
1. User session shows company approved
2. Manually change database companies.status → 'pending'
3. Refresh browser

**Expected Result:**
- ✓ User routed to `/account-pending`
- ✓ Not `/dashboard`
- ✓ Database truth overrides session

### Test Case G2: Never route to onboarding if company exists
**Steps:**
1. Company exists with user linked
2. Manually clear session/cookies
3. Sign in again

**Expected Result:**
- ✓ Route to `/registration-pending` or `/dashboard`
- ✓ NEVER `/company-onboarding`

---

## PERMISSIONS & ROLES

### Test Case H1: Company admin can access dashboard
**Expected:**
- ✓ user.role = 'company_admin'
- ✓ Full access to /dashboard and sub-routes

### Test Case H2: Company member has limited access
**Expected:**
- ✓ user.role = 'company_member'
- ✓ Limited to /search, /reports (read-only)

---

## EDGE CASES

### Test Case I1: Same email, different company
**Steps:**
1. Company A: admin@company.com
2. Company B: admin@company.com (same email)
3. User tries to claim both

**Expected Result:**
- ✓ Different company records
- ✓ Email is secondary identifier (CR is primary)
- ✓ Both claims can exist independently

### Test Case I2: File upload failure → base64 fallback
**Steps:**
1. Go to onboarding
2. Disable Storage (simulate failure)
3. Upload CR document
4. Submit

**Expected Result:**
- ✓ Falls back to base64 encoding
- ✓ Stored in cr_file_url as data: URL
- ✓ Registration completes successfully

### Test Case I3: File size validation
**Steps:**
1. Try uploading file > 5MB

**Expected Result:**
- ✓ Error: "❌ حجم الملف كبير جداً. الحد الأقصى 5MB"
- ✓ File not uploaded

---

## COMPLETE FLOW TEST

### Test Case J: Full End-to-End (Case A → Admin Approval → Dashboard)
**Steps:**
1. New Clerk user signs up
2. Complete onboarding for new company
3. Redirected to `/registration-pending`
4. Admin goes to `/admin/company-approval`
5. Admin approves company
6. User auto-refreshes or manually refreshes `/registration-pending`
7. Redirected to `/dashboard`
8. Dashboard loads with company data

**Expected Result:**
- ✓ All steps complete without errors
- ✓ Company visible in search
- ✓ User has full access
- ✓ Audit logs show company creation
- ✓ KPIs updated on admin dashboard

---

## SIGN-OFF

- [ ] All test cases pass
- [ ] No duplicates in database
- [ ] Routing logic works correctly
- [ ] Smart detection finds companies
- [ ] Admin workflows complete
- [ ] Notifications deliver
- [ ] RLS policies enforced
- [ ] Build succeeds
- [ ] No console errors

**Date:** [To be filled after testing]
**Tester:** [To be filled]
**Sign-off:** [To be filled]
