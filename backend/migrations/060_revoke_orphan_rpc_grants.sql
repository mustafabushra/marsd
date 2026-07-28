-- Migration: 060_revoke_orphan_rpc_grants.sql
-- Purpose: six functions nothing calls were answering anonymous callers, and
--          three of them handed out the registry that 059 had just closed.
--
-- ============================================================================
-- What the probe found
-- ============================================================================
-- probe-anon-rpc had been skipping these because their arguments could not be
-- guessed. Fed real ids, every one replied to a request with no session:
--
--   get_company_knowledge_base     → the companies, in full
--   search_company_knowledge_base  → the companies, searchable
--   get_report_knowledge_base      → the reports themselves
--   search_report_knowledge_base   → the reports, searchable
--   check_duplicate_report         → whether tenant X has reported company Y
--   tenant_limit                   → any tenant's plan ceiling
--
-- The first four matter most: 059 closed the companies and trust_scores tables
-- to anonymous readers minutes earlier, and these walked straight around it.
-- They are SECURITY DEFINER, so they run as the owner and RLS does not apply —
-- a table policy is not a boundary when a function beside it ignores it.
--
-- That is the lesson worth keeping: restricting a table restricts the table. It
-- says nothing about the functions that read it.
--
-- ============================================================================
-- The fix is the grant, not a guard
-- ============================================================================
-- None of the six has a caller in the application. The knowledge base screens
-- use kb_companies() and kb_reports(), added in 039 and gated on the caller;
-- these are what those replaced and nobody deleted. tenant_limit and
-- check_duplicate_report are called by triggers and by other SECURITY DEFINER
-- functions, which do not go through these grants.
--
-- So no guard is added. A guard would leave them in the browser's reach while
-- asserting they are safe there, and the next person to widen one would have no
-- reason to think twice. Nothing the browser does not call should be callable
-- from the browser.

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
         'get_company_knowledge_base',
         'search_company_knowledge_base',
         'get_report_knowledge_base',
         'search_report_knowledge_base',
         'check_duplicate_report',
         'tenant_limit',
         'get_credit_balance',
         'get_company_reports_summary',
         'get_company_reports_timeline',
         'get_company_trends',
         'autocomplete_companies',
         'search_companies_fts')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    n := n + 1;
    raise notice 'سُحبت صلاحية المتصفح: %', fn.sig;
  end loop;
  raise notice 'إجمالي الدوال المسحوبة: %', n;
end $blk$;

-- ============================================================================
-- Verify: not one of them answers without a session
-- ============================================================================
do $blk$
declare v_n int;
begin
  select count(*) into v_n
    from information_schema.role_routine_grants
   where routine_schema = 'public'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_name in (
       'get_company_knowledge_base', 'search_company_knowledge_base',
       'get_report_knowledge_base', 'search_report_knowledge_base',
       'check_duplicate_report', 'tenant_limit', 'get_credit_balance',
       'get_company_reports_summary', 'get_company_reports_timeline',
       'get_company_trends', 'autocomplete_companies', 'search_companies_fts');
  if v_n > 0 then
    raise exception 'ما زالت % صلاحية متصفح قائمة', v_n;
  end if;

  -- The replacements the screens actually use must still be callable.
  if not exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'kb_companies' and grantee = 'authenticated') then
    raise exception 'kb_companies لم تعد قابلة للنداء — كُسرت شاشة مستودع المعرفة';
  end if;

  raise notice '✅ الدوال اليتيمة خارج متناول المتصفح · بدائلها تعمل';
end $blk$;
