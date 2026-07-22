-- Marsad: Row-Level Security (RLS) Policies (Supabase Adapted)
-- PostgreSQL + Supabase
-- Migration: 002_rls_policies_supabase.sql
-- Description: Multi-tenant isolation with role-based access control
-- Security Model: Supabase Auth (auth.uid()) + user tenant/role lookup

-- ============================================================================
-- PREREQUISITE: Enable Row Level Security on all tables
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_quota_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTION: get_current_user_id()
-- Returns: UUID of current user from Supabase Auth
-- ============================================================================
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: get_current_tenant_id()
-- Returns: UUID of current user's tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = v_user_id LIMIT 1;
  RETURN v_tenant_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: get_current_user_role()
-- Returns: Role of current user
-- ============================================================================
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
DECLARE
  v_user_id UUID;
  v_role VARCHAR;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_user_id LIMIT 1;
  RETURN v_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: is_platform_admin()
-- Returns: TRUE if user is platform admin
-- ============================================================================
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() = 'platform_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: is_tenant_admin()
-- Returns: TRUE if user is admin for their tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() IN ('company_admin', 'platform_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: is_reviewer()
-- Returns: TRUE if user is a reviewer or admin
-- ============================================================================
CREATE OR REPLACE FUNCTION is_reviewer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() IN ('reviewer', 'platform_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- POLICY: tenants
-- Rule: Users can only see/modify their own tenant
--       Platform admins can see all tenants
-- ============================================================================

DROP POLICY IF EXISTS tenants_select_policy ON tenants;
CREATE POLICY tenants_select_policy ON tenants
FOR SELECT
USING (
  id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS tenants_insert_policy ON tenants;
CREATE POLICY tenants_insert_policy ON tenants
FOR INSERT
WITH CHECK (
  is_platform_admin()
);

DROP POLICY IF EXISTS tenants_update_policy ON tenants;
CREATE POLICY tenants_update_policy ON tenants
FOR UPDATE
USING (
  id = get_current_tenant_id()
  OR is_platform_admin()
)
WITH CHECK (
  id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS tenants_delete_policy ON tenants;
CREATE POLICY tenants_delete_policy ON tenants
FOR DELETE
USING (
  is_platform_admin()
);

-- ============================================================================
-- POLICY: users
-- Rule: Users can see users in their own tenant
--       Tenant admins can see all users in their tenant
--       Users can only update their own profile
--       Tenant admins can create/update users in their tenant
-- ============================================================================

DROP POLICY IF EXISTS users_select_policy ON users;
CREATE POLICY users_select_policy ON users
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS users_insert_policy ON users;
CREATE POLICY users_insert_policy ON users
FOR INSERT
WITH CHECK (
  is_tenant_admin()
  AND tenant_id = get_current_tenant_id()
);

DROP POLICY IF EXISTS users_update_policy ON users;
CREATE POLICY users_update_policy ON users
FOR UPDATE
USING (
  (id = get_current_user_id() AND tenant_id = get_current_tenant_id())
  OR (is_tenant_admin() AND tenant_id = get_current_tenant_id())
  OR is_platform_admin()
)
WITH CHECK (
  (id = get_current_user_id() AND tenant_id = get_current_tenant_id())
  OR (is_tenant_admin() AND tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS users_delete_policy ON users;
CREATE POLICY users_delete_policy ON users
FOR DELETE
USING (
  is_tenant_admin()
  AND tenant_id = get_current_tenant_id()
);

-- ============================================================================
-- POLICY: companies
-- Rule: Anyone can read companies (they are public data)
--       Only platform admins can insert/update/delete
-- ============================================================================

DROP POLICY IF EXISTS companies_select_policy ON companies;
CREATE POLICY companies_select_policy ON companies
FOR SELECT
USING (true);

DROP POLICY IF EXISTS companies_insert_policy ON companies;
CREATE POLICY companies_insert_policy ON companies
FOR INSERT
WITH CHECK (
  is_platform_admin()
);

DROP POLICY IF EXISTS companies_update_policy ON companies;
CREATE POLICY companies_update_policy ON companies
FOR UPDATE
USING (is_platform_admin())
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS companies_delete_policy ON companies;
CREATE POLICY companies_delete_policy ON companies
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: company_profiles
-- Rule: Tenants can only see/manage their own profile claim
--       Platform admins can manage all
-- ============================================================================

DROP POLICY IF EXISTS company_profiles_select_policy ON company_profiles;
CREATE POLICY company_profiles_select_policy ON company_profiles
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS company_profiles_insert_policy ON company_profiles;
CREATE POLICY company_profiles_insert_policy ON company_profiles
FOR INSERT
WITH CHECK (
  (is_tenant_admin() AND tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS company_profiles_update_policy ON company_profiles;
CREATE POLICY company_profiles_update_policy ON company_profiles
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS company_profiles_delete_policy ON company_profiles;
CREATE POLICY company_profiles_delete_policy ON company_profiles
FOR DELETE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

-- ============================================================================
-- POLICY: plans
-- Rule: Anyone can read plans
--       Only platform admins can modify
-- ============================================================================

DROP POLICY IF EXISTS plans_select_policy ON plans;
CREATE POLICY plans_select_policy ON plans
FOR SELECT
USING (true);

DROP POLICY IF EXISTS plans_insert_policy ON plans;
CREATE POLICY plans_insert_policy ON plans
FOR INSERT
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS plans_update_policy ON plans;
CREATE POLICY plans_update_policy ON plans
FOR UPDATE
USING (is_platform_admin())
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS plans_delete_policy ON plans;
CREATE POLICY plans_delete_policy ON plans
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: subscriptions
-- Rule: Tenants can only see their own subscription
--       Tenant admins can manage their subscription
--       Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS subscriptions_select_policy ON subscriptions;
CREATE POLICY subscriptions_select_policy ON subscriptions
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS subscriptions_insert_policy ON subscriptions;
CREATE POLICY subscriptions_insert_policy ON subscriptions
FOR INSERT
WITH CHECK (
  (is_tenant_admin() AND tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS subscriptions_update_policy ON subscriptions;
CREATE POLICY subscriptions_update_policy ON subscriptions
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS subscriptions_delete_policy ON subscriptions;
CREATE POLICY subscriptions_delete_policy ON subscriptions
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: invoices
-- Rule: Tenants can see invoices for their subscription
--       Tenant admins can manage
--       Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS invoices_select_policy ON invoices;
CREATE POLICY invoices_select_policy ON invoices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriptions.id = invoices.subscription_id
    AND subscriptions.tenant_id = get_current_tenant_id()
  )
  OR is_platform_admin()
);

DROP POLICY IF EXISTS invoices_insert_policy ON invoices;
CREATE POLICY invoices_insert_policy ON invoices
FOR INSERT
WITH CHECK (
  is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriptions.id = invoices.subscription_id
    AND subscriptions.tenant_id = get_current_tenant_id()
    AND is_tenant_admin()
  )
);

DROP POLICY IF EXISTS invoices_update_policy ON invoices;
CREATE POLICY invoices_update_policy ON invoices
FOR UPDATE
USING (
  is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriptions.id = invoices.subscription_id
    AND subscriptions.tenant_id = get_current_tenant_id()
    AND is_tenant_admin()
  )
)
WITH CHECK (
  is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriptions.id = invoices.subscription_id
    AND subscriptions.tenant_id = get_current_tenant_id()
    AND is_tenant_admin()
  )
);

DROP POLICY IF EXISTS invoices_delete_policy ON invoices;
CREATE POLICY invoices_delete_policy ON invoices
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: reports
-- Rule: Tenant can see reports they submitted
--       Reviewers/platform_admin can see all reports
--       Tenant can only create reports, not edit/delete (BR-05 protection)
-- ============================================================================

DROP POLICY IF EXISTS reports_select_policy ON reports;
CREATE POLICY reports_select_policy ON reports
FOR SELECT
USING (
  reporter_tenant_id = get_current_tenant_id()
  OR is_reviewer()
);

DROP POLICY IF EXISTS reports_insert_policy ON reports;
CREATE POLICY reports_insert_policy ON reports
FOR INSERT
WITH CHECK (
  reporter_tenant_id = get_current_tenant_id()
);

DROP POLICY IF EXISTS reports_update_policy ON reports;
CREATE POLICY reports_update_policy ON reports
FOR UPDATE
USING (
  reporter_tenant_id = get_current_tenant_id()
  AND status = 'draft'
)
WITH CHECK (
  reporter_tenant_id = get_current_tenant_id()
  AND status IN ('draft', 'pending_review')
);

DROP POLICY IF EXISTS reports_delete_policy ON reports;
CREATE POLICY reports_delete_policy ON reports
FOR DELETE
USING (
  reporter_tenant_id = get_current_tenant_id()
  AND status = 'draft'
);

-- ============================================================================
-- POLICY: report_documents
-- Rule: Can read documents if you can read the report
--       Can upload documents to your own reports
-- ============================================================================

DROP POLICY IF EXISTS report_documents_select_policy ON report_documents;
CREATE POLICY report_documents_select_policy ON report_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = report_documents.report_id
    AND (
      reports.reporter_tenant_id = get_current_tenant_id()
      OR is_reviewer()
    )
  )
);

DROP POLICY IF EXISTS report_documents_insert_policy ON report_documents;
CREATE POLICY report_documents_insert_policy ON report_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = report_documents.report_id
    AND reports.reporter_tenant_id = get_current_tenant_id()
  )
);

DROP POLICY IF EXISTS report_documents_delete_policy ON report_documents;
CREATE POLICY report_documents_delete_policy ON report_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = report_documents.report_id
    AND reports.reporter_tenant_id = get_current_tenant_id()
    AND reports.status = 'draft'
  )
);

