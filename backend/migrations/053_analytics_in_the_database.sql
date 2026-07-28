-- Migration: 053_analytics_in_the_database.sql
-- Purpose: compute the admin analytics where the data lives.
--
-- ============================================================================
-- Why
-- ============================================================================
-- AdminTenantAnalytics pulled seven whole tables into the browser — tenants,
-- users, reports, watchlist_items, subscriptions, plans, credits_ledger — and
-- joined and counted them there. AdminReportAnalytics pulled every report and
-- derived a dozen figures from the array.
--
-- PostgREST caps a request at 1000 rows and returns 200 without saying it
-- truncated. So every one of those numbers is correct until a table passes a
-- thousand rows and then quietly stops being correct: "نقاط متداولة" becomes the
-- sum of some credits, a tenant's report count becomes a count of its recent
-- reports, and nothing anywhere says so. Nobody discovers this by looking at the
-- screen — the number still looks like a number.
--
-- This is the same fault as the reject rate in AdminReports, which decided
-- whether to suspend a contributor. Counting in the browser is only ever correct
-- by accident of size.
--
-- Restricted to Marsad staff: these read across every tenant, so they must not
-- be callable by a customer.

-- ============================================================================
-- 1) Per-tenant rows
-- ============================================================================
create or replace function public.tenant_analytics()
returns table (
  tenant_id     uuid,
  name          text,
  status        text,
  created_at    timestamptz,
  claimed       boolean,
  plan_name     text,
  plan_code     text,
  users_active  integer,
  reports_total integer,
  reports_approved integer,
  watchlist     integer,
  credits       integer,
  last_login    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name::text,
    t.status::text,
    t.created_at,
    t.company_id is not null,
    coalesce(pl.name, 'مجاني')::text,
    coalesce(pl.code, 'free')::text,
    (select count(*)::int from public.users u
      where u.tenant_id = t.id and u.status = 'active'),
    (select count(*)::int from public.reports r
      where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.reports r
      where r.reporter_tenant_id = t.id and r.status = 'approved'),
    (select count(*)::int from public.watchlist_items w
      where w.tenant_id = t.id),
    (select coalesce(sum(c.amount), 0)::int from public.credits_ledger c
      where c.tenant_id = t.id),
    (select max(u.last_login_at) from public.users u where u.tenant_id = t.id)
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id and s.status = 'active'
  left join public.plans pl on pl.id = s.plan_id
  where public.is_platform_admin() or public.is_reviewer()
  order by t.created_at desc;
$$;

grant execute on function public.tenant_analytics() to authenticated;

-- ============================================================================
-- 2) Report analytics
-- ============================================================================
-- Returned as one jsonb document rather than a wide row: the screen wants
-- several unrelated shapes — totals, two breakdowns and a monthly series — and
-- three round trips to build one card is worse than one document.
create or replace function public.report_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() and not public.is_reviewer() then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'total',          count(*),
    'pending',        count(*) filter (where status = 'pending_review'),
    'approved',       count(*) filter (where status = 'approved'),
    'rejected',       count(*) filter (where status = 'rejected'),
    'request_info',   count(*) filter (where status = 'request_info'),
    'defaults',       count(*) filter (where defaulted),
    -- Averaged over the reports that recorded a delay. Including the ones that
    -- did not would report an average delay across deals that were never late.
    'avg_delay',      coalesce(round(avg(delay_days) filter (where delay_days > 0)), 0),
    'total_value',    coalesce(sum(deal_value), 0),
    -- Median, not mean: one report reopened after a month would move a mean and
    -- misdescribe every other review.
    'median_review_hours', coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (approved_at - created_at)) / 3600
      ) filter (where approved_at is not null), 0)
  ) into v
  from public.reports;

  return v
    || jsonb_build_object('by_category', coalesce((
         select jsonb_object_agg(category, n) from (
           select category, count(*) n from public.reports
            where category is not null group by category) x), '{}'::jsonb))
    || jsonb_build_object('by_commitment', coalesce((
         select jsonb_object_agg(payment_commitment, n) from (
           select payment_commitment, count(*) n from public.reports
            where payment_commitment is not null group by payment_commitment) x), '{}'::jsonb))
    || jsonb_build_object('monthly', coalesce((
         select jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m) from (
           select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n
             from public.reports
            where created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) y), '[]'::jsonb));
end $$;

grant execute on function public.report_analytics() to authenticated;

-- ============================================================================
-- 3) Verify — call them, do not assume they parse
-- ============================================================================
-- Run as a real administrator, because both functions gate on the caller and
-- would return nothing to this session — which would look like a pass.
do $$
declare
  v_admin text;
  v_rows  int;
  v_doc   jsonb;
  v_real  int;
begin
  select id into v_admin from public.users
   where role = 'platform_admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception 'لا حساب إدارة نشط — تعذّر إثبات عمل التحليلات';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin)::text, true);

  select count(*) into v_rows from public.tenant_analytics();
  select count(*) into v_real from public.tenants;
  if v_rows <> v_real then
    raise exception 'tenant_analytics أعادت % صفاً و tenants فيها %', v_rows, v_real;
  end if;

  v_doc := public.report_analytics();
  select count(*) into v_real from public.reports;
  if (v_doc ->> 'total')::int <> v_real then
    raise exception 'report_analytics تقول % تقريراً والجدول فيه %',
      v_doc ->> 'total', v_real;
  end if;

  perform set_config('request.jwt.claims', '', true);

  raise notice '✅ التحليلات تُحسب في القاعدة — % كياناً · % تقريراً',
    v_rows, v_doc ->> 'total';
end $$;
