-- Migration: 058_anonymous_write_and_schema_disclosure.sql
-- Purpose: an anonymous caller could recompute every trust score, and read the
--          whole schema's constraints.
--
-- Both found by probe-anon-rpc, which calls every browser-reachable function
-- with no session. Neither was visible by reading the definitions.
--
-- ============================================================================
-- 1) recompute_all_trust_scores() — an unauthenticated write
-- ============================================================================
-- It ran. The probe called it with the anon key and it returned 12, having
-- recomputed twelve companies' scores. Anyone on the internet could loop it:
-- every call rewrites trust_scores for the whole platform, which is both a write
-- nobody authorised and as much load as the caller cares to generate.
--
-- Recomputing is an administrative act — the model changed, or a correction was
-- made. It is not something a visitor does.

create or replace function public.recompute_all_trust_scores()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_company record;
  v_n integer := 0;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'إعادة احتساب مؤشرات الثقة متاحة لإدارة مرصد فقط'
      using errcode = '42501';
  end if;

  for v_company in select id from public.companies loop
    perform public.compute_trust_score(v_company.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end $fn$;

comment on function public.recompute_all_trust_scores is
  'إعادة احتساب كل مؤشرات الثقة — لإدارة مرصد فقط، وكان أي مجهول يستطيع تشغيلها';

revoke all on function public.recompute_all_trust_scores() from public, anon;
grant execute on function public.recompute_all_trust_scores() to authenticated;

-- ============================================================================
-- 2) list_check_constraints() — the schema, to anyone
-- ============================================================================
-- Returns every CHECK constraint in the database with its definition: the exact
-- vocabulary of every status column, every category, every role. It exists for
-- the verification scripts, which connect as the owner over a direct connection
-- and never needed a browser-facing grant.
--
-- The grant is removed rather than a guard added. A function whose only callers
-- are server-side scripts should not be reachable from a browser at all — a
-- guard would still leave it in the surface area.

revoke all on function public.list_check_constraints() from public, anon, authenticated;

comment on function public.list_check_constraints is
  'قيود CHECK — لأدوات التحقّق عبر اتصال المالك المباشر، وليست متاحة من المتصفح';

-- ============================================================================
-- 3) Verify with no session
-- ============================================================================
do $blk$
declare v_ok boolean := false;
begin
  perform set_config('request.jwt.claims', '', true);

  begin
    perform public.recompute_all_trust_scores();
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'recompute_all_trust_scores ما زالت تعمل بلا جلسة';
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'list_check_constraints'
       and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'list_check_constraints ما زالت ممنوحة لدور المتصفح';
  end if;

  raise notice '✅ لا كتابة مجهولة · لا كشف للمخطط';
end $blk$;
