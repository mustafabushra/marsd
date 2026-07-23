-- ============================================================================
-- FIX RLS POLICIES - Drop all existing and recreate
-- ============================================================================

-- Disable RLS temporarily to drop policies
ALTER TABLE IF EXISTS companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS watchlist_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS business_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registration_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS claim_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS credits_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trust_scores DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP ALL POLICIES (Clean slate)
-- ============================================================================

-- Companies
DROP POLICY IF EXISTS "companies_select_policy" ON companies;

-- Tenants
DROP POLICY IF EXISTS "tenants_select_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_insert_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_update_policy" ON tenants;

-- Users
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;

-- Registration Requests
DROP POLICY IF EXISTS "registration_requests_select_policy" ON registration_requests;
DROP POLICY IF EXISTS "registration_requests_insert_policy" ON registration_requests;
DROP POLICY IF EXISTS "registration_requests_update_policy" ON registration_requests;

-- Claim Requests
DROP POLICY IF EXISTS "claim_requests_select_policy" ON claim_requests;
DROP POLICY IF EXISTS "claim_requests_insert_policy" ON claim_requests;
DROP POLICY IF EXISTS "claim_requests_update_policy" ON claim_requests;

-- Notifications
DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;

-- Audit Logs
DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON audit_logs;

-- Reports
DROP POLICY IF EXISTS "reports_select_policy" ON reports;
DROP POLICY IF EXISTS "reports_insert_policy" ON reports;
DROP POLICY IF EXISTS "reports_update_policy" ON reports;

-- Trust Scores
DROP POLICY IF EXISTS "trust_scores_select_policy" ON trust_scores;
DROP POLICY IF EXISTS "trust_scores_insert_policy" ON trust_scores;
DROP POLICY IF EXISTS "trust_scores_update_policy" ON trust_scores;

-- Watchlist
DROP POLICY IF EXISTS "watchlist_items_select_policy" ON watchlist_items;
DROP POLICY IF EXISTS "watchlist_items_insert_policy" ON watchlist_items;
DROP POLICY IF EXISTS "watchlist_items_delete_policy" ON watchlist_items;

-- Business Requests
DROP POLICY IF EXISTS "business_requests_select_policy" ON business_requests;
DROP POLICY IF EXISTS "business_requests_insert_policy" ON business_requests;
DROP POLICY IF EXISTS "business_requests_update_policy" ON business_requests;

-- Subscriptions
DROP POLICY IF EXISTS "subscriptions_select_policy" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_policy" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_policy" ON subscriptions;

-- Plans
DROP POLICY IF EXISTS "plans_select_policy" ON plans;

-- Credits Ledger
DROP POLICY IF EXISTS "credits_ledger_select_policy" ON credits_ledger;
DROP POLICY IF EXISTS "credits_ledger_insert_policy" ON credits_ledger;

-- ============================================================================
-- RE-ENABLE RLS
-- ============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RECREATE ALL POLICIES (Permissive for development)
-- ============================================================================

-- COMPANIES - Everyone can read
CREATE POLICY "companies_select" ON companies FOR SELECT USING (true);

-- TENANTS - Allow all operations (development mode)
CREATE POLICY "tenants_select" ON tenants FOR SELECT USING (true);
CREATE POLICY "tenants_insert" ON tenants FOR INSERT WITH CHECK (true);
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tenants_delete" ON tenants FOR DELETE USING (true);

-- USERS - Allow all operations
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "users_delete" ON users FOR DELETE USING (true);

-- REGISTRATION REQUESTS - Allow all
CREATE POLICY "reg_req_select" ON registration_requests FOR SELECT USING (true);
CREATE POLICY "reg_req_insert" ON registration_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "reg_req_update" ON registration_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "reg_req_delete" ON registration_requests FOR DELETE USING (true);

-- CLAIM REQUESTS - Allow all
CREATE POLICY "claim_req_select" ON claim_requests FOR SELECT USING (true);
CREATE POLICY "claim_req_insert" ON claim_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "claim_req_update" ON claim_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "claim_req_delete" ON claim_requests FOR DELETE USING (true);

-- NOTIFICATIONS - Allow all
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "notif_delete" ON notifications FOR DELETE USING (true);

-- AUDIT LOGS - Allow all
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (true);

-- REPORTS - Allow all
CREATE POLICY "reports_select" ON reports FOR SELECT USING (true);
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (true);
CREATE POLICY "reports_update" ON reports FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "reports_delete" ON reports FOR DELETE USING (true);

-- TRUST SCORES - Allow all
CREATE POLICY "trust_select" ON trust_scores FOR SELECT USING (true);
CREATE POLICY "trust_insert" ON trust_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "trust_update" ON trust_scores FOR UPDATE USING (true) WITH CHECK (true);

-- WATCHLIST - Allow all
CREATE POLICY "watch_select" ON watchlist_items FOR SELECT USING (true);
CREATE POLICY "watch_insert" ON watchlist_items FOR INSERT WITH CHECK (true);
CREATE POLICY "watch_delete" ON watchlist_items FOR DELETE USING (true);

-- BUSINESS REQUESTS - Allow all
CREATE POLICY "br_select" ON business_requests FOR SELECT USING (true);
CREATE POLICY "br_insert" ON business_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "br_update" ON business_requests FOR UPDATE USING (true) WITH CHECK (true);

-- SUBSCRIPTIONS - Allow all
CREATE POLICY "sub_select" ON subscriptions FOR SELECT USING (true);
CREATE POLICY "sub_insert" ON subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "sub_update" ON subscriptions FOR UPDATE USING (true) WITH CHECK (true);

-- PLANS - Allow read
CREATE POLICY "plans_select" ON plans FOR SELECT USING (true);

-- CREDITS LEDGER - Allow all
CREATE POLICY "credit_select" ON credits_ledger FOR SELECT USING (true);
CREATE POLICY "credit_insert" ON credits_ledger FOR INSERT WITH CHECK (true);
