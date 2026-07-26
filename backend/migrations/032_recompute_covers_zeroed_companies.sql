-- Migration: 032_recompute_covers_zeroed_companies.sql
-- Purpose: a company that loses its last approved report must lose its score.
--
-- recompute_all_trust_scores walked the companies that have an approved report.
-- A company whose reports were all rejected, withdrawn or deleted has none — so
-- it was never visited, and its old row stayed exactly as it was. 031 left one
-- behind: شركة النور للتجارة has no approved reports, tier 'none' and score 0,
-- and still carries risk_band 'high' from a computation that no longer applies.
--
-- Zero with a high-risk band is the worst possible way to be wrong about this.
-- The company is not high risk; nothing is known about it, and the interface has
-- a state for that. Presenting an absence of evidence as evidence of default is
-- a defamation risk on a platform whose product is a public reputation number.
--
-- The set to recompute is every company that has an approved report, plus every
-- company that already carries a score — because losing the reason for a score
-- is exactly the case that needs revisiting.
--
-- Idempotent.

create or replace function public.recompute_all_trust_scores()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  n integer := 0;
begin
  if public.get_current_user_id() is not null and not public.is_platform_admin() then
    raise exception 'إعادة احتساب الدرجات متاحة لإدارة المنصة فقط';
  end if;

  for r in
    select distinct id from (
      select target_company_id as id from public.reports where status = 'approved'
      union
      select company_id       as id from public.trust_scores
    ) s
    where id is not null
  loop
    perform public.compute_trust_score(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.recompute_all_trust_scores() from public;
grant execute on function public.recompute_all_trust_scores() to authenticated, service_role;

do $$
declare
  n int;
  stragglers int;
begin
  select public.recompute_all_trust_scores() into n;

  select count(*) into stragglers
    from public.trust_scores
   where tier = 'none' and risk_band <> 'none';

  raise notice 'أُعيد احتساب % شركة', n;
  if stragglers > 0 then
    raise exception 'ما زالت % شركة بلا تقييم تحمل نطاق مخاطر', stragglers;
  end if;
  raise notice 'لا توجد شركة بلا تقييم تحمل نطاق مخاطر';
end $$;
