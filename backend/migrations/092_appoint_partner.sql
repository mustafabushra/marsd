-- Migration: 092_appoint_partner.sql
-- Purpose: Marsad appoints partners. 090 only let it answer applications.
--
-- ============================================================================
-- The path that was missing
-- ============================================================================
-- 090 built one way in: the company applies from /partners, Marsad approves or
-- rejects. That is a real path and it stays.
--
-- But it is not the main one. Partnership is offered to companies after they
-- register — Marsad decides who is worth having, and says so. The panel already
-- listed every registered company with its contribution, marked the ones that
-- meet the published terms, and then offered no way to act: the eligible rows
-- read "يستحق الدعوة" beside no button at all.
--
-- So: appointment, with no application required. The application record is still
-- written, because the decision needs a trail either way — it just records that
-- Marsad started it rather than the company.
--
-- Appointment is deliberately not restricted to companies that meet the terms.
-- The thresholds describe who may claim partnership; they were never meant to
-- stop Marsad from granting it. The screen warns when a company is below them,
-- and the reason is stored, so an exception is visible rather than prevented.

alter table public.partner_applications
  add column if not exists origin varchar(20) not null default 'applied';

do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_applications_origin_check') then
    alter table public.partner_applications
      add constraint partner_applications_origin_check
      check (origin in ('applied', 'appointed'));
  end if;
end $blk$;

comment on column public.partner_applications.origin is
  'applied = الشركة طلبت · appointed = مرصد عيّنتها';

-- ============================================================================
-- Appointing
-- ============================================================================
create or replace function public.grant_partnership(
  p_tenant_id uuid,
  p_reason    text,
  p_months    integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tenant  public.tenants%rowtype;
  v_plan    uuid;
  v_months  int;
  v_ends    timestamptz;
  v_snap    jsonb;
  v_app     uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'تعيين الشركاء من صلاحيات إدارة مرصد');
  end if;
  if coalesce(trim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'التعيين يحتاج سبباً — يُعرض للشركة');
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;
  if v_tenant.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'حساب الشركة غير نشط');
  end if;

  if exists (select 1 from public.subscriptions s
               join public.plans p on p.id = s.plan_id
              where s.tenant_id = p_tenant_id and s.status = 'active' and p.code = 'partner'
                and (s.current_period_end is null or s.current_period_end > now())) then
    return jsonb_build_object('ok', false, 'reason', 'الشركة شريك بالفعل');
  end if;

  select id into v_plan from public.plans where code = 'partner';
  if v_plan is null then
    raise exception 'باقة الشركاء غير موجودة';
  end if;

  select coalesce(p_months, (value ->> 'grant_months')::int, 12) into v_months
    from public.system_settings where key = 'partner_program';
  v_months := greatest(1, least(coalesce(v_months, 12), 60));
  v_ends := now() + (v_months || ' months')::interval;

  -- The same snapshot an application carries, so an appointment can be read
  -- against what was true when it was made.
  select jsonb_build_object(
      'reports_approved', count(*) filter (where r.status = 'approved'),
      'reports_total',    count(*),
      'companies_added',  (select count(*) from public.audit_logs al
                            where al.tenant_id = p_tenant_id and al.action = 'company_add_requested'),
      'at',               now())
    into v_snap
    from public.reports r where r.reporter_tenant_id = p_tenant_id;

  -- A company that had asked and is now appointed must not be left with a
  -- request still sitting in the queue.
  update public.partner_applications
     set status = 'approved', decided_by = public.get_current_user_id(),
         decided_at = now(),
         decision_reason = coalesce(decision_reason, '') || trim(p_reason)
   where tenant_id = p_tenant_id and status = 'pending';

  insert into public.partner_applications
    (tenant_id, note, snapshot, status, origin, decided_by, decided_at, decision_reason)
  values (p_tenant_id, null, v_snap, 'approved', 'appointed',
          public.get_current_user_id(), now(), trim(p_reason))
  returning id into v_app;

  insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (p_tenant_id, v_plan, 'active', now(), v_ends)
  on conflict (tenant_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'application_id', v_app,
                            'until', v_ends, 'months', v_months, 'snapshot', v_snap);
end $fn$;

grant execute on function public.grant_partnership(uuid, text, integer) to authenticated;
revoke all on function public.grant_partnership(uuid, text, integer) from public, anon;

-- ============================================================================
-- The overview says how each partnership started
-- ============================================================================
-- An appointed partner and one that asked are the same thing to the plan and a
-- different thing to whoever reviews the programme later.
drop function if exists public.partner_overview();

