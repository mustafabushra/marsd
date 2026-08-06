-- Migration: 081_fix_five_broken_functions.sql
-- Purpose: five functions have never worked, and one of them is search.
--
-- ============================================================================
-- What was wrong with each
-- ============================================================================
-- get_company_reports_summary   selects r.severity — not a column on reports
-- get_company_reports_timeline  selects r.summary  — not a column either
-- get_company_trends            company_id is both the parameter and a column
-- search_companies_fts          returns a shape that is not its declared type
-- autocomplete_companies        ORDER BY on an expression not in SELECT DISTINCT
--
-- None of them has ever returned a row. Three panels of the trust report have
-- been failing quietly since they were written, and search has been running on
-- the ILIKE fallback in api.ts the whole time — behind a console.warn that says
-- "FTS not available", which nobody reads.
--
-- The columns they wanted exist under other names: severity is category, summary
-- is description. Nothing needs adding; they were written against a schema that
-- did not match the one that shipped.

-- Renaming a parameter needs the old function gone first: CREATE OR REPLACE
-- cannot change an input parameter's name. Dropped by exact signature so a
-- different overload cannot be taken by accident.
drop function if exists public.get_company_reports_summary(uuid);
drop function if exists public.get_company_reports_timeline(uuid, integer);
drop function if exists public.get_company_trends(uuid);

-- ============================================================================
-- 1) Why companies get reported
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
  where r.target_company_id = p_company_id
    and r.status = 'approved'
    and r.category is not null
  group by r.category
  order by count(*) desc;
$fn$;

grant execute on function public.get_company_reports_summary(uuid) to authenticated;

-- ============================================================================
-- 2) The last reports, in order
-- ============================================================================
-- reporter_company_name kept as a column because the trust report renders it,
-- but every caller of this is inside Marsad or inside the reported company's own
-- report — and who filed a report is already shown to reviewers by design.
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
  where r.target_company_id = p_company_id
    and r.status = 'approved'
  order by r.created_at desc
  limit greatest(1, least(limit_val, 100));
$fn$;

grant execute on function public.get_company_reports_timeline(uuid, integer) to authenticated;

-- ============================================================================
-- 3) Reports per month
-- ============================================================================
-- The parameter was named company_id, which is also a column on reports, so
-- every reference to it was ambiguous and the function could not run at all.
-- Renamed rather than qualified: a parameter that shadows a column is a trap for
-- whoever edits it next.
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
     where r.target_company_id = p_company_id
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

grant execute on function public.get_company_trends(uuid) to authenticated;

-- ============================================================================
-- 4) Search
-- ============================================================================
-- The declared return type has created_at as timestamp without time zone and the
-- column is timestamptz, so the shapes never matched and every call fell through
-- to the ILIKE fallback. Cast rather than change the signature: api.ts and the
-- search screen both read this shape.
--
-- Ranked by similarity so an exact CR number or an exact name comes first, which
-- is what the fallback could not do and the reason this function exists.
create or replace function public.search_companies_fts(
  search_query text,
  limit_val integer default 20,
  offset_val integer default 0
)
returns table (
  id uuid, name varchar, cr_number varchar,
  sector varchar, city varchar, created_at timestamp without time zone
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.id, c.name::varchar, c.cr_number::varchar,
         c.sector::varchar, c.city::varchar,
         c.created_at::timestamp
    from public.companies c
   where public.get_current_user_id() is not null
     and c.approved
     and (
       c.cr_number = trim(search_query)
       or c.name ilike '%' || trim(search_query) || '%'
       or c.commercial_name ilike '%' || trim(search_query) || '%'
     )
   order by
     (c.cr_number = trim(search_query)) desc,
     (c.name = trim(search_query)) desc,
     similarity(c.name, trim(search_query)) desc,
     c.name
   limit greatest(1, least(limit_val, 100))
  offset greatest(0, offset_val);
$fn$;

grant execute on function public.search_companies_fts(text, integer, integer) to authenticated;
revoke all on function public.search_companies_fts(text, integer, integer) from public, anon;

-- ============================================================================
-- 5) Autocomplete
-- ============================================================================
-- SELECT DISTINCT with an ORDER BY on an expression that is not selected is
-- illegal, and that is exactly what it did. DISTINCT is not needed here at all —
-- id is unique — so removing it fixes the query and the ordering together.
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
     and (c.name ilike trim(search_query) || '%'
          or c.cr_number like trim(search_query) || '%')
   order by
     (c.name ilike trim(search_query) || '%') desc,
     length(c.name),
     c.name
   limit greatest(1, least(limit_val, 25));
$fn$;

grant execute on function public.autocomplete_companies(text, integer) to authenticated;
revoke all on function public.autocomplete_companies(text, integer) from public, anon;

-- ============================================================================
-- Verify by calling all five, which is what nobody did
-- ============================================================================
do $blk$
declare
  v_admin text; v_co uuid; v_n int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_co from public.companies where approved limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select count(*) into v_n from public.get_company_reports_summary(v_co);
  raise notice 'summary: % صف', v_n;

  select count(*) into v_n from public.get_company_reports_timeline(v_co, 5);
  raise notice 'timeline: % صف', v_n;

  select count(*) into v_n from public.get_company_trends(v_co);
  raise notice 'trends: % صف', v_n;

  select count(*) into v_n from public.search_companies_fts('ا', 5, 0);
  raise notice 'search: % صف', v_n;

  select count(*) into v_n from public.autocomplete_companies('ا', 5);
  raise notice 'autocomplete: % صف', v_n;

  -- And search must stay closed to anyone without a session, since 059.
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.search_companies_fts('ا', 5, 0);
  if v_n > 0 then
    raise exception 'البحث يُجيب بلا جلسة';
  end if;

  raise notice '✅ الخمس تعمل · والبحث مغلق أمام المجهول';
end $blk$;