-- ============================================================================
-- POLICY: review_actions
-- Rule: Reviewers can create review actions
--       All users can see review actions for reports they can see
--       Immutable (no update/delete)
-- ============================================================================

DROP POLICY IF EXISTS review_actions_select_policy ON review_actions;
CREATE POLICY review_actions_select_policy ON review_actions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = review_actions.report_id
    AND (
      reports.reporter_tenant_id = get_current_tenant_id()
      OR is_reviewer()
    )
  )
);

DROP POLICY IF EXISTS review_actions_insert_policy ON review_actions;
CREATE POLICY review_actions_insert_policy ON review_actions
FOR INSERT
WITH CHECK (
  reviewer_id = get_current_user_id()
  AND is_reviewer()
);

-- ============================================================================
-- POLICY: trust_scores
-- Rule: Anyone can read trust scores (public data)
--       Only platform admin can write
-- ============================================================================

DROP POLICY IF EXISTS trust_scores_select_policy ON trust_scores;
CREATE POLICY trust_scores_select_policy ON trust_scores
FOR SELECT
USING (true);

DROP POLICY IF EXISTS trust_scores_insert_policy ON trust_scores;
CREATE POLICY trust_scores_insert_policy ON trust_scores
FOR INSERT
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS trust_scores_update_policy ON trust_scores;
CREATE POLICY trust_scores_update_policy ON trust_scores
FOR UPDATE
USING (is_platform_admin())
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS trust_scores_delete_policy ON trust_scores;
CREATE POLICY trust_scores_delete_policy ON trust_scores
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: watchlist_items
-- Rule: Tenants can only manage their own watchlist
--       Tenant admins can manage watchlist
-- ============================================================================

