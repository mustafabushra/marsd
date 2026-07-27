-- Migration: 039_knowledge_base_provenance.sql
-- Purpose: make the knowledge repositories say where each record came from.
--
-- Both repositories describe what exists and nothing about who put it there.
-- The companies repository shows a name, a CR number and a completeness bar;
-- the reports repository shows a category and a date. Neither names the company
-- that contributed the record.
--
-- On a platform whose product is other companies' reputations, that is the
-- question that eventually gets asked, and it gets asked about a specific bad
-- row: this entry is wrong — who filed it, and what else have they filed. The
-- answer exists in the data but only as a join through audit_logs that no screen
-- should have to know how to write, and reports names its reporter in a column
-- that no repository screen selects.
--
-- Provenance belongs in the data rather than in one screen's query, so an export
-- or a future report carries it without anyone remembering to add it.
--
-- Both functions are platform-admin only. A repository listing every company
-- alongside who submitted it is exactly the map a bad actor would want.
--
-- Idempotent.

-- ============================================================================
-- 1) Companies, with their contributor
-- ============================================================================
-- companies carries no submitter column — a company can be added by anyone and
-- the row itself does not remember — so the trail is the audit entry written
-- when it was filed. That entry has only carried a tenant since 036, so older
-- records return null here and there is nothing to recover: the session that
-- wrote them is gone. Showing that honestly is the point.

create or replace function public.kb_companies(p_limit integer default 500)
returns table (
  id uuid, name text, cr_number text, unified_number text,
  sector text, main_activity text, city text, region text,
  entity_type text, cr_status text, founding_date date,
  website text, official_email text, phone text,
  source text, verified boolean, verified_at timestamptz, approved boolean,
  created_at timestamptz,
  contributor_tenant_id uuid, contributor_name text,
  contributor_user_id text, contributed_at timestamptz,
  reports_about integer, trust_score integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id, c.name::text, c.cr_number::text, c.unified_number::text,
    c.sector::text, c.main_activity::text, c.city::text, c.region::text,
    c.entity_type::text, c.cr_status::text, c.founding_date,
    c.website::text, c.official_email::text, c.phone::text,
    c.source::text, c.verified, c.verified_at, c.approved,
    c.created_at,
    origin.tenant_id, t.name::text, origin.actor_id, origin.created_at,
    (select count(*)::int from public.reports r
      where r.target_company_id = c.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = c.id)
  from public.companies c
  -- The first entry wins: a company is added once, and a later touch on the same
  -- row is not the contribution being traced.
  left join lateral (
    select a.tenant_id, a.actor_id, a.created_at
      from public.audit_logs a
     where a.action = 'company_add_requested'
       and a.entity_id = c.id::text
     order by a.created_at
     limit 1
  ) origin on true
  left join public.tenants t on t.id = origin.tenant_id
  where public.is_platform_admin()
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 500))
$$;

revoke all on function public.kb_companies(integer) from public;
grant execute on function public.kb_companies(integer) to authenticated, service_role;

-- ============================================================================
-- 2) Reports, with their reporter
-- ============================================================================
-- reports names its reporter in a column, so this needs no audit join — the
-- repository screen simply never selected it.

create or replace function public.kb_reports(p_limit integer default 500)
returns table (
  id uuid, status text, category text, payment_commitment text,
  delay_days integer, defaulted boolean, deal_value numeric, currency text,
  dealt_at timestamptz, submitted_at timestamptz, approved_at timestamptz, created_at timestamptz,
  target_company_id uuid, target_company text, target_sector text,
  reporter_tenant_id uuid, reporter_name text, reporter_cr text,
  disputed boolean, dispute_status text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.id, r.status::text, r.category::text, r.payment_commitment::text,
    r.delay_days, r.defaulted, r.deal_value, r.currency::text,
    r.dealt_at, r.submitted_at, r.approved_at, r.created_at,
    r.target_company_id, co.name::text, co.sector::text,
    r.reporter_tenant_id, rt.name::text, rt.cr_number::text,
    d.id is not null, d.status::text
  from public.reports r
  left join public.companies co on co.id = r.target_company_id
  left join public.tenants rt on rt.id = r.reporter_tenant_id
  -- Whether the subject objected, and how it went. A repository that lists a
  -- claim without saying it was contested and withdrawn is a repository of
  -- claims rather than of findings.
  left join lateral (
    select dd.id, dd.status from public.disputes dd
     where dd.report_id = r.id
     order by case dd.status when 'upheld' then 0 when 'open' then 1 else 2 end
     limit 1
  ) d on true
  where public.is_platform_admin()
  order by coalesce(r.approved_at, r.created_at) desc
  limit greatest(1, coalesce(p_limit, 500))
$$;

revoke all on function public.kb_reports(integer) from public;
grant execute on function public.kb_reports(integer) to authenticated, service_role;

do $$
declare n_traced int; n_total int;
begin
  select count(*), count(*) filter (where exists (
    select 1 from public.audit_logs a
     where a.action = 'company_add_requested' and a.entity_id = c.id::text and a.tenant_id is not null))
    into n_total, n_traced
    from public.companies c;
  raise notice 'شركات يُعرف من أضافها: % من %', n_traced, n_total;
  raise notice 'الباقي أُضيف قبل 036 وسجلّه بلا كيان — لا يمكن استرجاعه';
end $$;
