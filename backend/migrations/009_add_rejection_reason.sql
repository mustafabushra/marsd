-- ============================================================================
-- MIGRATION 009: rejection_reason on reports
-- Description: Admin's reason when rejecting a report (shown to the reporter in
--              "My Reports"). Nullable / additive. Avoids the review_actions
--              uuid reviewer_id constraint for Clerk-authenticated admins.
-- ============================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
