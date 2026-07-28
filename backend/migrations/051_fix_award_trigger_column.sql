-- Migration: 051_fix_award_trigger_column.sql
-- Purpose: award_on_report_approved reads new.reviewed_by, which is not a column
--          on reports. Every approval would raise 42703 and fail.
--
-- This is the same fault as 029, which read new.tenant_id on a table whose column
-- is reporter_tenant_id and broke report submission outright until 033. A plpgsql
-- trigger body is not checked against the table when the function is created —
-- the column is resolved when the trigger fires — so `create trigger` succeeded
-- and the migration reported success while approving any report was broken.
--
-- reports records no reviewer at all; who reviewed it lives in report_audit_log.
-- credits_ledger.user_id means "the person who caused this row", and for an
-- award caused by a state transition there is no single person to name from the
-- row itself. Passing null is accurate; source_table and source_id already carry
-- the provenance, which is what the ledger is actually asked.

create or replace function public.award_on_report_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved' then
    perform public.grant_credits(
      new.reporter_tenant_id, 'report_approved', 'reports', new.id, null);
  end if;
  return new;
end $$;

-- ============================================================================
-- Prove the trigger runs, rather than assuming it compiles
-- ============================================================================
-- A trigger whose body references a missing column raises only when it fires.
-- So fire it: approve a report inside a savepoint, read the ledger, roll back.

do $$
declare
  v_tenant   uuid;
  v_company  uuid;
  v_report   uuid;
  v_category text;
  v_granted  int;
  v_rate     int;
begin
  select t.id into v_tenant
    from public.tenants t
    join public.subscriptions s on s.tenant_id = t.id
    join public.plans pl on pl.id = s.plan_id
   where pl.give_to_get_enabled
   limit 1;

  if v_tenant is null then
    raise notice 'لا كيان على باقة تكسب — تعذّر إثبات عمل المشغّل';
    return;
  end if;

  select id into v_company from public.companies where approved limit 1;
  select category into v_category from public.reports where category is not null limit 1;
  select coalesce((value -> 'earn' -> 'report_approved' ->> 'points')::int, 0)
    into v_rate from public.system_settings where key = 'give_to_get_rules';

  insert into public.reports
    (reporter_tenant_id, target_company_id, status, category, payment_commitment, dealt_at)
  values
    (v_tenant, v_company, 'pending_review', v_category, 'full', now())
  returning id into v_report;

  update public.reports set status = 'approved' where id = v_report;

  select coalesce(sum(amount), 0)::int into v_granted
    from public.credits_ledger
   where source_table = 'reports' and source_id = v_report;

  -- Undo everything this check created.
  delete from public.credits_ledger where source_table = 'reports' and source_id = v_report;
  delete from public.reports where id = v_report;

  if v_granted <> v_rate then
    raise exception 'المشغّل منح % والمتوقّع % — المنح لا يعمل', v_granted, v_rate;
  end if;

  raise notice '✅ اعتماد تقرير منح % نقطة فعلاً', v_granted;
end $$;