create function public.partner_overview()
returns table (
  tenant_id uuid, tenant_name text, cr_number text, sector text,
  reports_approved integer, companies_added integer, reject_rate integer,
  reporting_suspended boolean,
  state text,
  qualifies boolean,
  application_id uuid, applied_at timestamptz, application_note text,
  partner_since timestamptz, partner_until timestamptz, days_left integer,
  origin text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with terms as (
    select coalesce((value ->> 'min_companies_added')::int, 1000)  as min_co,
           coalesce((value ->> 'min_reports_approved')::int, 500)  as min_rep,
           coalesce((value ->> 'max_reject_rate')::int, 20)        as max_rej,
           coalesce((value ->> 'requires_both')::boolean, false)   as both
      from public.system_settings where key = 'partner_program'
  ),
  c as (select * from public.contributors_overview()),
  sub as (
    select s.tenant_id, s.current_period_start, s.current_period_end
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
     where p.code = 'partner' and s.status = 'active'
       and (s.current_period_end is null or s.current_period_end > now())
  ),
  app as (
    select distinct on (tenant_id) id, tenant_id, created_at, note
      from public.partner_applications
     where status = 'pending'
     order by tenant_id, created_at desc
  ),
  latest as (
    select distinct on (tenant_id) tenant_id, origin
      from public.partner_applications
     where status = 'approved'
     order by tenant_id, decided_at desc nulls last
  )
  select
    c.tenant_id, c.tenant_name, c.cr_number, c.sector,
    c.reports_approved, c.companies_added, c.reject_rate,
    c.reporting_suspended,
    (case
       when sub.tenant_id is not null then 'partner'
       when app.id is not null        then 'pending'
       when q.ok                      then 'eligible'
       else 'below'
     end)::text,
    q.ok,
    app.id, app.created_at, app.note,
    sub.current_period_start, sub.current_period_end,
    case when sub.current_period_end is null then null
         else greatest(0, (sub.current_period_end::date - current_date))::int end,
    -- Only meaningful for a running partnership; null everywhere else.
    (case when sub.tenant_id is not null then latest.origin end)::text
  from c
  cross join terms t
  left join sub    on sub.tenant_id = c.tenant_id
  left join app    on app.tenant_id = c.tenant_id
  left join latest on latest.tenant_id = c.tenant_id
  cross join lateral (
    select (
      case when t.both
           then c.companies_added >= t.min_co and c.reports_approved >= t.min_rep
           else c.companies_added >= t.min_co or  c.reports_approved >= t.min_rep
      end)
      -- A contributor whose reports are mostly overturned is raising volume, not
      -- quality, and the programme is meant to buy quality.
      and c.reject_rate <= t.max_rej
      and not c.reporting_suspended as ok
  ) q
  where coalesce(public.is_platform_admin(), false)
  order by
    (case when sub.tenant_id is not null then 0
          when app.id is not null then 1
          when q.ok then 2 else 3 end),
    c.reports_approved desc;
$fn$;

grant execute on function public.partner_overview() to authenticated;
revoke all on function public.partner_overview() from public, anon;

-- ============================================================================
-- Prove appointment, and prove it is not a way around the other rules
-- ============================================================================
create temporary table _092_before on commit drop as
  select s.* from public.subscriptions s
   where s.tenant_id = (select u.tenant_id from public.users u
                         where u.role = 'company_admin' and u.tenant_id is not null limit 1);

do $blk$
declare
  v_admin text; v_tadmin text; v_tenant uuid; v_res jsonb; v_ent jsonb; v_row record;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select u.id, u.tenant_id into v_tadmin, v_tenant
    from public.users u where u.role = 'company_admin' and u.tenant_id is not null limit 1;
  if v_tenant is null then raise notice 'لا مدير شركة للفحص'; return; end if;

  -- 1) A company cannot appoint itself.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_res := public.grant_partnership(v_tenant, 'محاولة');
  if (v_res->>'ok')::boolean then raise exception 'الشركة عيّنت نفسها شريكاً'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 2) No reason, no appointment.
  v_res := public.grant_partnership(v_tenant, '   ');
  if (v_res->>'ok')::boolean then raise exception 'قُبل تعيين بلا سبب'; end if;

  -- 3) Appointing a company that never applied.
  v_res := public.grant_partnership(v_tenant, 'فحص المهاجرة 092', 6);
  if not (v_res->>'ok')::boolean then
    raise exception 'فشل التعيين: %', v_res->>'reason';
  end if;

  -- The benefits arrive through the same machinery as an approved application.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_ent := public.my_entitlements();
  if v_ent->>'planCode' <> 'partner' then
    raise exception 'التعيين لم يمنح الباقة: %', v_ent->>'planCode';
  end if;

  -- 4) The panel says Marsad started it, and for how long.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  select state, origin, days_left into v_row
    from public.partner_overview() where tenant_id = v_tenant;
  if v_row.state <> 'partner' or v_row.origin <> 'appointed' then
    raise exception 'الأصل المسجَّل: % / %', v_row.state, v_row.origin;
  end if;
  if v_row.days_left > 200 then
    raise exception 'المدة لم تُحترم: % يوماً', v_row.days_left;
  end if;

  -- 5) An existing partner is not appointed twice.
  v_res := public.grant_partnership(v_tenant, 'مرة ثانية');
  if (v_res->>'ok')::boolean then raise exception 'عُيّن شريك قائم مرة ثانية'; end if;

  -- 6) And withdrawing still works on an appointed partnership.
  v_res := public.revoke_partnership(v_tenant, 'فحص المهاجرة 092');
  if not (v_res->>'ok')::boolean then raise exception 'تعذّر سحب شراكة معيَّنة'; end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ التعيين يعمل، ولا يتجاوز صلاحية ولا سبباً ولا مدة';
end $blk$;

-- Put the tenant's subscription back exactly as it was, and remove the records
-- the check wrote.
update public.subscriptions s
   set plan_id = b.plan_id, status = b.status,
       current_period_start = b.current_period_start,
       current_period_end = b.current_period_end,
       updated_at = now()
  from _092_before b
 where s.tenant_id = b.tenant_id;

delete from public.partner_applications where decision_reason like '%فحص المهاجرة 092%';

do $blk$
declare v_bad int;
begin
  select count(*) into v_bad from public.subscriptions s
    join _092_before b on b.tenant_id = s.tenant_id
   where s.plan_id is distinct from b.plan_id or s.status is distinct from b.status;
  if v_bad > 0 then raise exception 'لم يُستعد اشتراك الشركة'; end if;

  select count(*) into v_bad from public.partner_applications;
  if v_bad > 0 then raise exception 'بقيت % سجلات من الفحص', v_bad; end if;

  raise notice '✅ لم يبقَ أثر';
end $blk$;
