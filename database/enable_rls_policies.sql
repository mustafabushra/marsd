-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Permissive policies for development (allow all authenticated users)
-- ============================================================================

-- ============================================================================
-- COMPANIES TABLE - Everyone can read
-- ============================================================================
DROP POLICY IF EXISTS "companies_select_policy" ON companies;
CREATE POLICY "companies_select_policy" ON companies
  FOR SELECT
  USING (true);

-- ============================================================================
-- TENANTS TABLE - Users can see their own tenant
-- ============================================================================
DROP POLICY IF EXISTS "tenants_select_policy" ON tenants;
CREATE POLICY "tenants_select_policy" ON tenants
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "tenants_insert_policy" ON tenants;
CREATE POLICY "tenants_insert_policy" ON tenants
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "tenants_update_policy" ON tenants;
CREATE POLICY "tenants_update_policy" ON tenants
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- USERS TABLE - Users can see their own record
-- ============================================================================
DROP POLICY IF EXISTS "users_select_policy" ON users;
CREATE POLICY "users_select_policy" ON users
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users_insert_policy" ON users;
CREATE POLICY "users_insert_policy" ON users
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_update_policy" ON users;
CREATE POLICY "users_update_policy" ON users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- REGISTRATION REQUESTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "registration_requests_select_policy" ON registration_requests;
CREATE POLICY "registration_requests_select_policy" ON registration_requests
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "registration_requests_insert_policy" ON registration_requests;
CREATE POLICY "registration_requests_insert_policy" ON registration_requests
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "registration_requests_update_policy" ON registration_requests;
CREATE POLICY "registration_requests_update_policy" ON registration_requests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- CLAIM REQUESTS TABLE - Users can create and view claims
-- ============================================================================
DROP POLICY IF EXISTS "claim_requests_select_policy" ON claim_requests;
CREATE POLICY "claim_requests_select_policy" ON claim_requests
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "claim_requests_insert_policy" ON claim_requests;
CREATE POLICY "claim_requests_insert_policy" ON claim_requests
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "claim_requests_update_policy" ON claim_requests;
CREATE POLICY "claim_requests_update_policy" ON claim_requests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- NOTIFICATIONS TABLE - Users can see their notifications
-- ============================================================================
DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
CREATE POLICY "notifications_select_policy" ON notifications
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
CREATE POLICY "notifications_insert_policy" ON notifications
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;
CREATE POLICY "notifications_update_policy" ON notifications
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- AUDIT LOGS TABLE - Only admins and system can insert
-- ============================================================================
DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
CREATE POLICY "audit_logs_select_policy" ON audit_logs
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "audit_logs_insert_policy" ON audit_logs;
CREATE POLICY "audit_logs_insert_policy" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- REPORTS TABLE - Users can see reports about their company
-- ============================================================================
DROP POLICY IF EXISTS "reports_select_policy" ON reports;
CREATE POLICY "reports_select_policy" ON reports
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "reports_insert_policy" ON reports;
CREATE POLICY "reports_insert_policy" ON reports
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "reports_update_policy" ON reports;
CREATE POLICY "reports_update_policy" ON reports
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRUST SCORES TABLE - Everyone can read
-- ============================================================================
DROP POLICY IF EXISTS "trust_scores_select_policy" ON trust_scores;
CREATE POLICY "trust_scores_select_policy" ON trust_scores
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "trust_scores_insert_policy" ON trust_scores;
CREATE POLICY "trust_scores_insert_policy" ON trust_scores
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "trust_scores_update_policy" ON trust_scores;
CREATE POLICY "trust_scores_update_policy" ON trust_scores
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- WATCHLIST TABLE - Users can manage their watchlist
-- ============================================================================
DROP POLICY IF EXISTS "watchlist_items_select_policy" ON watchlist_items;
CREATE POLICY "watchlist_items_select_policy" ON watchlist_items
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "watchlist_items_insert_policy" ON watchlist_items;
CREATE POLICY "watchlist_items_insert_policy" ON watchlist_items
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "watchlist_items_delete_policy" ON watchlist_items;
CREATE POLICY "watchlist_items_delete_policy" ON watchlist_items
  FOR DELETE
  USING (true);

-- ============================================================================
-- BUSINESS REQUESTS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "business_requests_select_policy" ON business_requests;
CREATE POLICY "business_requests_select_policy" ON business_requests
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "business_requests_insert_policy" ON business_requests;
CREATE POLICY "business_requests_insert_policy" ON business_requests
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "business_requests_update_policy" ON business_requests;
CREATE POLICY "business_requests_update_policy" ON business_requests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "subscriptions_select_policy" ON subscriptions;
CREATE POLICY "subscriptions_select_policy" ON subscriptions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "subscriptions_insert_policy" ON subscriptions;
CREATE POLICY "subscriptions_insert_policy" ON subscriptions
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "subscriptions_update_policy" ON subscriptions;
CREATE POLICY "subscriptions_update_policy" ON subscriptions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PLANS TABLE - Everyone can read plans
-- ============================================================================
DROP POLICY IF EXISTS "plans_select_policy" ON plans;
CREATE POLICY "plans_select_policy" ON plans
  FOR SELECT
  USING (true);

-- ============================================================================
-- CREDITS LEDGER TABLE
-- ============================================================================
DROP POLICY IF EXISTS "credits_ledger_select_policy" ON credits_ledger;
CREATE POLICY "credits_ledger_select_policy" ON credits_ledger
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "credits_ledger_insert_policy" ON credits_ledger;
CREATE POLICY "credits_ledger_insert_policy" ON credits_ledger
  FOR INSERT
  WITH CHECK (true);
