-- Migration: 066_full_report_sections.sql
-- Purpose: everything the trust report needs, in one call, plus a reason on
--          every score movement.
--
-- ============================================================================
-- Scope
-- ============================================================================
-- The product owner's report structure, built against the data that exists.
-- Sections that would render empty are not faked: tax registration is filled on
-- 0 of 27 companies, founding date on 10, and there is no bankruptcy source at
-- all. Those fields are returned as null and the interface omits the line rather
-- than printing a checkmark nobody verified — a green tick beside an unverified
-- fact is worse than no line, because the reader cannot tell the difference.
--
-- Percentile rank is computed but returned with its population, so the screen
-- can decline to show "18th of 430" while there are ten rated companies. A rank
-- over ten samples is not a statistic.

-- ============================================================================
-- 1) Why a score moved
-- ============================================================================
-- The history records movements without saying what caused them. The cause is
-- inferable from the row itself: more approved reports means one was approved,
-- fewer means one was removed — a dispute upheld — and the same count with a
-- different number means the rules or the company record changed.
alter table public.trust_score_history
  add column if not exists reason text;

comment on column public.trust_score_history.reason is
  'سبب تغيّر المؤشر — مستنتَج من فارق عدد التقارير المعتمدة';

create or replace function public.record_trust_score_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_reason text;
begin
  if tg_op = 'UPDATE' and new.score is not distinct from old.score then
    return new;
  end if;

  v_reason := case
    when tg_op = 'INSERT' then 'first_score'
    when coalesce(new.approved_reports, 0) > coalesce(old.approved_reports, 0) then 'report_approved'
    when coalesce(new.approved_reports, 0) < coalesce(old.approved_reports, 0) then 'report_removed'
    else 'data_or_rules_changed'
  end;

  insert into public.trust_score_history
    (company_id, score, risk_band, tier, approved_reports, layers, reason)
  values
    (new.company_id, new.score, new.risk_band, new.tier, new.approved_reports,
     new.breakdown -> 'layers', v_reason);

  return new;
end $fn$;

