-- Migration: 082_close_report_functions_to_anon.sql
-- Purpose: 081 reopened to anonymous callers the three functions it dropped.
--
-- ============================================================================
-- How 081 leaked
-- ============================================================================
-- Renaming the ambiguous parameter needed DROP FUNCTION first. Dropping a
-- function also drops its ACL, and this project has Supabase's default
-- privileges in place — which grant EXECUTE on every new function in public to
-- anon. So the three that were dropped came back open, and the two that were
-- only replaced kept the explicit revokes I had given them.
--
-- probe-search caught it: three report functions answered a caller with no
-- session at all, handing out a company's report categories, its last five
-- reports with their full text, and its monthly trend.
--
-- This is the same failure as 062, and my own migration wrote it back in. So the
-- fix here is not just the grants — each function now also refuses to return
-- rows without a session, the way search_companies_fts already does. A grant
-- that reappears then leaks nothing.
--
-- Both callers are behind CompanyRoute (/trust-report/:id and /search), so no
-- signed-out user was ever meant to reach these.

revoke all on function public.get_company_reports_summary(uuid) from public, anon;
revoke all on function public.get_company_reports_timeline(uuid, integer) from public, anon;
revoke all on function public.get_company_trends(uuid) from public, anon;

-- ============================================================================
-- The guard, inside each one
-- ============================================================================
create or replace function public.get_company_reports_summary(p_company_id uuid)
returns table (category varchar, count integer, icon varchar, color varchar)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    r.category::varchar,
    count(*)::int,
    (case r.category
       when 'late_payment'    then '💳'
       when 'no_payment'      then '⚠️'
       when 'contract_breach' then '📄'
       when 'quality'         then '🔧'
       when 'execution_delay' then '⏳'
       when 'dispute'         then '⚔️'
       when 'fraud'           then '🚨'
       else '📋'
     end)::varchar,
    (case r.category
       when 'late_payment'    then '#F59E0B'
       when 'no_payment'      then '#DC2626'
       when 'contract_breach' then '#B45309'
       when 'quality'         then '#7C3AED'
       when 'execution_delay' then '#0891B2'
       when 'dispute'         then '#7C3AED'
       when 'fraud'           then '#991B1B'
       else '#64748B'
     end)::varchar
  from public.reports r
  where public.get_current_user_id() is not null
    and r.target_company_id = p_company_id
    and r.status = 'approved'
    and r.category is not null
  group by r.category
  order by count(*) desc;
$fn$;

