-- ============================================================================
-- MIGRATION 008: Enterprise size on companies
-- Description: Self-reported enterprise size (متناهية الصغر / صغيرة / متوسطة /
--              كبيرة). Nullable / additive. Backs a dropdown on the company forms.
-- ============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS enterprise_size VARCHAR(20);
