-- ============================================================================
-- MARSAD KNOWLEDGE BASE ARCHITECTURE
-- Phase 1: Central Data Repository (Single Source of Truth)
-- ============================================================================
-- This migration implements two central knowledge hubs:
-- 1. Company Knowledge Base — Master registry for all companies
-- 2. Report Knowledge Base — Master registry for all reports
--
-- All queries across Marsad must flow through these repositories.
-- No page maintains duplicate company or report data.
-- ============================================================================

-- ============================================================================
-- 1. COMPANY KNOWLEDGE BASE — Master company registry
-- ============================================================================
-- Aggregates company data from:
--   - companies table (core data)
--   - trust_scores table (calculated metrics)
--   - reports table (impact counts)
--   - registration_requests table (registration status)
--   - claim_requests table (claim status)
-- ============================================================================

CREATE OR REPLACE VIEW v_company_knowledge_base AS
SELECT
  c.id,
  c.name,
  c.cr_number,
  c.unified_number,
  c.license_number,
  c.official_email,
  c.sector,
  c.city,
  c.founded_year,
  c.cr_file_url,

  -- Company status
  c.status AS registration_status,
  c.cr_status,
  c.source,
  c.approved,

  -- Claim status — واحد فقط من آخر claim request
  COALESCE(cr.status, 'none'::TEXT) AS claim_status,

  -- Report counts
  COALESCE(
    (SELECT COUNT(*) FROM reports WHERE target_company_id = c.id AND status = 'approved'),
    0
  ) AS approved_reports_count,
  COALESCE(
    (SELECT COUNT(*) FROM reports WHERE target_company_id = c.id AND status = 'pending_review'),
    0
  ) AS pending_reports_count,
  COALESCE(
    (SELECT COUNT(*) FROM reports WHERE target_company_id = c.id AND status = 'rejected'),
    0
  ) AS rejected_reports_count,
  COALESCE(
    (SELECT COUNT(*) FROM reports WHERE target_company_id = c.id),
    0
  ) AS total_reports_count,

  -- Trust score
  COALESCE(ts.score, 0) AS trust_score,
  COALESCE(ts.tier, 'none'::TEXT) AS trust_tier,

  -- Last activities
  (SELECT MAX(created_at) FROM reports WHERE target_company_id = c.id)
    AS last_report_at,
  c.updated_at AS last_updated_at,

  -- Timestamps
  c.created_at,
  c.updated_at

FROM companies c
LEFT JOIN trust_scores ts ON ts.company_id = c.id
LEFT JOIN LATERAL (
  -- Latest claim request (most recent one)
  SELECT status FROM claim_requests
  WHERE company_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) cr ON true;

-- ============================================================================
-- 2. REPORT KNOWLEDGE BASE — Master report registry
-- ============================================================================
-- Aggregates report data with:
--   - Full company information
--   - Reporter information (anonymized for non-reviewers/admins)
--   - Approval/rejection history
--   - Credits awarded
--   - Version tracking
-- ============================================================================

CREATE OR REPLACE VIEW v_report_knowledge_base AS
SELECT
  r.id,
  r.reporter_tenant_id,
  r.target_company_id,

  -- Company info
  c.name AS company_name,
  c.cr_number AS company_cr_number,
  c.sector AS company_sector,

  -- Report details (actual columns from reports table)
  r.deal_amount_range,
  r.payment_commitment,
  r.delay_days,
  r.defaulted,

  -- Status
  r.status,

  -- Dates
  r.submitted_at,
  r.updated_at AS last_updated_at,
  r.approved_at,
  r.rejected_at,
  r.dealt_at,

  -- Impact
  CASE
    WHEN r.status = 'approved' THEN 10
    WHEN r.status = 'rejected' THEN 0
    ELSE 0
  END AS credits_awarded,

  CASE
    WHEN r.status = 'approved' THEN (
      SELECT COALESCE(SUM(amount), 0)
      FROM credits_ledger
      WHERE report_id = r.id AND reason = 'report_approved'
    )
    ELSE 0
  END AS total_credits_awarded

FROM reports r
LEFT JOIN companies c ON c.id = r.target_company_id;

-- ============================================================================
-- 3. AUDIT & HISTORY TABLES
-- ============================================================================
-- Track all changes to companies and reports for compliance and debugging

CREATE TABLE IF NOT EXISTS company_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. HELPER FUNCTIONS — Central business logic
-- ============================================================================