DROP POLICY IF EXISTS watchlist_items_select_policy ON watchlist_items;
CREATE POLICY watchlist_items_select_policy ON watchlist_items
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS watchlist_items_insert_policy ON watchlist_items;
CREATE POLICY watchlist_items_insert_policy ON watchlist_items
FOR INSERT
WITH CHECK (
  (tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS watchlist_items_update_policy ON watchlist_items;
CREATE POLICY watchlist_items_update_policy ON watchlist_items
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS watchlist_items_delete_policy ON watchlist_items;
CREATE POLICY watchlist_items_delete_policy ON watchlist_items
FOR DELETE
USING (
  (tenant_id = get_current_tenant_id())
  OR is_platform_admin()
);

-- ============================================================================
-- POLICY: business_requests
-- Rule: Tenants can see requests sent to/from them
--       Can only modify requests sent to them (accept/decline)
-- ============================================================================

DROP POLICY IF EXISTS business_requests_select_policy ON business_requests;
CREATE POLICY business_requests_select_policy ON business_requests
FOR SELECT
USING (
  from_tenant_id = get_current_tenant_id()
  OR to_tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS business_requests_insert_policy ON business_requests;
CREATE POLICY business_requests_insert_policy ON business_requests
FOR INSERT
WITH CHECK (
  from_tenant_id = get_current_tenant_id()
  AND is_tenant_admin()
);

DROP POLICY IF EXISTS business_requests_update_policy ON business_requests;
CREATE POLICY business_requests_update_policy ON business_requests
FOR UPDATE
USING (
  (to_tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (to_tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS business_requests_delete_policy ON business_requests;
CREATE POLICY business_requests_delete_policy ON business_requests
FOR DELETE
USING (
  (from_tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

-- ============================================================================
-- POLICY: notifications
-- Rule: Users can only see their own notifications
--       Notifications are created by system/admin
-- ============================================================================

DROP POLICY IF EXISTS notifications_select_policy ON notifications;
CREATE POLICY notifications_select_policy ON notifications
FOR SELECT
USING (
  user_id = get_current_user_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS notifications_insert_policy ON notifications;
CREATE POLICY notifications_insert_policy ON notifications
FOR INSERT
WITH CHECK (
  is_platform_admin()
);

DROP POLICY IF EXISTS notifications_update_policy ON notifications;
CREATE POLICY notifications_update_policy ON notifications
FOR UPDATE
USING (
  user_id = get_current_user_id()
  OR is_platform_admin()
)
WITH CHECK (
  user_id = get_current_user_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS notifications_delete_policy ON notifications;
CREATE POLICY notifications_delete_policy ON notifications
FOR DELETE
USING (
  user_id = get_current_user_id()
  OR is_platform_admin()
);

-- ============================================================================
-- POLICY: audit_logs
-- Rule: Append-only (insert only)
--       Tenants can see audit logs for their own actions
--       Platform admins can see all audit logs
-- ============================================================================

DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs;
CREATE POLICY audit_logs_select_policy ON audit_logs
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs;
CREATE POLICY audit_logs_insert_policy ON audit_logs
FOR INSERT
WITH CHECK (
  (tenant_id = get_current_tenant_id())
  OR is_platform_admin()
  OR (tenant_id IS NULL AND is_platform_admin())
);

-- No update or delete policies - audit logs are immutable

-- ============================================================================
-- POLICY: view_quota_usage
-- Rule: Tenants can see their own quota usage
--       Tenant admins can manage quota
--       System can update quota
-- ============================================================================

DROP POLICY IF EXISTS view_quota_usage_select_policy ON view_quota_usage;
CREATE POLICY view_quota_usage_select_policy ON view_quota_usage
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS view_quota_usage_insert_policy ON view_quota_usage;
CREATE POLICY view_quota_usage_insert_policy ON view_quota_usage
FOR INSERT
WITH CHECK (
  is_platform_admin()
);

DROP POLICY IF EXISTS view_quota_usage_update_policy ON view_quota_usage;
CREATE POLICY view_quota_usage_update_policy ON view_quota_usage
FOR UPDATE
USING (
  is_platform_admin()
)
WITH CHECK (
  is_platform_admin()
);

-- ============================================================================
-- POLICY: system_settings
-- Rule: Anyone can read system settings
--       Only platform admin can modify
-- ============================================================================

DROP POLICY IF EXISTS system_settings_select_policy ON system_settings;
CREATE POLICY system_settings_select_policy ON system_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS system_settings_insert_policy ON system_settings;
CREATE POLICY system_settings_insert_policy ON system_settings
FOR INSERT
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS system_settings_update_policy ON system_settings;
CREATE POLICY system_settings_update_policy ON system_settings
FOR UPDATE
USING (is_platform_admin())
WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS system_settings_delete_policy ON system_settings;
CREATE POLICY system_settings_delete_policy ON system_settings
FOR DELETE
USING (is_platform_admin());

-- ============================================================================
-- POLICY: credits_ledger
-- Rule: Append-only ledger (insert only, no update/delete)
--       Users can see own credits ledger
--       Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS credits_ledger_select_policy ON credits_ledger;
CREATE POLICY credits_ledger_select_policy ON credits_ledger
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS credits_ledger_insert_policy ON credits_ledger;
CREATE POLICY credits_ledger_insert_policy ON credits_ledger
FOR INSERT
WITH CHECK (
  is_platform_admin()
  OR (tenant_id = get_current_tenant_id() AND is_tenant_admin())
);

-- No update or delete - ledger is immutable

-- ============================================================================
-- POLICY: pending_invites
-- Rule: Tenant admins can manage invites
--       Users can see invites for their own email
--       Platform admins can see all
-- ============================================================================

DROP POLICY IF EXISTS pending_invites_select_policy ON pending_invites;
CREATE POLICY pending_invites_select_policy ON pending_invites
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR email = (SELECT email FROM auth.users WHERE id = get_current_user_id())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS pending_invites_insert_policy ON pending_invites;
CREATE POLICY pending_invites_insert_policy ON pending_invites
FOR INSERT
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS pending_invites_update_policy ON pending_invites;
CREATE POLICY pending_invites_update_policy ON pending_invites
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS pending_invites_delete_policy ON pending_invites;
CREATE POLICY pending_invites_delete_policy ON pending_invites
FOR DELETE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

-- ============================================================================
-- END OF RLS POLICIES
-- ============================================================================

-- End of migration 002_rls_policies_supabase.sql
