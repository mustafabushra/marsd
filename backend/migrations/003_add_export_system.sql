-- Add export system tables
-- Export Jobs Table
CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  format VARCHAR(20) NOT NULL, -- csv | excel | pdf | json
  entity_type VARCHAR(50) NOT NULL, -- reports | companies | watchlist | all
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | scheduled

  -- Filters and columns
  filters JSONB,
  columns TEXT[] DEFAULT '{}',

  -- Results
  file_url TEXT,
  file_size BIGINT,
  rows_count INT DEFAULT 0,

  -- Scheduling
  is_scheduled BOOLEAN DEFAULT false,
  schedule_frequency VARCHAR(20), -- daily | weekly | monthly
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

CREATE INDEX idx_export_jobs_tenant_id ON export_jobs(tenant_id);
CREATE INDEX idx_export_jobs_user_id ON export_jobs(user_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_format ON export_jobs(format);
CREATE INDEX idx_export_jobs_entity_type ON export_jobs(entity_type);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at);
CREATE INDEX idx_export_jobs_is_scheduled ON export_jobs(is_scheduled);

-- Export Templates Table
CREATE TABLE export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  format VARCHAR(20) NOT NULL, -- csv | excel | pdf | json
  entity_type VARCHAR(50) NOT NULL, -- reports | companies | watchlist

  -- Saved settings
  filters JSONB,
  columns TEXT[] DEFAULT '{}',

  -- Priorities
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_templates_tenant_id ON export_templates(tenant_id);
CREATE INDEX idx_export_templates_format ON export_templates(format);
CREATE INDEX idx_export_templates_entity_type ON export_templates(entity_type);

-- Enable RLS on export tables
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for export_jobs
CREATE POLICY "Users can view own export jobs"
  ON export_jobs FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));

CREATE POLICY "Users can create export jobs"
  ON export_jobs FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));

CREATE POLICY "Users can update own export jobs"
  ON export_jobs FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));

-- RLS Policies for export_templates
CREATE POLICY "Users can view own templates"
  ON export_templates FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));

CREATE POLICY "Users can create templates"
  ON export_templates FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));

CREATE POLICY "Users can manage own templates"
  ON export_templates FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = current_user_id::uuid));