create or replace function public.get_company_reports_timeline(
  p_company_id uuid,
  limit_val integer default 10
)
returns table (
  id uuid, title varchar, summary text, severity varchar,
  status varchar, created_at timestamptz, reporter_company_name varchar
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    r.id,
    r.title::varchar,
    r.description,
    r.category::varchar,
    r.status::varchar,
    r.created_at,
    coalesce(c.name, 'مصدر غير مُتتبَّع')::varchar
  from public.reports r
  left join public.tenants t on t.id = r.reporter_tenant_id
  left join public.companies c on c.id = t.company_id
  where public.get_current_user_id() is not null
    and r.target_company_id = p_company_id
    and r.status = 'approved'
  order by r.created_at desc
  limit greatest(1, least(limit_val, 100));
$fn$;

create or replace function public.get_company_trends(p_company_id uuid)
returns table (
  period_month varchar, approved_reports integer,
  avg_score numeric, trend_direction varchar
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with m as (
    select to_char(date_trunc('month', r.created_at), 'YYYY-MM') as ym,
           count(*)::int as n,
           round(avg(case when r.payment_commitment = 'full' then 100
                          when r.defaulted then 0 else 50 end), 1) as score
      from public.reports r
     where public.get_current_user_id() is not null
       and r.target_company_id = p_company_id
       and r.status = 'approved'
       and r.created_at >= date_trunc('month', now()) - interval '11 months'
     group by 1
  )
  select
    m.ym::varchar,
    m.n,
    m.score,
    (case
       when lag(m.score) over (order by m.ym) is null then 'flat'
       when m.score > lag(m.score) over (order by m.ym) then 'up'
       when m.score < lag(m.score) over (order by m.ym) then 'down'
       else 'flat'
     end)::varchar
  from m
  order by m.ym;
$fn$;

grant execute on function public.get_company_reports_summary(uuid) to authenticated;
grant execute on function public.get_company_reports_timeline(uuid, integer) to authenticated;
grant execute on function public.get_company_trends(uuid) to authenticated;
revoke all on function public.get_company_reports_summary(uuid) from public, anon;
revoke all on function public.get_company_reports_timeline(uuid, integer) from public, anon;
revoke all on function public.get_company_trends(uuid) from public, anon;

-- ============================================================================
-- Autocomplete matched prefixes only, so it matched nothing
-- ============================================================================
-- The probe asked it for "ا" against 31 real companies and got zero rows. Saudi
-- company names begin with شركة or مؤسسة — the word a person actually types is
-- never the first one. A prefix match is the one thing that cannot work here.
--
-- It now matches anywhere in the name and ranks prefixes first, so typing the
-- distinctive word finds the company and typing the whole name still puts it at
-- the top.
create or replace function public.autocomplete_companies(
  search_query text,
  limit_val integer default 10
)
returns table (id uuid, name varchar, cr_number varchar)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.id, c.name::varchar, c.cr_number::varchar
    from public.companies c
   where public.get_current_user_id() is not null
     and c.approved
     and length(trim(search_query)) > 0
     and (c.name ilike '%' || trim(search_query) || '%'
          or c.cr_number like trim(search_query) || '%')
   order by
     (c.cr_number like trim(search_query) || '%') desc,
     (c.name ilike trim(search_query) || '%') desc,
     length(c.name),
     c.name
   limit greatest(1, least(limit_val, 25));
$fn$;

grant execute on function public.autocomplete_companies(text, integer) to authenticated;
revoke all on function public.autocomplete_companies(text, integer) from public, anon;

-- ============================================================================
-- The grants are actually gone
-- ============================================================================
-- Scoped to these five on purpose. 104 functions in public carry an anon grant
-- from Supabase's defaults — nearly all of them trigger functions and pg_trgm
-- internals that PostgREST cannot call at all. Asserting against the whole
-- schema here would fail on every one of them and push toward a blanket revoke,
-- which is exactly what 060 did before it took the admin dashboard down.
--
-- What is browser-reachable is checked where it belongs: probe-anon-rpc calls
-- every RPC the frontend names, with no session, and reads what comes back.
do $blk$
declare v_leaked text;
begin
  select string_agg(distinct p.proname, ', ') into v_leaked
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
    cross join lateral aclexplode(p.proacl) a
    join pg_roles r on r.oid = a.grantee
   where a.privilege_type = 'EXECUTE'
     and r.rolname = 'anon'
     and p.proname in ('search_companies_fts', 'autocomplete_companies',
                       'get_company_reports_summary', 'get_company_reports_timeline',
                       'get_company_trends');

  if v_leaked is not null then
    raise exception 'ما زالت مفتوحة أمام anon: %', v_leaked;
  end if;
end $blk$;

-- ============================================================================
-- Prove the guard, not just the grant
-- ============================================================================
do $blk$
declare v_co uuid; v_n int;
begin
  select id into v_co from public.companies where approved limit 1;

  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_n from public.get_company_reports_summary(v_co);
  if v_n > 0 then raise exception 'التصنيفات تُسرَّب بلا جلسة'; end if;

  select count(*) into v_n from public.get_company_reports_timeline(v_co, 5);
  if v_n > 0 then raise exception 'التقارير تُسرَّب بلا جلسة'; end if;

  select count(*) into v_n from public.get_company_trends(v_co);
  if v_n > 0 then raise exception 'الاتجاه يُسرَّب بلا جلسة'; end if;

  raise notice '✅ الثلاث مغلقة بالصلاحية وبالشرط معًا';
end $blk$;
