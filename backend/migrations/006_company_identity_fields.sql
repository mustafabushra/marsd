-- ============================================================================
-- MIGRATION 006: Company identity + verification fields
-- Description: Extended identity data for the companies registry (Layer 1),
--              plus lightweight verification flags. All nullable / additive.
--              Government-sourced fields stay unverified until an admin or
--              Wathq confirms them (verified / verified_at / verification_source).
-- ============================================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS name_en             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS entity_type         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cr_expiry_date      DATE,
  ADD COLUMN IF NOT EXISTS founding_date       DATE,
  ADD COLUMN IF NOT EXISTS main_activity       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sub_activities      TEXT,
  ADD COLUMN IF NOT EXISTS region              VARCHAR(100),
  ADD COLUMN IF NOT EXISTS national_address    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone               VARCHAR(30),
  ADD COLUMN IF NOT EXISTS verified            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verification_source VARCHAR(30);
