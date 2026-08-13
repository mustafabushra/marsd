-- Migration: 167_the_health_screen_reads_what_the_function_returns.sql
-- Purpose: put back the consistency checks that 071 dropped, so /admin/system-health
--          stops throwing before it draws anything.
--
-- 034 built platform_health() to answer one question: is the data internally
-- consistent. It returned five sections — access, schema, volume, activity and
-- eight named faults — and AdminSystemHealth.jsx was written against that shape.
--
-- 071 needed one more check (a tenant with no company row is invisible to
-- search, to reports and to its own trust score) and added it by rewriting the
-- whole function with `create or replace`. The rewrite kept `access`, renamed
-- `volume` to `data`, and dropped `schema`, `activity` and every one of the
-- eight faults. Nothing complained: the function is valid, its callers are a
-- React page that destructures whatever it gets, and the failure surfaces only
-- when someone opens the screen — at which point `schema.migrations_applied`
-- reads a property of undefined and the entire page unmounts into an error
-- boundary. A blank screen, on the page you open to find out whether anything
-- is broken.
--
-- So the shape here is the union, not a third variant:
--
--   · everything 034 returned, restored verbatim from 034 rather than from
--     memory, because the last time a function was rebuilt from memory in this
--     codebase it silently lost four of six checks;
--   · the four counts 071 added, kept under `data` where it put them;
--   · 071's reason for existing — tenants with no company — promoted to a
--     named fault, since that is what it is;
--   · 071's guard kept exactly: a caller who is neither platform admin nor
--     reviewer gets '{}' and no catalogue readings.
--
-- reports_no_reporter, documents_pending and users_never_logged_in stay plain
-- numbers under `data`. None of them is a fault: a report with no reporting
-- tenant is a report Marsad wrote itself, which is a supported path, and the
-- other two are workload rather than damage.

