-- Migration: 057_close_remaining_anon_rpc.sql
-- Purpose: platform_health() answers an unauthenticated caller.
--
-- Found by calling every admin RPC with the anon key rather than by reading
-- them. It returns the schema's shape — table count, which tables have RLS,
-- which are in the realtime publication, plus consistency counts across the
-- platform. That is a map of the system handed to anyone who asks.
--
-- Same family as 056: a guard that is absent, or present and null-permeable.
-- The guard is added here in the null-safe form, and the probe that found this
-- one now runs over every function so the next one is found the same way.

create or replace function public.platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'access', jsonb_build_object(
      'tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r'),
      'rls_enabled', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
      'without_rls', coalesce((select jsonb_agg(c.relname)
                                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                where n.nspname = 'public' and c.relkind = 'r'
                                  and not c.relrowsecurity), '[]'::jsonb),
      'definer_without_search_path', coalesce((select jsonb_agg(p.proname)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                           where c like 'search_path=%')), '[]'::jsonb)),
    'data', jsonb_build_object(
      'tenants',            (select count(*) from public.tenants),
      'companies',          (select count(*) from public.companies),
      'reports',            (select count(*) from public.reports),
      'users',              (select count(*) from public.users),
      'reports_no_reporter',(select count(*) from public.reports where reporter_tenant_id is null),
      'tenants_no_plan',    (select count(*) from public.tenants t
                              where not exists (select 1 from public.subscriptions s
                                                 where s.tenant_id = t.id and s.status = 'active')),
      'users_no_tenant',    (select count(*) from public.users
                              where tenant_id is null and role not in ('platform_admin','reviewer')),
      'users_never_logged_in', (select count(*) from public.users where last_login_at is null))
  ) into v;

  return v;
end $fn$;

grant execute on function public.platform_health() to authenticated;

-- ============================================================================
-- Verify with no session
-- ============================================================================
do $blk$
begin
  perform set_config('request.jwt.claims', '', true);
  if public.platform_health() <> '{}'::jsonb then
    raise exception 'platform_health ما زالت تُجيب بلا جلسة';
  end if;
  raise notice '✅ platform_health مغلقة أمام المجهول';
end $blk$;