-- Get complete company profile (Knowledge Base)
CREATE OR REPLACE FUNCTION get_company_knowledge_base(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  cr_number TEXT,
  unified_number TEXT,
  license_number TEXT,
  official_email TEXT,
  sector TEXT,
  city TEXT,
  founded_year INTEGER,
  cr_file_url TEXT,
  registration_status TEXT,
  cr_status TEXT,
  source TEXT,
  approved BOOLEAN,
  claim_status TEXT,
  approved_reports_count INTEGER,
  pending_reports_count INTEGER,
  rejected_reports_count INTEGER,
  total_reports_count INTEGER,
  trust_score NUMERIC,
  trust_tier TEXT,
  last_report_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
  SELECT * FROM v_company_knowledge_base
  WHERE id = p_company_id;
$$ LANGUAGE SQL STABLE;

-- Search companies through Knowledge Base
CREATE OR REPLACE FUNCTION search_company_knowledge_base(
  p_query TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  cr_number TEXT,
  unified_number TEXT,
  sector TEXT,
  city TEXT,
  registration_status TEXT,
  source TEXT,
  claim_status TEXT,
  trust_score NUMERIC,
  trust_tier TEXT,
  total_reports_count INTEGER,
  last_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
  SELECT
    id, name, cr_number, unified_number, sector, city,
    registration_status, source, claim_status,
    trust_score, trust_tier, total_reports_count, last_updated_at
  FROM v_company_knowledge_base
  WHERE
    (p_query IS NULL OR
      name ILIKE '%' || p_query || '%' OR
      cr_number ILIKE '%' || p_query || '%' OR
      unified_number ILIKE '%' || p_query || '%' OR
      license_number ILIKE '%' || p_query || '%' OR
      official_email ILIKE '%' || p_query || '%')
    AND (p_source IS NULL OR source = p_source)
    AND (p_status IS NULL OR registration_status = p_status)
  ORDER BY last_updated_at DESC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE SQL STABLE;

-- Get complete report details (Knowledge Base)
CREATE OR REPLACE FUNCTION get_report_knowledge_base(p_report_id UUID)
RETURNS TABLE (
  id UUID,
  reporter_tenant_id UUID,
  target_company_id UUID,
  company_name TEXT,
  company_cr_number TEXT,
  company_sector TEXT,
  deal_amount_range TEXT,
  payment_commitment TEXT,
  delay_days INT,
  defaulted BOOLEAN,
  status TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  dealt_at TIMESTAMP WITH TIME ZONE,
  credits_awarded INT,
  total_credits_awarded INT
) AS $$
  SELECT * FROM v_report_knowledge_base
  WHERE id = p_report_id;
$$ LANGUAGE SQL STABLE;

-- Search reports through Knowledge Base
CREATE OR REPLACE FUNCTION search_report_knowledge_base(
  p_query TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  target_company_id UUID,
  company_name TEXT,
  company_cr_number TEXT,
  deal_amount_range TEXT,
  payment_commitment TEXT,
  status TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  total_credits_awarded INT
) AS $$
  SELECT
    id, target_company_id, company_name, company_cr_number,
    deal_amount_range, payment_commitment, status, submitted_at, total_credits_awarded
  FROM v_report_knowledge_base
  WHERE
    (p_query IS NULL OR
      company_name ILIKE '%' || p_query || '%' OR
      company_cr_number ILIKE '%' || p_query || '%')
    AND (p_status IS NULL OR status = p_status)
    AND (p_company_id IS NULL OR target_company_id = p_company_id)
  ORDER BY submitted_at DESC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 5. AUDIT TRIGGERS — Auto-log all important changes
-- ============================================================================

-- Log company changes
CREATE OR REPLACE FUNCTION log_company_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO company_audit_log (
    company_id, action, old_values, new_values, created_at
  ) VALUES (
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN NEW.status != OLD.status THEN 'status_changed'
      WHEN NEW.approved != OLD.approved THEN (CASE WHEN NEW.approved THEN 'approved' ELSE 'unapproved' END)
      ELSE 'updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    row_to_json(NEW),
    CURRENT_TIMESTAMP
  );
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS company_audit_trigger ON companies;
CREATE TRIGGER company_audit_trigger
AFTER INSERT OR UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION log_company_change();

-- Log report changes
CREATE OR REPLACE FUNCTION log_report_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO report_audit_log (
    report_id, action, old_values, new_values, created_at
  ) VALUES (
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'submitted'
      WHEN NEW.status != OLD.status THEN 'status_changed'
      ELSE 'updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    row_to_json(NEW),
    CURRENT_TIMESTAMP
  );
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS report_audit_trigger ON reports;
CREATE TRIGGER report_audit_trigger
AFTER INSERT OR UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION log_report_change();

-- ============================================================================
-- 6. INDEXES for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_company_audit_company_id ON company_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_company_audit_created_at ON company_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_audit_action ON company_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_report_audit_report_id ON report_audit_log(report_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_created_at ON report_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_audit_action ON report_audit_log(action);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- ✅ v_company_knowledge_base — Master company view
-- ✅ v_report_knowledge_base — Master report view
-- ✅ get_company_knowledge_base() — RPC for single company
-- ✅ search_company_knowledge_base() — RPC for company search
-- ✅ get_report_knowledge_base() — RPC for single report
-- ✅ search_report_knowledge_base() — RPC for report search
-- ✅ Audit logging for compliance & debugging
-- ✅ Indexes for performance
-- ============================================================================
