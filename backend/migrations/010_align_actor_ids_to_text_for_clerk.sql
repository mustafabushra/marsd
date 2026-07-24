-- 010: Align actor/id columns to text for Clerk auth
--
-- The app authenticates via Clerk, whose user ids are text (e.g. "user_3Guk...").
-- users.id is already text. But invited_by / actor_id / entity_id were declared
-- as uuid (designed for supabase.auth), so they could never receive a valid
-- Clerk id. Effects observed before this migration:
--   * pending_invites.invited_by is NOT NULL uuid -> every invite insert failed
--     (0 rows ever created).
--   * audit_logs.actor_id / entity_id uuid -> actor/target were never recorded
--     (all audit rows had null actor).
-- Convert these columns to text so the Clerk id model works end-to-end.

alter table public.pending_invites alter column invited_by type text using invited_by::text;
alter table public.audit_logs      alter column actor_id   type text using actor_id::text;
alter table public.audit_logs      alter column entity_id  type text using entity_id::text;

notify pgrst, 'reload schema';
