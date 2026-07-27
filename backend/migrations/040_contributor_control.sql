-- Migration: 040_contributor_control.sql
-- Purpose: let Marsad see which companies file bad reports, and stop them
-- filing without shutting their account down.
--
-- Knowing who filed a report is not the same as being able to do anything about
-- it. The only lever today is suspending the tenant, which stops them searching,
-- watching, and using everything they may have paid for — a blunt instrument for
-- a problem that is usually narrow: a company using reports against a
-- competitor.
--
-- Two things are missing and both are here. A read: the signals that distinguish
-- a company filing in good faith from one filing to damage someone. And a write:
-- suspending contribution alone, so a company that abuses reporting keeps the
-- account it pays for and loses the thing it abused.
--
-- On the signals — none of them proves malice, and the function does not claim
-- to. A company legitimately deals with its competitors, and one bad quarter
-- produces a burst of honest reports. They are ordered by how hard they are to
-- explain innocently, and the last word is a person's. A platform that
-- automatically silenced whoever tripped a threshold would be a worse instrument
-- than the one it replaced.
--
-- Idempotent.

-- ============================================================================
-- 1) The lever
-- ============================================================================

alter table public.tenants
  add column if not exists reporting_suspended boolean not null default false,
  add column if not exists reporting_suspended_reason text,
  add column if not exists reporting_suspended_at timestamptz,
  add column if not exists reporting_suspended_by text;

comment on column public.tenants.reporting_suspended is
  'يمنع تقديم تقارير جديدة دون تعطيل الحساب — لمعالجة البلاغات الكيدية';

-- Enforced at the insert, not in a screen. A company whose contribution is
-- suspended must be unable to file from any path, including one written later.
create or replace function public.guard_reporting_suspended()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_suspended boolean;
  v_reason    text;
begin
  if public.get_current_user_id() is null or public.is_platform_admin() then
    return new;
  end if;

  select reporting_suspended, reporting_suspended_reason
    into v_suspended, v_reason
    from public.tenants where id = new.reporter_tenant_id;

  if coalesce(v_suspended, false) then
    raise exception 'أُوقف تقديم التقارير من حسابك: %',
      coalesce(v_reason, 'راجع إدارة مرصد')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_reporting_suspended_guard on public.reports;
create trigger reports_reporting_suspended_guard
  before insert on public.reports
  for each row execute function public.guard_reporting_suspended();

-- ============================================================================
-- 2) The signals
-- ============================================================================
-- What a reviewer would look for by hand, computed in one place so every screen
-- reads the same numbers and nobody has to remember the joins.

