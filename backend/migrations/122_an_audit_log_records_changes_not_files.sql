-- An audit log records changes, not files
-- ============================================================================
--
-- `company_audit_log` held 770 rows in 457MB. One row weighed 6.2MB.
--
-- The trigger stored `row_to_json(old)` and `row_to_json(new)` — the whole
-- company row, twice, on every update. And a company row carries `cr_file_url`,
-- which on this platform is not a URL but the commercial registration itself as
-- a base64 data URL. So every edit to a company copied its scanned certificate
-- into the audit log twice, and 451MB of a 500MB database was the same handful
-- of files written over and over.
--
-- That is what filled the disk. The register import failed at 1.47 million rows
-- with «No space left on device», and the space had been spent on this before
-- the import began.
--
-- ============================================================================
-- What an audit entry is for
-- ============================================================================
-- To answer «who changed what, and when». A file is not a change — it is an
-- object with its own identity, already stored once, and reachable from the
-- company. Copying it into the log answers no question anybody asks and costs
-- what it costs.
--
-- So the heavy fields are dropped from what is recorded. Everything else is
-- kept exactly as before, including the case expression that names the action.

create or replace function public.log_company_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor text;
  -- Fields that are content rather than change. `cr_file_url` is a base64
  -- document; `search_vector` is derived and enormous; `official_data` is the
  -- raw payload from a lookup, already stored on the row it belongs to.
  v_heavy text[] := array['cr_file_url', 'search_vector', 'official_data'];
begin
  select u.id into v_actor
    from public.users u where u.id = public.get_current_user_id();

  insert into public.company_audit_log (
    company_id, action, actor_id, change_reason, old_values, new_values, created_at
  ) values (
    new.id,
    case
      when tg_op = 'INSERT'                                   then 'created'
      when new.status   is distinct from old.status           then 'status_changed'
      when new.approved is distinct from old.approved
        then (case when new.approved then 'approved' else 'unapproved' end)
      else 'updated'
    end,
    v_actor,
    nullif(current_setting('marsad.change_reason', true), ''),
    case when tg_op = 'UPDATE' then to_jsonb(old) - v_heavy else null end,
    to_jsonb(new) - v_heavy,
    current_timestamp
  );
  return new;
end $function$;

-- --- The 451MB already written ----------------------------------------------
-- Stripped rather than deleted. The entries are the record of who changed what
-- and stay exactly as they were; only the copied documents leave, and the
-- original is still on the company row where it belongs.
update public.company_audit_log
   set old_values = old_values - array['cr_file_url', 'search_vector', 'official_data']
 where old_values ?| array['cr_file_url', 'search_vector', 'official_data'];

update public.company_audit_log
   set new_values = new_values - array['cr_file_url', 'search_vector', 'official_data']
 where new_values ?| array['cr_file_url', 'search_vector', 'official_data'];
