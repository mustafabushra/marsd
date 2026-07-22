-- Marsad: Production Database Schema (Supabase Adapted)
-- PostgreSQL + Supabase
-- Migration: 001_initial_schema_supabase.sql
-- Description: Complete schema with indexes and constraints for multi-tenant SaaS
-- Preconditions: PostgreSQL 12+, UUID extension, Supabase Auth enabled
-- Adaptations: Direct auth.users integration, credits_ledger, pending_invites

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- TABLE: tenants
-- Description: Tenant companies (مستأجرين — شركات مشترِكة)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cr_number VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  city VARCHAR(100),
  sector VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  plan_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_cr_number ON tenants(cr_number);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);

-- ============================================================================
-- TABLE: users
-- Description: Platform and tenant users (linked directly to auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'company_member',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ============================================================================
-- TABLE: companies
-- Description: Companies being reviewed/assessed
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cr_number VARCHAR(20) NOT NULL UNIQUE,
  sector VARCHAR(100),
  city VARCHAR(100),
  founded_year INTEGER,
  cr_status VARCHAR(50) DEFAULT 'active',
  source VARCHAR(50) DEFAULT 'community',
  approved BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_cr_number ON companies(cr_number);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_approved ON companies(approved);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at);

-- ============================================================================
-- TABLE: company_profiles
-- Description: Claim linking - Tenant claiming ownership of a company
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  claimed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_profiles_tenant_id ON company_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_profiles_company_id ON company_profiles(company_id);

-- ============================================================================
-- TABLE: plans
-- Description: Subscription plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  price_monthly DECIMAL(10, 2),
  limits JSONB,
  features TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- TABLE: subscriptions
-- Description: Tenant subscriptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  gateway_ref VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at);

-- ============================================================================
-- TABLE: invoices
-- Description: Billing invoices
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  vat DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  pdf_s3_key VARCHAR(255),
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ============================================================================
-- TABLE: reports
-- Description: Business/transaction reports from tenants about companies
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  deal_amount_range VARCHAR(50),
  payment_commitment VARCHAR(50),
  delay_days INTEGER DEFAULT 0,
  defaulted BOOLEAN DEFAULT false,
  dealt_at TIMESTAMP WITH TIME ZONE NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_tenant_id ON reports(reporter_tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_target_company_id ON reports(target_company_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_approved_at ON reports(approved_at);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- ============================================================================
-- TABLE: report_documents
-- Description: Supporting documents for reports (S3 references)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  s3_key VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_documents_report_id ON report_documents(report_id);

-- ============================================================================
-- TABLE: review_actions
-- Description: Approvals, rejections, and info requests on reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS review_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_actions_report_id ON review_actions(report_id);
CREATE INDEX IF NOT EXISTS idx_review_actions_reviewer_id ON review_actions(reviewer_id);

-- ============================================================================
-- TABLE: trust_scores
-- Description: Computed trust scores for companies
-- ============================================================================
CREATE TABLE IF NOT EXISTS trust_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  score INTEGER,
  risk_band VARCHAR(50),
  tier VARCHAR(50),
  approved_reports INTEGER DEFAULT 0,
  breakdown JSONB,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_company_id ON trust_scores(company_id);
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(score);

-- ============================================================================
-- TABLE: watchlist_items
-- Description: Companies in user watchlists
-- ============================================================================
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_name VARCHAR(255) DEFAULT 'قائمة المراقبة',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_tenant_id ON watchlist_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_company_id ON watchlist_items(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_unique ON watchlist_items(tenant_id, company_id);

-- ============================================================================
-- TABLE: business_requests
-- Description: B2B collaboration requests between tenants
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_requests_from_tenant_id ON business_requests(from_tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_requests_to_tenant_id ON business_requests(to_tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_requests_status ON business_requests(status);

-- ============================================================================
-- TABLE: notifications
-- Description: User notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  payload JSONB,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================================================
-- TABLE: audit_logs
-- Description: Immutable append-only audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id UUID,
  meta JSONB,
  ip_address INET,
  user_agent VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- TABLE: view_quota_usage
-- Description: Track view quota consumption per tenant per month
-- ============================================================================
CREATE TABLE IF NOT EXISTS view_quota_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period VARCHAR(10) NOT NULL,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_view_quota_usage_tenant_id ON view_quota_usage(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_view_quota_usage_unique ON view_quota_usage(tenant_id, period);

-- ============================================================================
-- TABLE: system_settings
-- Description: Global system configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- TABLE: credits_ledger (NEW)
-- Description: Append-only credits transaction log
-- ============================================================================
CREATE TABLE IF NOT EXISTS credits_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('report_approved','view_unlock','admin_adjustment','refund')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credits_ledger_tenant_id ON credits_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_report_id ON credits_ledger(report_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_reason ON credits_ledger(reason);

-- ============================================================================
-- TABLE: pending_invites (NEW)
-- Description: Team member invitations
-- ============================================================================
CREATE TABLE IF NOT EXISTS pending_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'company_member',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT unique_pending_invite UNIQUE(tenant_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_pending_invites_tenant_id ON pending_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pending_invites_email ON pending_invites(email);
CREATE INDEX IF NOT EXISTS idx_pending_invites_status ON pending_invites(status);

-- ============================================================================
-- TRIGGERS: Update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS tenants_updated_at_trigger
BEFORE UPDATE ON tenants FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS users_updated_at_trigger
BEFORE UPDATE ON users FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS companies_updated_at_trigger
BEFORE UPDATE ON companies FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS subscriptions_updated_at_trigger
BEFORE UPDATE ON subscriptions FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS invoices_updated_at_trigger
BEFORE UPDATE ON invoices FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS reports_updated_at_trigger
BEFORE UPDATE ON reports FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS business_requests_updated_at_trigger
BEFORE UPDATE ON business_requests FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS view_quota_usage_updated_at_trigger
BEFORE UPDATE ON view_quota_usage FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS: Documentation
-- ============================================================================

COMMENT ON TABLE tenants IS 'Subscriber companies (مستأجرين/المتعاقدين)';
COMMENT ON TABLE users IS 'Platform and tenant users with role-based access (linked to auth.users)';
COMMENT ON TABLE companies IS 'Companies being reviewed and assessed (موضوع التقييم)';
COMMENT ON TABLE reports IS 'Business transaction reports (تقارير التعامل)';
COMMENT ON TABLE audit_logs IS 'Immutable append-only audit trail';
COMMENT ON TABLE credits_ledger IS 'Append-only credits transaction log (Give-to-Get system)';
COMMENT ON TABLE pending_invites IS 'Team member invitations (non-auth signup)';
COMMENT ON COLUMN audit_logs.ip_address IS 'Source IP address for forensics';
COMMENT ON COLUMN audit_logs.user_agent IS 'Browser/client user-agent string';

-- End of migration 001_initial_schema_supabase.sql
