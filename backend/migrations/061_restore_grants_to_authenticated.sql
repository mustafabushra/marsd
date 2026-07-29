-- Migration: 061_restore_grants_to_authenticated.sql
-- Purpose: 060 revoked twelve functions on the claim that nothing called them.
--          Ten of them are called. This restores those ten to signed-in users
--          only, which is what 060 should have done in the first place.
--
-- ============================================================================
-- The mistake
-- ============================================================================
-- 060 said "None of the six has a caller in the application" and revoked the
-- grants outright. The search behind that sentence was
--
--   grep -rl "$fn" src/pages/*.jsx src/lib/*.js
--
-- which does not look at .ts files, and every one of these is called from
-- src/lib/api.ts. get_credit_balance is also called from src/hooks/useSystemStatus.js.
--
-- The result was immediate and total: an administrator opening any company's
-- trust report got "permission denied for function get_company_knowledge_base".
-- Search, autocomplete, the credit balance, the report timeline and the whole
-- knowledge base went with it.
--
-- The finding that started this was real — these functions are SECURITY DEFINER
-- and answered callers with no session at all, walking around the registry
-- lockdown in 059. The conclusion drawn from it was not. Revoking is the right
-- answer for a function nobody calls; for a function the product depends on, the
-- answer is to grant it to the people who should have it.
--
-- ============================================================================
-- The correct boundary
-- ============================================================================
-- PostgREST maps the anon key to role `anon` and a signed-in Clerk session to
-- role `authenticated`. These were granted to PUBLIC, which includes anon — that
-- is the whole bug. Granting to `authenticated` alone closes the anonymous hole
-- and leaves the application working, without a line of plpgsql.

do $blk$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
         -- src/lib/api.ts — the knowledge base
         'get_company_knowledge_base',
         'search_company_knowledge_base',
         'get_report_knowledge_base',
         'search_report_knowledge_base',
         -- src/lib/api.ts — the trust report's panels
         'get_company_reports_summary',
         'get_company_reports_timeline',
         'get_company_trends',
         -- src/lib/api.ts — search, which 059 made an account-only feature
         'autocomplete_companies',
         'search_companies_fts',
         -- src/lib/api.ts and src/hooks/useSystemStatus.js
         'get_credit_balance')
  loop
    execute format('grant execute on function %s to authenticated', fn.sig);
    n := n + 1;
    raise notice 'أُعيدت للمسجّلين: %', fn.sig;
  end loop;
  raise notice 'الدوال المُعادة: %', n;
end $blk$;

-- check_duplicate_report and tenant_limit stay revoked. Those two really do have
-- no caller — they are reached by triggers and by other SECURITY DEFINER
-- functions, which do not go through these grants. Verified by searching the
-- whole of src/ and api/, not two globs of it.

-- ============================================================================
-- A tenant id in the request is not proof of anything
-- ============================================================================
-- get_credit_balance takes p_tenant_id. Granting it to `authenticated` stops an
-- anonymous caller, and does nothing about a signed-in one passing a different
-- company's id — the balance is a business figure and this is a multi-tenant
-- platform.

create or replace function public.get_credit_balance(p_tenant_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller_tenant uuid;
begin
  select tenant_id into v_caller_tenant
    from public.users where id = public.get_current_user_id();

  -- Marsad's own staff read any tenant's balance; a company reads its own.
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and (v_caller_tenant is null or v_caller_tenant is distinct from p_tenant_id) then
    return 0;
  end if;

  return coalesce((
    select sum(amount)::int from public.credits_ledger where tenant_id = p_tenant_id
  ), 0);
end $fn$;

grant execute on function public.get_credit_balance(uuid) to authenticated;

-- ============================================================================
-- Verify both halves: signed in works, anonymous does not
-- ============================================================================
do $blk$
declare
  v_admin  text;
  v_tenant uuid;
  v_n      int;
begin
  select id into v_admin from public.users
   where role = 'platform_admin' and status = 'active' limit 1;
  select id into v_tenant from public.tenants limit 1;

  -- As an administrator, the knowledge base must answer.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  select count(*) into v_n from public.search_company_knowledge_base('a', null, null, 5, 0);
  raise notice 'مدير مرصد يرى % شركة في مستودع المعرفة', v_n;
  if public.get_credit_balance(v_tenant) is null then
    raise exception 'رصيد النقاط لا يُقرأ للإدارة';
  end if;

  -- With no session, nothing.
  perform set_config('request.jwt.claims', '', true);
  if public.get_credit_balance(v_tenant) <> 0 then
    raise exception 'get_credit_balance تُجيب بلا جلسة';
  end if;

  -- And the grants are on `authenticated`, never anon or PUBLIC.
  select count(*) into v_n
    from information_schema.role_routine_grants
   where routine_schema = 'public'
     and grantee in ('anon', 'PUBLIC')
     and routine_name in (
       'get_company_knowledge_base', 'search_company_knowledge_base',
       'get_report_knowledge_base', 'search_report_knowledge_base',
       'get_company_reports_summary', 'get_company_reports_timeline',
       'get_company_trends', 'autocomplete_companies', 'search_companies_fts',
       'get_credit_balance');
  if v_n > 0 then
    raise exception 'ما زالت % صلاحية ممنوحة للمجهول', v_n;
  end if;

  raise notice '✅ المسجّلون يعملون · المجهول ممنوع';
end $blk$;
