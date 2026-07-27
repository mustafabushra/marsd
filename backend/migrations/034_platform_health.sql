-- Migration: 034_platform_health.sql
-- Purpose: give /admin/system-health something true to show.
--
-- The screen reported a cache hit rate of 94.2%, a queue of 1,247 jobs, and
-- 542GB of 1TB storage used. Marsad has no cache, no job queue, and no storage
-- it manages — those are three systems that do not exist, reported as healthy.
-- An operator watching that page would have been watching nothing, and would
-- have believed they were watching something.
--
-- What is worth an operator's attention is whether the data is internally
-- consistent: a company carrying a trust score with no reports behind it, a
-- tenant with no subscription, a user attached to no company, a company sitting
-- over the limit its plan allows. Each is a real fault with a real fix, and each
-- is invisible from any single screen.
--
-- Some of it lives in pg_catalog, which the browser cannot read and should not
-- be able to. SECURITY DEFINER, restricted to platform admins.
--
-- Idempotent.

create or replace function public.platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
  v_tables         int;
  v_rls_enabled    int;
  v_no_policy      text[];
  v_realtime       int;
  v_migrations     int;
  v_last_migration text;
begin
  if public.get_current_user_id() is not null and not public.is_platform_admin() then
    raise exception 'حالة النظام متاحة لإدارة المنصة فقط';
  end if;

  -- ── Access control coverage ────────────────────────────────────────────────
  -- A table with RLS on and no policy is closed to everyone, which is safe but
  -- usually a mistake. A table with RLS off is open to anyone holding an anon
  -- key. Both are worth seeing, and neither shows up anywhere else.
  select count(*), count(*) filter (where c.relrowsecurity)
    into v_tables, v_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname <> 'schema_migrations';

  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_no_policy
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
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
      'realtime_tables', v_realtime
    ),

    'schema', jsonb_build_object(
      'migrations_applied', v_migrations,
      'last_migration', v_last_migration
    ),

    'volume', jsonb_build_object(
      'companies',   (select count(*) from public.companies),
      'tenants',     (select count(*) from public.tenants),
      'users',       (select count(*) from public.users),
      'reports',     (select count(*) from public.reports),
      'trust_scores',(select count(*) from public.trust_scores),
      'notifications',(select count(*) from public.notifications),
      'audit_logs',  (select count(*) from public.audit_logs)
    ),

    'activity', jsonb_build_object(
      'last_report',       (select max(created_at) from public.reports),
      'last_login',        (select max(last_login_at) from public.users),
      'last_audit',        (select max(created_at) from public.audit_logs),
      'last_score_computed',(select max(computed_at) from public.trust_scores),
      'reports_last_7d',   (select count(*) from public.reports where created_at > now() - interval '7 days'),
      'pending_review',    (select count(*) from public.reports where status = 'pending_review')
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
         where not exists (select 1 from public.companies c where c.id = r.target_company_id))
    )
  ) into v;

  return v;
end;
$$;

revoke all on function public.platform_health() from public;
grant execute on function public.platform_health() to authenticated, service_role;

do $$
declare h jsonb;
begin
  select public.platform_health() into h;
  raise notice 'الجداول: % · RLS: % · ترحيلات: %',
    h #>> '{access,tables}', h #>> '{access,rls_enabled}', h #>> '{schema,migrations_applied}';
  raise notice 'أعطال الاتساق: %', h -> 'faults';
end $$;
