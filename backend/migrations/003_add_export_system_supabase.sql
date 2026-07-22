-- Marsad: Add export system tables (Supabase Adapted)
-- Migration: 003_add_export_system_supabase.sql
-- Description: Export jobs and templates for data export functionality

-- ============================================================================
-- TABLE: export_jobs
-- Description: Track export jobs and their results
-- ============================================================================
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'excel', 'pdf', 'json')),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('reports', 'companies', 'watchlist', 'all')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'scheduled')),

  -- Filters and columns
  filters JSONB,
  columns TEXT[] DEFAULT '{}',

  -- Results
  file_url TEXT,
  file_size BIGINT,
  rows_count INT DEFAULT 0,

  -- Scheduling
  is_scheduled BOOLEAN DEFAULT false,
  schedule_frequency VARCHAR(20) CHECK (schedule_frequency IN ('daily', 'weekly', 'monthly', NULL)),
  next_scheduled_run TIMESTAMP WITH TIME ZONE,

  -- Email delivery
  send_to_email VARCHAR(255),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,

  -- Errors
  error_message TEXT,
  error_details JSONB,

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant_id ON export_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user_id ON export_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_format ON export_jobs(format);
CREATE INDEX IF NOT EXISTS idx_export_jobs_entity_type ON export_jobs(entity_type);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_is_scheduled ON export_jobs(is_scheduled);

-- ============================================================================
-- TABLE: export_templates
-- Description: Saved export templates for reuse
-- ============================================================================
CREATE TABLE IF NOT EXISTS export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  format VARCHAR(20) NOT NULL CHECK (format IN ('csv', 'excel', 'pdf', 'json')),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('reports', 'companies', 'watchlist')),

  -- Saved settings
  filters JSONB,
  columns TEXT[] DEFAULT '{}',

  -- Priorities
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_templates_tenant_id ON export_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_templates_format ON export_templates(format);
CREATE INDEX IF NOT EXISTS idx_export_templates_entity_type ON export_templates(entity_type);

-- ============================================================================
-- Enable RLS on export tables
-- ============================================================================
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies for export_jobs
-- ============================================================================
DROP POLICY IF EXISTS export_jobs_select_policy ON export_jobs;
CREATE POLICY export_jobs_select_policy ON export_jobs
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_jobs_insert_policy ON export_jobs;
CREATE POLICY export_jobs_insert_policy ON export_jobs
FOR INSERT
WITH CHECK (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_jobs_update_policy ON export_jobs;
CREATE POLICY export_jobs_update_policy ON export_jobs
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_jobs_delete_policy ON export_jobs;
CREATE POLICY export_jobs_delete_policy ON export_jobs
FOR DELETE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

-- ============================================================================
-- RLS Policies for export_templates
-- ============================================================================
DROP POLICY IF EXISTS export_templates_select_policy ON export_templates;
CREATE POLICY export_templates_select_policy ON export_templates
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_templates_insert_policy ON export_templates;
CREATE POLICY export_templates_insert_policy ON export_templates
FOR INSERT
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_templates_update_policy ON export_templates;
CREATE POLICY export_templates_update_policy ON export_templates
FOR UPDATE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
)
WITH CHECK (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

DROP POLICY IF EXISTS export_templates_delete_policy ON export_templates;
CREATE POLICY export_templates_delete_policy ON export_templates
FOR DELETE
USING (
  (tenant_id = get_current_tenant_id() AND is_tenant_admin())
  OR is_platform_admin()
);

-- ============================================================================
-- TRIGGER: Update updated_at for export_jobs
-- ============================================================================
DROP TRIGGER IF EXISTS export_jobs_updated_at_trigger ON export_jobs;
CREATE TRIGGER export_jobs_updated_at_trigger
BEFORE UPDATE ON export_jobs FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER: Update updated_at for export_templates
-- ============================================================================
DROP TRIGGER IF EXISTS export_templates_updated_at_trigger ON export_templates;
CREATE TRIGGER export_templates_updated_at_trigger
BEFORE UPDATE ON export_templates FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- End of migration 003_add_export_system_supabase.sql