-- ============================================================================
-- 2) The whole report, in one call
-- ============================================================================
create or replace function public.company_report_full(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  co         record;
  ts         record;
  v_n        int;
  v_total    int;
  v_rejected int;
  v_pending  int;
  v_rank     int;
  v_peers    int;
  v jsonb;
begin
  if public.get_current_user_id() is null then
    return '{}'::jsonb;
  end if;

  select * into co from public.companies where id = p_company_id;
  if not found then return '{}'::jsonb; end if;

  select * into ts from public.trust_scores where company_id = p_company_id;

  select count(*) filter (where status = 'approved'),
         count(*),
         count(*) filter (where status = 'rejected'),
         count(*) filter (where status in ('pending_review', 'request_info'))
    into v_n, v_total, v_rejected, v_pending
    from public.reports where target_company_id = p_company_id;

  -- Rank among rated companies, returned with the population so the caller can
  -- decide whether it is worth showing.
  select count(*) + 1, (select count(*) from public.trust_scores where tier <> 'none')
    into v_rank, v_peers
    from public.trust_scores
   where tier <> 'none' and score > coalesce(ts.score, -1);

  v := jsonb_build_object(

    -- ─── the card ────────────────────────────────────────────────────────────
    'identity', jsonb_build_object(
      'name',          co.name,
      'sector',        co.sector,
      'city',          co.city,
      'entity_type',   co.entity_type,
      'enterprise_size', co.enterprise_size,
      'cr_number',     co.cr_number,
      'cr_status',     co.cr_status,
      'verified',      co.verified,
      'verified_at',   co.verified_at,
      'founded',       coalesce(co.founding_date::text, co.founded_year::text),
      -- null, not 0: a company with no recorded founding date has no age, and
      -- printing "0 سنة" would state something nobody knows.
      'age_years',     case
                         when co.founding_date is not null
                           then extract(year from age(current_date, co.founding_date))::int
                         when co.founded_year is not null
                           then extract(year from current_date)::int - co.founded_year
                         else null end,
      -- Returned so the interface can omit the line rather than tick it blind.
      'has_tax_id',    co.tax_id is not null,
      'cr_expiry',     co.cr_expiry_date,
      'computed_at',   ts.computed_at),

    -- ─── commercial behaviour ────────────────────────────────────────────────
    'behaviour', (
      select jsonb_build_object(
        'reports_total',    v_total,
        'reports_approved', v_n,
        'reports_rejected', v_rejected,
        'reports_pending',  v_pending,
        'on_time_pct',      case when v_n > 0
                              then round(count(*) filter (where payment_commitment = 'full') * 100.0 / v_n)
                              else null end,
        'avg_delay',        round(coalesce(avg(delay_days) filter (where delay_days > 0), 0)),
        'max_delay',        coalesce(max(delay_days), 0),
        'defaults',         count(*) filter (where defaulted),
        'counterparties',   count(distinct reporter_tenant_id))
      from public.reports
      where target_company_id = p_company_id and status = 'approved'),

    -- ─── market position ─────────────────────────────────────────────────────
    'market', jsonb_build_object(
      'rank',        case when ts.tier is distinct from 'none' then v_rank else null end,
      'rated_total', v_peers,
      'percentile',  case when ts.tier is distinct from 'none' and v_peers > 1
                       then round((v_peers - v_rank) * 100.0 / (v_peers - 1))
                       else null end,
      'sector_avg', (
        select round(avg(t2.score))
          from public.trust_scores t2
          join public.companies c2 on c2.id = t2.company_id
         where c2.sector is not distinct from co.sector
           and t2.tier <> 'none' and t2.company_id <> p_company_id)),

    -- ─── where the evidence comes from, without naming anyone ────────────────
    -- The reporting companies' own sectors. Diversity of source is the argument
    -- for the score's independence, and it can be made without identifying a
    -- single reporter.
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('sector', sector, 'count', n) order by n desc)
        from (
          select coalesce(c2.sector, 'غير محدّد') sector, count(distinct r.reporter_tenant_id) n
            from public.reports r
            join public.tenants t on t.id = r.reporter_tenant_id
            left join public.companies c2 on c2.id = t.company_id
           where r.target_company_id = p_company_id and r.status = 'approved'
           group by 1) s), '[]'::jsonb),

    -- ─── the last five outcomes ──────────────────────────────────────────────
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'payment', payment_commitment, 'delay', delay_days,
               'defaulted', defaulted, 'at', coalesce(approved_at, created_at))
             order by coalesce(approved_at, created_at) desc)
        from (
          select payment_commitment, delay_days, defaulted, approved_at, created_at
            from public.reports
           where target_company_id = p_company_id and status = 'approved'
           order by coalesce(approved_at, created_at) desc
           limit 5) x), '[]'::jsonb),

    -- ─── how good is the evidence ────────────────────────────────────────────
    -- The answer to "why should I trust this report", which is a different
    -- question from "should I trust this company" and the one nobody else asks.
    'quality', jsonb_build_object(
      'profile_completeness', (
        select round((
            (co.sector is not null)::int + (co.city is not null)::int
          + (co.main_activity is not null)::int + (co.entity_type is not null)::int
          + (co.phone is not null)::int + (co.official_email is not null)::int
          + (co.website is not null)::int
          + (coalesce(co.founding_date::text, co.founded_year::text) is not null)::int
        ) * 100.0 / 8)),
      'documents', (select count(*) from public.companies
                     where id = p_company_id and cr_file_url is not null),
      'last_report_at', (select max(coalesce(approved_at, created_at))
                           from public.reports
                          where target_company_id = p_company_id and status = 'approved'),
      'independent_sources', (select count(distinct reporter_tenant_id)
                                from public.reports
                               where target_company_id = p_company_id and status = 'approved'),
      'all_reviewed', v_pending = 0,
      'disputes_open', (select count(*) from public.disputes
                         where company_id = p_company_id and status = 'open'))
  );

  return v;
end $fn$;

revoke all on function public.company_report_full(uuid) from public, anon;
grant execute on function public.company_report_full(uuid) to authenticated;

-- ============================================================================
-- 3) Verify against the tables, as a real user
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_co    uuid;
  v jsonb;
  v_real  int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select company_id into v_co from public.trust_scores where tier <> 'none' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v := public.company_report_full(v_co);
  if v = '{}'::jsonb then raise exception 'التقرير لا يُرجع شيئاً لمستخدم مسجَّل'; end if;

  select count(*) into v_real from public.reports
   where target_company_id = v_co and status = 'approved';
  if (v #>> '{behaviour,reports_approved}')::int <> v_real then
    raise exception 'التقارير المعتمدة: الدالة % والجدول %',
      v #>> '{behaviour,reports_approved}', v_real;
  end if;

  perform set_config('request.jwt.claims', '', true);
  if public.company_report_full(v_co) <> '{}'::jsonb then
    raise exception 'التقرير يُقرأ بلا جلسة';
  end if;

  raise notice '✅ التقرير الكامل: % تقريراً · ترتيب % من % · اكتمال %٪',
    v #>> '{behaviour,reports_approved}',
    v #>> '{market,rank}', v #>> '{market,rated_total}',
    v #>> '{quality,profile_completeness}';
end $blk$;
