-- Migration: 056_null_safe_admin_gate.sql
-- Purpose: is_reviewer() returns NULL when nobody is signed in, so every guard
--          written as `if not is_platform_admin() and not is_reviewer()` was
--          open to anonymous callers.
--
-- ============================================================================
-- The hole
-- ============================================================================
-- get_current_user_role() returns NULL when there is no session, and is_reviewer
-- was `RETURN get_current_user_role() IN ('reviewer','platform_admin')`. In SQL
-- `NULL IN (...)` is NULL, not false. So the guard in report_analytics:
--
--   if not is_platform_admin() and not is_reviewer() then return '{}' end if;
--
-- evaluated to `not false and not NULL` → `true and NULL` → NULL. An IF does not
-- fire on NULL, so the guard was skipped entirely and the function returned
-- analytics across every tenant to an unauthenticated caller holding the anon
-- key that ships inside the browser bundle. Confirmed with curl against
-- production: POST /rest/v1/rpc/report_analytics returned {"total": 52, ...}.
--
-- is_platform_admin() was already wrapped in coalesce and did return false,
-- which is why the pair looked safe. One of two guards being null-safe is worse
-- than neither: the safe one is the one people read.
--
-- Both halves are fixed — the predicate must not return NULL, and the guards
-- must not depend on it not returning NULL.

-- ============================================================================
-- 1) A predicate answers yes or no
-- ============================================================================
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.get_current_user_role() in ('reviewer', 'platform_admin'), false)
$fn$;

comment on function public.is_reviewer is
  'هل المستخدم الحالي مراجع أو مدير منصّة — تُعيد false لا NULL بلا جلسة';

-- ============================================================================
-- 2) Guards that hold even if a predicate returns NULL again
-- ============================================================================
-- `not coalesce(a or b, false)` is false when either is true, and false when
-- both are NULL. Belt and braces: this mistake was invisible in review and only
-- surfaced under curl.

create or replace function public.report_analytics(p_days integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_since timestamptz := case when p_days > 0
                              then now() - (p_days || ' days')::interval
                              else '-infinity'::timestamptz end;
  v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'total',        count(*),
    'pending',      count(*) filter (where status = 'pending_review'),
    'approved',     count(*) filter (where status = 'approved'),
    'rejected',     count(*) filter (where status = 'rejected'),
    'request_info', count(*) filter (where status = 'request_info'),
    'defaults',     count(*) filter (where defaulted),
    'reviewed',     count(*) filter (where approved_at is not null),
    'with_delay',   count(*) filter (where delay_days > 0),
    'avg_delay',    coalesce(round(avg(delay_days) filter (where delay_days > 0)), 0),
    'total_value',  coalesce(sum(deal_value), 0),
    'median_review_hours', coalesce(round(
      percentile_cont(0.5) within group (
        order by extract(epoch from (approved_at - created_at)) / 3600
      ) filter (where approved_at is not null)), 0)
  ) into v
  from public.reports
  where created_at >= v_since;

  return v
    || jsonb_build_object('by_category', coalesce((
         select jsonb_object_agg(category, n) from (
           select category, count(*) n from public.reports
            where category is not null and created_at >= v_since
            group by category) x), '{}'::jsonb))
    || jsonb_build_object('by_commitment', coalesce((
         select jsonb_object_agg(payment_commitment, n) from (
           select payment_commitment, count(*) n from public.reports
            where payment_commitment is not null and created_at >= v_since
            group by payment_commitment) x), '{}'::jsonb))
    || jsonb_build_object('monthly', coalesce((
         select jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m) from (
           select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n
             from public.reports
            where created_at >= greatest(v_since, date_trunc('month', now()) - interval '11 months')
            group by 1) y), '[]'::jsonb))
    || jsonb_build_object('top_companies', coalesce((
         select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)
                          order by n desc) from (
           select c.id, c.name, count(*) n
             from public.reports r join public.companies c on c.id = r.target_company_id
            where r.created_at >= v_since
            group by c.id, c.name order by n desc limit 10) z), '[]'::jsonb))
    || jsonb_build_object('top_reporters', coalesce((
         select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)
                          order by n desc) from (
           select t.id, t.name, count(*) n
             from public.reports r join public.tenants t on t.id = r.reporter_tenant_id
            where r.created_at >= v_since
            group by t.id, t.name order by n desc limit 10) z), '[]'::jsonb));
