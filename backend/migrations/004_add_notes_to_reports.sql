-- ============================================================================
-- MIGRATION 004: Add notes column to reports
-- Description: Free-text notes captured in the "Add Report" wizard
--              (step 2 → "ملاحظات إضافية"). Nullable, additive only.
-- ============================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes TEXT;
