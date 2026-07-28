-- Migration: 059_registry_requires_an_account.sql
-- Purpose: the company registry and the trust scores stop being readable
--          without an account, and the free plan gets the ten searches it was
--          agreed to have.
--
-- ============================================================================
-- 1) The registry
-- ============================================================================
-- companies_select_all was `using (true)` for role `public`, so anyone holding
-- the anon key that ships inside the browser bundle could download the whole
-- table — names, CR numbers, sectors, cities — with one request and no account.
--
-- That is not a leak of something incidental. The registry is what the platform
-- is. And it made the plans dishonest: they sell a monthly search allowance, and
-- an allowance guards nothing when the data behind it can be fetched directly.
-- Nobody buys what they already have.
--
-- The marketing pages — /, /about, /pricing, /partners, /faq, /contact — read
-- nothing from the database, so a visitor sees exactly what they saw before.
-- /company-onboarding does read companies, and is reached only after signing up,
-- so its caller is authenticated.

drop policy if exists companies_select_all on public.companies;

create policy companies_select_authenticated on public.companies
  for select
  to authenticated
  using (true);

comment on table public.companies is
  'سجلّ الشركات — يتطلّب حساباً؛ كان مقروءاً بالكامل لأي زائر بلا تسجيل';

-- ============================================================================
-- 2) The scores
-- ============================================================================
-- Same policy shape, and a stronger reason: the trust score is the product. It
-- is what a paying customer pays to see, and it was being served to anyone who
-- asked. get_company_report() already gates the full report behind the plan's
-- entitlements — but reading the trust_scores table directly went around it.

drop policy if exists trust_scores_select_all on public.trust_scores;

create policy trust_scores_select_authenticated on public.trust_scores
  for select
  to authenticated
  using (true);

comment on table public.trust_scores is
  'مؤشرات الثقة — تتطلّب حساباً؛ التقرير الكامل يبقى محكوماً باستحقاقات الباقة';

-- ============================================================================
-- 3) The free plan's search allowance
-- ============================================================================
-- searches_per_month was 1. The agreed figure is 10. One search a month ends the
-- trial before the customer has understood what they are looking at.
--
-- Written as a merge into the existing limits so nothing else in that document
-- is disturbed, and matched on code rather than the Arabic name.

update public.plans
   set limits = coalesce(limits, '{}'::jsonb) || jsonb_build_object('searches_per_month', 10)
 where code = 'free';

-- ============================================================================
-- 4) Verify
-- ============================================================================
do $blk$
declare
  v_n int;
  v_searches int;
begin
  -- No policy may still hand either table to an anonymous caller.
  select count(*) into v_n
    from pg_policies
   where tablename in ('companies', 'trust_scores')
     and cmd = 'SELECT'
     and ('anon' = any(roles) or 'public' = any(roles));
  if v_n > 0 then
    raise exception 'ما زالت % سياسة تفتح السجلّ للزوّار', v_n;
  end if;

  select (limits ->> 'searches_per_month')::int into v_searches
    from public.plans where code = 'free';
  if v_searches <> 10 then
    raise exception 'الباقة المجانية % بحثاً لا 10', v_searches;
  end if;

  raise notice '✅ السجلّ والمؤشرات تتطلّب حساباً · المجانية 10 عمليات بحث';
end $blk$;