end $fn$;

grant execute on function public.report_analytics(integer) to authenticated;

create or replace function public.credits_granted_for(
  p_source_table text, p_source_id uuid, p_reason text
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_amount integer;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return 0;
  end if;
  select amount into v_amount
    from public.credits_ledger
   where source_table = p_source_table and source_id = p_source_id
     and reason = p_reason and amount > 0
   limit 1;
  return coalesce(v_amount, 0);
end $fn$;

grant execute on function public.credits_granted_for(text, uuid, text) to authenticated;

create or replace function public.tenant_analytics()
returns table (
  tenant_id uuid, name text, status text, created_at timestamptz, claimed boolean,
  plan_name text, plan_code text, users_active integer, reports_total integer,
  reports_approved integer, watchlist integer, credits integer, last_login timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    t.id, t.name::text, t.status::text, t.created_at, t.company_id is not null,
    coalesce(pl.name, 'مجاني')::text, coalesce(pl.code, 'free')::text,
    (select count(*)::int from public.users u where u.tenant_id = t.id and u.status = 'active'),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id and r.status = 'approved'),
    (select count(*)::int from public.watchlist_items w where w.tenant_id = t.id),
    (select coalesce(sum(c.amount), 0)::int from public.credits_ledger c where c.tenant_id = t.id),
    (select max(u.last_login_at) from public.users u where u.tenant_id = t.id)
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id and s.status = 'active'
  left join public.plans pl on pl.id = s.plan_id
  where coalesce(public.is_platform_admin() or public.is_reviewer(), false)
  order by t.created_at desc;
$fn$;

grant execute on function public.tenant_analytics() to authenticated;

-- ============================================================================
-- 3) Every other guard built on the same predicate
-- ============================================================================
-- Any function whose body contains `not public.is_reviewer()` inherits the same
-- three-valued hole. Listed rather than silently assumed to be none.
do $blk$
declare r record; n int := 0;
begin
  for r in
    -- prokind = 'f' only: pg_get_functiondef raises on aggregates and window
    -- functions, and the first run of this block died on array_agg.
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind = 'f'
       and p.prosrc ilike '%not public.is_reviewer()%'
  loop
    n := n + 1;
    raise warning 'ما زالت تستخدم النفي المباشر: %', r.sig;
  end loop;
  if n = 0 then
    raise notice 'لا دالة أخرى تنفي is_reviewer مباشرةً';
  end if;
end $blk$;

-- ============================================================================
-- 4) Prove it with no session — which is how it was found
-- ============================================================================
do $blk$
declare v jsonb; n int;
begin
  perform set_config('request.jwt.claims', '', true);

  if public.is_reviewer() is null then
    raise exception 'is_reviewer ما زالت تُعيد NULL';
  end if;
  if public.is_reviewer() then
    raise exception 'is_reviewer تقول نعم بلا جلسة';
  end if;

  v := public.report_analytics(0);
  if v <> '{}'::jsonb then
    raise exception 'report_analytics ما زالت تُسرّب بلا جلسة: %', left(v::text, 120);
  end if;

  select count(*) into n from public.tenant_analytics();
  if n > 0 then
    raise exception 'tenant_analytics ما زالت تُسرّب % صفاً بلا جلسة', n;
  end if;

  if public.credits_granted_for('reports', gen_random_uuid(), 'report_approved') <> 0 then
    raise exception 'credits_granted_for تُجيب بلا جلسة';
  end if;

  raise notice '✅ كل البوّابات مغلقة أمام المجهول';
end $blk$;
