-- Migration: 022_report_audit_log.sql
-- Purpose: the last Marsad table without row-level security.
--
-- Same shape as company_audit_log: an append-only record of who did what to a
-- report. Readable by platform staff, since that is who it exists for. Writable
-- by anyone signed in but only under their own identity — the review flows run
-- in the browser, and a trail whose author can be forged records nothing worth
-- reading.
--
-- Idempotent.

drop policy if exists report_audit_log_select on public.report_audit_log;
drop policy if exists report_audit_log_insert on public.report_audit_log;

create policy report_audit_log_select on public.report_audit_log
for select using (public.is_platform_admin());

create policy report_audit_log_insert on public.report_audit_log
for insert with check (
  actor_id is null or actor_id = public.get_current_user_id()
);

alter table public.report_audit_log enable row level security;
