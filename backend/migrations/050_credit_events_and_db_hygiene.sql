-- Migration: 050_credit_events_and_db_hygiene.sql
-- Purpose: put the company_added trigger on the transition that actually is the
--          event, expose the granted amount to the screen, and clear the
--          duplicate policies and missing indexes found in the audit.
--
-- ============================================================================
-- 1) company_added fires on the wrong table
-- ============================================================================
-- 049 hung company_added on registration_requests.status. Reading the approval
-- screen afterwards shows that is not where it happens:
--
--   AdminRequests.approve() for kind 'add_company' updates
--   companies.approved = true. There is no registration_requests row in that
--   flow at all — registration_requests is a tenant onboarding itself, which is
--   not a contribution to the registry and must not earn.
--
-- A trigger on the wrong table is worse than none: it reports success and pays
-- nobody, and the screen would show "0 points" for a real contribution.

drop trigger if exists award_credits_on_registration_approved on public.registration_requests;
drop function if exists public.award_on_registration_approved();

-- companies carries no submitter column, so the contributor is the tenant whose
-- audit entry filed it — the same derivation AdminRequests uses to decide who to
-- notify. Reading it here means the screen and the ledger can no longer disagree
-- about who contributed.
create or replace function public.company_contributor_tenant(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select al.tenant_id
    from public.audit_logs al
   where al.action = 'company_add_requested'
     -- audit_logs.entity_id is text: the table records entities from several
     -- tables and not all of them are keyed by uuid.
     and al.entity_id = p_company_id::text
     and al.tenant_id is not null
   order by al.created_at asc
   limit 1;
$$;

create or replace function public.award_on_company_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contributor uuid;
begin
  if coalesce(new.approved, false) and not coalesce(old.approved, false) then
    v_contributor := public.company_contributor_tenant(new.id);
    if v_contributor is not null then
      perform public.grant_credits(
        v_contributor, 'company_added', 'companies', new.id, null);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists award_credits_on_company_approved on public.companies;
create trigger award_credits_on_company_approved
  after update on public.companies
  for each row execute function public.award_on_company_approved();

-- ============================================================================
-- 2) The screen reads what was granted; it no longer causes it
-- ============================================================================
-- Restricted to Marsad staff: the approval screens are the only callers, and a
-- customer reading arbitrary ledger rows is not something this needs to allow.
create or replace function public.credits_granted_for(
  p_source_table text,
  p_source_id    uuid,
  p_reason       text
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_amount integer;
begin
  if not public.is_platform_admin() and not public.is_reviewer() then
    return 0;
  end if;
  select amount into v_amount
    from public.credits_ledger
   where source_table = p_source_table
     and source_id = p_source_id
     and reason = p_reason
     and amount > 0
   limit 1;
  return coalesce(v_amount, 0);
end $$;

grant execute on function public.credits_granted_for(text, uuid, text) to authenticated;

-- ============================================================================
-- 3) company_data_requests has no tenant_id — and a screen reads one
-- ============================================================================
-- AdminRequests.contributorOf() selects `tenant_id` from company_data_requests
-- for the add_data and edit_data paths. The column does not exist; the request
-- errors, the contributor resolves to null, and the "your contribution was
-- accepted" notification has never been sent for a data request. The column it
-- means is requested_by_tenant_id, which the award path beside it already uses.
--
-- Fixed in the screen rather than by adding a column, because the correct value
-- is already stored. This view exists so the mistake cannot be repeated by name.
create or replace view public.company_data_request_contributors as
  select id, company_id, requested_by_tenant_id as tenant_id, status, request_type
    from public.company_data_requests;

comment on view public.company_data_request_contributors is
  'الاسم الصحيح للمساهم في طلب بيانات — العمود requested_by_tenant_id لا tenant_id';

-- ============================================================================
-- 4) Duplicate policies
-- ============================================================================
-- companies, plans and trust_scores each carried two SELECT policies with the
-- same meaning, added by successive migrations that never dropped the previous
-- one. Policies are OR'd, so tightening one later changes nothing while looking
-- like it should — the most expensive kind of harmless.
--
-- One policy per table per command, named for what it does.

drop policy if exists companies_select_policy on public.companies;
drop policy if exists plans_select_policy on public.plans;
drop policy if exists trust_scores_select_policy on public.trust_scores;

-- ============================================================================
-- 5) Foreign keys with no index
-- ============================================================================
-- Ten of them. Every join and every cascade check on these scans the whole
-- table. Invisible at 26 companies; the first thing that hurts at scale.

create index if not exists idx_subscriptions_plan_id            on public.subscriptions (plan_id);
create index if not exists idx_registration_requests_tenant_id  on public.registration_requests (tenant_id);
create index if not exists idx_claim_requests_tenant_id         on public.claim_requests (tenant_id);
create index if not exists idx_company_audit_log_actor_id       on public.company_audit_log (actor_id);
create index if not exists idx_report_audit_log_actor_id        on public.report_audit_log (actor_id);
create index if not exists idx_company_data_requests_tenant     on public.company_data_requests (requested_by_tenant_id);
create index if not exists idx_disputes_company_id              on public.disputes (company_id);
create index if not exists idx_disputes_raised_by_tenant_id     on public.disputes (raised_by_tenant_id);
create index if not exists idx_plan_change_requests_current     on public.plan_change_requests (current_plan_id);
create index if not exists idx_plan_change_requests_requested   on public.plan_change_requests (requested_plan_id);

-- The monthly-cap query in grant_credits filters by tenant, sign and date.
create index if not exists idx_credits_ledger_tenant_month
  on public.credits_ledger (tenant_id, created_at)
  where amount > 0;

-- idx_credits_ledger_tenant duplicated idx_credits_ledger_tenant_id exactly.
drop index if exists idx_credits_ledger_tenant;

-- ============================================================================
-- 6) Verify
-- ============================================================================
do $$
declare v_n int;
begin
  if not exists (select 1 from pg_trigger where tgname = 'award_credits_on_company_approved') then
    raise exception 'مشغّل منح النقاط على اعتماد الشركة غير موجود';
  end if;

  select count(*) into v_n from pg_constraint co
   where contype = 'f' and connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_index i
                      where i.indrelid = co.conrelid and i.indkey[0] = co.conkey[1]);
  if v_n > 0 then
    raise warning 'ما زال % مفتاحاً أجنبياً بلا فهرس', v_n;
  end if;

  select count(*) into v_n from pg_policies
   where tablename in ('companies','plans','trust_scores') and cmd = 'SELECT';
  raise notice 'سياسات القراءة المتبقية على الجداول الثلاثة: %', v_n;

  raise notice '✅ حدث المنح في مكانه · الفهارس مضافة · السياسات المكرّرة أُزيلت';
end $$;
