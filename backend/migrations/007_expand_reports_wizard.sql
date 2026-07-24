-- ============================================================================
-- MIGRATION 007: Production-grade report fields (Add Report wizard, Phase A)
-- Description: Structured report data — type/category/title/description,
--              relationship, deal details, 6-dimension ratings, recommendation,
--              dispute tracking, privacy, and legal declaration.
--              All nullable / additive.
-- ============================================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_type             VARCHAR(20),   -- positive | negative | warning
  ADD COLUMN IF NOT EXISTS category                VARCHAR(40),   -- late_payment | no_payment | contract_breach | quality | execution_delay | dispute | fraud | other
  ADD COLUMN IF NOT EXISTS title                   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description             TEXT,
  ADD COLUMN IF NOT EXISTS relationship_type       VARCHAR(30),   -- client | supplier | contractor | subcontractor | partner | investor | other
  ADD COLUMN IF NOT EXISTS deal_end_date           DATE,
  ADD COLUMN IF NOT EXISTS deal_value              NUMERIC,
  ADD COLUMN IF NOT EXISTS currency                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS has_contract            BOOLEAN,
  ADD COLUMN IF NOT EXISTS contract_number         VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoice_number          VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ratings                 JSONB,         -- {commitment,quality,communication,speed,professionalism,payment}
  ADD COLUMN IF NOT EXISTS would_recommend         VARCHAR(10),   -- yes | maybe | no
  ADD COLUMN IF NOT EXISTS has_dispute             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_legal_case          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_settled              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_anonymous            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS declaration_accepted    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS declaration_accepted_at TIMESTAMP WITH TIME ZONE;
