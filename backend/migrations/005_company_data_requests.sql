-- ============================================================================
-- MIGRATION 005: company_data_requests
-- Description: Member requests to complete or correct a company's profile,
--              submitted from the Search "incomplete company" modal.
--              Reviewed by Marsad admins before the company record is updated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_data_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  requested_by_user_id TEXT,
  request_type VARCHAR(30) NOT NULL,             -- 'add_data' | 'edit_data'
  payload JSONB,                                 -- submitted fields
  note TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_data_requests_company_id ON company_data_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_company_data_requests_status ON company_data_requests(status);

ALTER TABLE company_data_requests DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON company_data_requests TO anon, authenticated;