create or replace function public.platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v               jsonb;
  v_tables        integer;
  v_rls_enabled   integer;
  v_no_policy     text[];
  v_realtime      integer;
  v_migrations    integer;
  v_last_migration text;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  select count(*) into v_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';

  select count(*) into v_rls_enabled
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;

  select coalesce(array_agg(c.relname order by c.relname), '{}') into v_no_policy
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname <> 'schema_migrations'
     and not c.relrowsecurity;

  select count(*) into v_realtime
    from pg_publication_tables where pubname = 'supabase_realtime';

  select count(*), max(filename) into v_migrations, v_last_migration
    from public.schema_migrations;

  select jsonb_build_object(
    'checked_at', now(),

    'access', jsonb_build_object(
      'tables', v_tables,
      'rls_enabled', v_rls_enabled,
      'without_rls', to_jsonb(v_no_policy),
      'realtime_tables', v_realtime,
      -- Carried over from 071. A security definer function with no search_path
      -- is a privilege escalation waiting for a schema it did not expect.
      'definer_without_search_path', coalesce((
        select jsonb_agg(p.proname order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                            where c like 'search_path=%')), '[]'::jsonb)
    ),

    'schema', jsonb_build_object(
      'migrations_applied', v_migrations,
      'last_migration', v_last_migration
    ),

    'volume', jsonb_build_object(
      'companies',    (select count(*) from public.companies),
      'tenants',      (select count(*) from public.tenants),
      'users',        (select count(*) from public.users),
      'reports',      (select count(*) from public.reports),
      'trust_scores', (select count(*) from public.trust_scores),
      'notifications',(select count(*) from public.notifications),
      'audit_logs',   (select count(*) from public.audit_logs)
    ),

    -- 071's block, kept under the name it used so anything reading `data`
    -- keeps reading it.
    'data', jsonb_build_object(
      'tenants',              (select count(*) from public.tenants),
      'companies',            (select count(*) from public.companies),
      'reports',              (select count(*) from public.reports),
      'users',                (select count(*) from public.users),
      'reports_no_reporter',  (select count(*) from public.reports where reporter_tenant_id is null),
      'documents_pending',    (select count(*) from public.company_documents where status = 'pending'),
      'users_never_logged_in',(select count(*) from public.users where last_login_at is null)
    ),

    'activity', jsonb_build_object(
      'last_report',        (select max(created_at) from public.reports),
      'last_login',         (select max(last_login_at) from public.users),
      'last_audit',         (select max(created_at) from public.audit_logs),
      'last_score_computed',(select max(computed_at) from public.trust_scores),
      'reports_last_7d',    (select count(*) from public.reports where created_at > now() - interval '7 days'),
      'pending_review',     (select count(*) from public.reports where status = 'pending_review')
    ),

    -- ── Consistency: each of these should be zero ────────────────────────────
    'faults', jsonb_build_object(
      'scores_without_reports', (
        select count(*) from public.trust_scores t
         where t.approved_reports = 0 and t.score > 0),

      'scored_high_risk_without_evidence', (
        -- The defamation case: a company presented as high risk when nothing is
        -- known about it. 032 fixed the cause; this watches for its return.
        select count(*) from public.trust_scores t
         where t.risk_band = 'high' and t.approved_reports = 0),

      'stale_scores', (
        -- A company whose approved report count no longer matches its score row.
        select count(*) from public.trust_scores t
         where t.approved_reports <> (
           select count(*) from public.reports r
            where r.target_company_id = t.company_id and r.status = 'approved')),

      'tenants_without_subscription', (
        select count(*) from public.tenants t
         where t.status = 'active'
           and not exists (select 1 from public.subscriptions s
                            where s.tenant_id = t.id and s.status = 'active')),

      'users_without_tenant', (
        select count(*) from public.users u
         where u.tenant_id is null and u.role not in ('platform_admin', 'reviewer')),

      'tenants_without_admin', (
        select count(*) from public.tenants t
         where t.status = 'active'
           and not exists (select 1 from public.users u
                            where u.tenant_id = t.id and u.role = 'company_admin' and u.status = 'active')),

      'over_watchlist_limit', (
        select count(*) from (
          select w.tenant_id
            from public.watchlist_items w
           group by w.tenant_id
          having public.tenant_limit(w.tenant_id, 'watchlist_items') >= 0
             and count(*) > public.tenant_limit(w.tenant_id, 'watchlist_items')
        ) x),

      'orphan_reports', (
        select count(*) from public.reports r
         where not exists (select 1 from public.companies c where c.id = r.target_company_id)),

      -- 071's check, as a fault. A customer with an account and no record in
      -- the registry is invisible to search, to reports and to its own trust
      -- score, and nothing surfaced it until someone opened a screen.
      'tenants_without_company', (
        select count(*) from public.tenants
         where company_id is null
           and coalesce(status, 'active') <> 'deleted')
    )
  ) into v;

  return v;
end;
$$;

revoke all on function public.platform_health() from public;
grant execute on function public.platform_health() to authenticated, service_role;

-- Proof, rather than a claim.
--
-- The obvious check — call it and look at the keys — cannot run here: the guard
-- returns '{}' to anyone who is not an admin or a reviewer, and a migration runs
-- as the owner. So this reads the definition instead, which is what actually
-- regressed: 071 was a valid function that had quietly stopped returning three
-- of the five sections the screen destructures, and no execution of it as the
-- wrong role would have revealed that either.
do $$
declare
  d       text;
  missing text[] := '{}';
  s       text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'platform_health';

  foreach s in array array['access', 'schema', 'volume', 'activity', 'faults'] loop
    if position(format('%L,', s) in d) = 0 then
      missing := missing || s;
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'platform_health() لا يبني الأقسام التي تقرأها الشاشة: %',
      array_to_string(missing, '، ');
  end if;

  raise notice 'الأقسام الخمسة مبنيّة · والفحص التاسع (شركات بلا سجل) مضاف';
end $$;