create or replace function public.contributor_risk(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v            jsonb;
  v_sector     text;
  v_company_id uuid;
  v_total      int;
  v_approved   int;
  v_rejected   int;
  v_overturned int;
  v_same_sector int;
  v_max_burst  int;
  v_top_target int;
  v_top_name   text;
  v_flags      text[] := '{}';
begin
  if not public.is_platform_admin() then
    raise exception 'سجل المساهم متاح لإدارة المنصة فقط';
  end if;

  select t.company_id, co.sector into v_company_id, v_sector
    from public.tenants t
    left join public.companies co on co.id = t.company_id
   where t.id = p_tenant_id;

  select count(*),
         count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'rejected')
    into v_total, v_approved, v_rejected
    from public.reports where reporter_tenant_id = p_tenant_id;

  -- Reports this company filed that were withdrawn because the subject objected
  -- and Marsad agreed. The strongest single signal on the platform: not a report
  -- that failed review, but one that passed review and turned out to be wrong.
  select count(*) into v_overturned
    from public.disputes d
    join public.reports r on r.id = d.report_id
   where r.reporter_tenant_id = p_tenant_id and d.status = 'upheld';

  -- Filed against companies in its own sector. A company deals with its
  -- competitors, so this is context and not an accusation — but a reporter whose
  -- every target is a direct competitor is worth a closer look.
  select count(*) into v_same_sector
    from public.reports r
    join public.companies co on co.id = r.target_company_id
   where r.reporter_tenant_id = p_tenant_id
     and v_sector is not null
     and co.sector = v_sector
     and r.target_company_id is distinct from v_company_id;

  -- The most reports filed in any seven-day window. Honest reporting follows
  -- deals, which arrive spread out; a campaign arrives at once.
  select coalesce(max(c), 0) into v_max_burst
    from (
      select count(*) as c
        from public.reports r1
       where r1.reporter_tenant_id = p_tenant_id
       group by date_trunc('week', r1.created_at)
    ) w;

  -- Repeatedly reporting the same company. BR-05 already blocks a second report
  -- on one company inside 90 days, so several means a sustained pattern.
  select count(*), max(co.name) into v_top_target, v_top_name
    from public.reports r
    join public.companies co on co.id = r.target_company_id
   where r.reporter_tenant_id = p_tenant_id
   group by r.target_company_id
   order by count(*) desc
   limit 1;

  -- Ordered by how hard each is to explain innocently.
  if v_overturned > 0 then
    v_flags := v_flags || format('%s تقرير سُحب بعد اعتراض الشركة وقبوله', v_overturned);
  end if;
  if v_total >= 3 and v_rejected::numeric / nullif(v_total, 0) >= 0.4 then
    v_flags := v_flags || format('%s%% من تقاريرها مرفوضة', round(v_rejected::numeric / v_total * 100));
  end if;
  if v_same_sector >= 3 and v_same_sector::numeric / nullif(v_total, 0) >= 0.6 then
    v_flags := v_flags || format('%s من %s تقرير على منافسين في نفس القطاع', v_same_sector, v_total);
  end if;
  if v_max_burst >= 5 then
    v_flags := v_flags || format('%s تقارير في أسبوع واحد', v_max_burst);
  end if;
  if v_top_target >= 3 then
    v_flags := v_flags || format('%s تقارير على «%s» وحدها', v_top_target, v_top_name);
  end if;

  select jsonb_build_object(
    'tenant', (select jsonb_build_object(
                 'id', t.id, 'name', t.name, 'cr_number', t.cr_number,
                 'status', t.status, 'sector', v_sector,
                 'reporting_suspended', t.reporting_suspended,
                 'reporting_suspended_reason', t.reporting_suspended_reason,
                 'reporting_suspended_at', t.reporting_suspended_at)
                 from public.tenants t where t.id = p_tenant_id),
    'reports', jsonb_build_object(
      'total', v_total, 'approved', v_approved, 'rejected', v_rejected,
      'overturned', v_overturned,
      'reject_rate', case when v_total > 0 then round(v_rejected::numeric / v_total * 100) else 0 end),
    'patterns', jsonb_build_object(
      'same_sector', v_same_sector,
      'max_reports_in_a_week', v_max_burst,
      'most_reported_target', v_top_name,
      'most_reported_count', coalesce(v_top_target, 0)),
    'companies_added', (select count(*) from public.audit_logs
                         where action = 'company_add_requested' and tenant_id = p_tenant_id),
    'credits_earned', (select coalesce(sum(amount), 0) from public.credits_ledger
                        where tenant_id = p_tenant_id and amount > 0),
    'flags', to_jsonb(v_flags),
    -- A count, not a verdict. None of these proves bad faith and the function
    -- does not pretend otherwise; it says how many things a person should look
    -- at, and the person decides.
    'flag_count', coalesce(array_length(v_flags, 1), 0)
  ) into v;

  return v;
end;
$$;

revoke all on function public.contributor_risk(uuid) from public;
grant execute on function public.contributor_risk(uuid) to authenticated, service_role;

-- ============================================================================
-- 3) Every contributor at once, so a pattern can be found without knowing where
--    to look
-- ============================================================================

create or replace function public.contributors_overview()
returns table (
  tenant_id uuid, tenant_name text, cr_number text, sector text,
  reports_total integer, reports_approved integer, reports_rejected integer,
  reports_overturned integer, reject_rate integer,
  companies_added integer, reporting_suspended boolean, last_report timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    t.id, t.name::text, t.cr_number::text, co.sector::text,
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id and r.status = 'approved'),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id and r.status = 'rejected'),
    (select count(*)::int from public.disputes d
       join public.reports r on r.id = d.report_id
      where r.reporter_tenant_id = t.id and d.status = 'upheld'),
    (select case when count(*) > 0
                 then round(count(*) filter (where r.status = 'rejected')::numeric / count(*) * 100)::int
                 else 0 end
       from public.reports r where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.audit_logs a
      where a.action = 'company_add_requested' and a.tenant_id = t.id),
    t.reporting_suspended,
    (select max(r.created_at) from public.reports r where r.reporter_tenant_id = t.id)
  from public.tenants t
  left join public.companies co on co.id = t.company_id
  where public.is_platform_admin()
  order by (select count(*) from public.reports r where r.reporter_tenant_id = t.id) desc
$$;

revoke all on function public.contributors_overview() from public;
grant execute on function public.contributors_overview() to authenticated, service_role;

do $$
begin
  raise notice 'contributor_risk + إيقاف التقارير وحدها: جاهز';
end $$;
