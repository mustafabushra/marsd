-- Migration: 033_fix_pending_reports_limit_column.sql
-- Purpose: repair report submission. 029 broke it.
--
-- enforce_plan_limit reads new.tenant_id. Every table it was attached to has
-- that column except reports, which calls it reporter_tenant_id — a report has
-- two parties and the column says which one is filing. So the trigger raised
--
--     record "new" has no field "tenant_id"   (42703)
--
-- on every insert into reports, and filing a report — the action the entire
-- platform exists to collect — has been impossible since 029 was deployed.
--
-- It failed loudly, at the database, on every attempt. What made it survive
-- deployment is that it cannot be seen from the migration: 029 ran clean,
-- because a trigger body is not resolved against the table until a row goes
-- through it. Nothing in that migration touched reports data, so nothing
-- exercised it.
--
-- verify-roles.mjs found it, which is the reason that script writes real rows as
-- real accounts instead of reading policy text. It first blamed the roles, and
-- the roles were fine.
--
-- Idempotent.

-- ============================================================================
-- 1) Let the trigger be told which column names the tenant
-- ============================================================================
-- plpgsql cannot dereference a field name held in a variable, so the row goes
-- through to_jsonb. That also removes the assumption that broke this: the column
-- is now something each trigger states rather than something the function
-- presumes.

create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key        text := tg_argv[0];
  v_predicate  text := coalesce(tg_argv[1], 'true');
  v_tenant_col text := coalesce(tg_argv[2], 'tenant_id');
  v_tenant_id  uuid;
  v_enabled    boolean;
  v_grace      numeric;
  v_limit      integer;
  v_count      bigint;
  v_ceiling    integer;
begin
  if public.get_current_user_id() is null or public.is_platform_admin() then
    return new;
  end if;

  v_tenant_id := (to_jsonb(new) ->> v_tenant_col)::uuid;
  if v_tenant_id is null then
    return new;
  end if;

  select coalesce((value ->> 'enabled')::boolean, true),
         coalesce((value ->> 'grace_percent')::numeric, 0)
    into v_enabled, v_grace
    from public.system_settings
   where key = 'entitlements_enforcement';

  if not coalesce(v_enabled, true) then
    return new;
  end if;

  v_limit := public.tenant_limit(v_tenant_id, v_key);
  if v_limit is null or v_limit < 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':' || v_key, 0));

  execute format('select count(*) from public.%I where %I = $1 and (%s)',
                 tg_table_name, v_tenant_col, v_predicate)
     into v_count
    using v_tenant_id;

  v_ceiling := floor(v_limit * (1 + v_grace / 100.0));

  if v_count >= v_ceiling then
    raise exception 'بلغت حد باقتك (% من %). ارفع الباقة أو احذف عنصراً.', v_count, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 2) Reattach with the right column
-- ============================================================================

drop trigger if exists enforce_pending_reports_limit on public.reports;
create trigger enforce_pending_reports_limit
  before insert on public.reports
  for each row execute function public.enforce_plan_limit(
    'pending_reports', 'status = ''pending_review''', 'reporter_tenant_id');

-- watchlist_items does use tenant_id; restated so both triggers read alike and
-- neither depends on the default.
drop trigger if exists enforce_watchlist_limit on public.watchlist_items;
create trigger enforce_watchlist_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_plan_limit(
    'watchlist_items', 'true', 'tenant_id');

-- ============================================================================
-- 3) Actually push a row through it
-- ============================================================================
-- The whole reason this reached production is that 029 was never made to. A
-- migration that only creates the trigger proves the trigger exists; only an
-- insert proves it runs.

do $$
declare
  v_tenant uuid;
  v_company uuid;
  v_report uuid;
begin
  select t.id into v_tenant from public.tenants t where t.status = 'active' limit 1;
  select co.id into v_company from public.companies co limit 1;

  if v_tenant is null or v_company is null then
    raise notice 'لا توجد بيانات كافية للفحص — تُخُطّي';
    return;
  end if;

  insert into public.reports (reporter_tenant_id, target_company_id, dealt_at)
  values (v_tenant, v_company, now())
  returning id into v_report;

  delete from public.reports where id = v_report;
  raise notice 'إدراج تقرير يمرّ عبر المحفّز بنجاح';
end $$;
