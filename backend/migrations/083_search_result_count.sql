-- Migration: 083_search_result_count.sql
-- Purpose: search has no way to say how many results there are.
--
-- ============================================================================
-- Why this is needed now and was not before
-- ============================================================================
-- search_companies_fts returns one page. api.ts reported `total` as the length
-- of that page, so a search matching 100 companies would say "20 results, 1
-- page" and the user could never reach page 2.
--
-- Nobody saw it because the function has never run: every call errored and fell
-- through to the ILIKE branch, which asks PostgREST for count: 'exact' and gets
-- a real total. Fixing search in 081 would have quietly traded a working pager
-- for a broken one.
--
-- Same matching rules as search_companies_fts, deliberately duplicated rather
-- than shared: a count that drifts from the list it counts is worse than one
-- that repeats three predicates.

create or replace function public.count_companies_fts(search_query text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select count(*)::int
    from public.companies c
   where public.get_current_user_id() is not null
     and c.approved
     and (
       c.cr_number = trim(search_query)
       or c.name ilike '%' || trim(search_query) || '%'
       or c.commercial_name ilike '%' || trim(search_query) || '%'
     );
$fn$;

grant execute on function public.count_companies_fts(text) to authenticated;
revoke all on function public.count_companies_fts(text) from public, anon;

-- ============================================================================
-- The count must equal the rows, at every page size
-- ============================================================================
do $blk$
declare
  v_admin text; v_term text; v_count int; v_rows int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- A term that matches most of the registry, so paging is actually exercised.
  select substr(name, 1, 3) into v_term from public.companies where approved limit 1;

  select public.count_companies_fts(v_term) into v_count;
  select count(*) into v_rows from public.search_companies_fts(v_term, 1000, 0);

  if v_count <> v_rows then
    raise exception 'العدّ % لا يساوي النتائج %', v_count, v_rows;
  end if;

  -- And the last page must not be empty when the count says it exists.
  if v_count > 1 then
    select count(*) into v_rows from public.search_companies_fts(v_term, 1, v_count - 1);
    if v_rows <> 1 then
      raise exception 'الصفحة الأخيرة فارغة رغم أن العدّ %', v_count;
    end if;
  end if;

  perform set_config('request.jwt.claims', '', true);
  select public.count_companies_fts(v_term) into v_count;
  if v_count <> 0 then
    raise exception 'العدّ يُجيب بلا جلسة';
  end if;

  raise notice '✅ العدّ يطابق النتائج · ومغلق بلا جلسة';
end $blk$;
