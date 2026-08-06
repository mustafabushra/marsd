-- Migration: 090_partner_programme.sql
-- Purpose: /partners promises a partner programme that exists nowhere.
--
-- ============================================================================
-- What the page promises today
-- ============================================================================
-- The public page lists four partner companies with logos, sectors, report
-- counts and join dates. All four are a hardcoded array — invented names,
-- invented numbers. It states entry requirements (1000+ companies added or 500+
-- approved reports a year) and six benefits: a free annual subscription,
-- unlimited reports, 100 searches a month, priority in review, a badge, and a
-- logo on the page.
--
-- The application form calls setSubmitted(true) and writes nothing anywhere.
--
-- So a visitor can read the terms, apply, be told it worked, and no record of
-- them exists. There is no partner plan, no partner flag, and no way for Marsad
-- to see that anyone applied.
--
-- ============================================================================
-- The shape this takes
-- ============================================================================
-- A partner is a company on a granted plan, not a bought one. Everything about
-- entitlements already flows from an active subscription, so partnership is an
-- active subscription on a zero-price plan with a real end date — which means
-- the limits, the features and the expiry all work through machinery that is
-- already tested, and nothing needs a special case at read time.
--
-- The thresholds live in system_settings, so the terms can change from the admin
-- panel without a deploy.

-- ============================================================================
-- 1) The plan
-- ============================================================================
insert into public.plans (code, name, description, price_monthly, active, is_default,
                          give_to_get_enabled, sort_order, limits, features)
values (
  'partner',
  'شريك مرصد',
  'باقة تُمنح للشركات المساهمة في بناء السجل — لا تُباع.',
  0, true, false, false, 15,
  jsonb_build_object(
    -- The six promises on the public page, as numbers.
    'searches_per_month', 100,
    'reports_per_month',  -1,
    'companies_per_month', -1,
    'users',              5,
    'watchlist_items',    100,
    'pending_reports',    50,
    'compare_items',      6
  ),
  array['full_trust_report', 'compare', 'alerts']::text[]
)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      active = excluded.active, limits = excluded.limits, features = excluded.features;

-- ============================================================================
-- 2) The terms, as data
-- ============================================================================
insert into public.system_settings (key, value)
values ('partner_program', jsonb_build_object(
  'min_companies_added',  1000,
  'min_reports_approved', 500,
  'max_reject_rate',      20,     -- a partner whose reports keep failing is not a partner
  'grant_months',         12,
  'requires_both',        false   -- either threshold qualifies, as the page says
))
on conflict (key) do nothing;

-- ============================================================================
-- 3) Applications
-- ============================================================================
-- Applying requires being signed in as a company. The public form is open to
-- anyone, but the entry requirements are counts of contribution — nobody without
-- an account can have any. Recording an anonymous application would also reopen
-- the anonymous-write surface 058 closed.
create table if not exists public.partner_applications (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  note           text,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  -- What their contribution looked like at the moment they applied, so a
  -- decision months later can be read against what was true when they asked.
  snapshot       jsonb not null default '{}'::jsonb,
  status         varchar(20) not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by     text,
  decided_at     timestamptz,
  decision_reason text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_partner_applications_status
  on public.partner_applications (status, created_at desc);

-- One open application per company: a second is not more information, it is a
-- duplicate in the queue.
create unique index if not exists idx_partner_applications_one_open
  on public.partner_applications (tenant_id) where status = 'pending';

alter table public.partner_applications enable row level security;

drop policy if exists partner_applications_select on public.partner_applications;
create policy partner_applications_select on public.partner_applications
  for select using (
    tenant_id = public.get_current_tenant_id()
    or coalesce(public.is_platform_admin(), false)
  );

-- Written only through apply_for_partnership / decide_partnership, both of which
-- are SECURITY DEFINER. No direct insert or update policy exists, so the
-- snapshot and the status cannot be written by hand.

-- ============================================================================
-- 4) Applying
-- ============================================================================
create or replace function public.apply_for_partnership(
  p_note    text default null,
  p_contact_name  text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tenant uuid := public.get_current_tenant_id();
  v_snap   jsonb;
  v_id     uuid;
begin
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'reason', 'التقديم يحتاج حساب شركة في مرصد');
  end if;
  if not coalesce(public.is_tenant_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'التقديم من صلاحيات مدير الشركة');
  end if;

  if exists (select 1 from public.partner_applications
              where tenant_id = v_tenant and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'لديكم طلب شراكة قيد الدراسة');
  end if;

  if exists (select 1 from public.subscriptions s
               join public.plans p on p.id = s.plan_id
              where s.tenant_id = v_tenant and s.status = 'active' and p.code = 'partner'
                and (s.current_period_end is null or s.current_period_end > now())) then
    return jsonb_build_object('ok', false, 'reason', 'أنتم شركاء بالفعل');
  end if;

  -- The same numbers the admin will judge against, frozen at this moment.
  select jsonb_build_object(
      'reports_approved', count(*) filter (where r.status = 'approved'),
      'reports_total',    count(*),
      'companies_added',  (select count(*) from public.audit_logs al
                            where al.tenant_id = v_tenant and al.action = 'company_add_requested'),
      'at',               now())
    into v_snap
    from public.reports r where r.reporter_tenant_id = v_tenant;

  insert into public.partner_applications
    (tenant_id, note, contact_name, contact_email, contact_phone, snapshot)
  values (v_tenant, nullif(trim(coalesce(p_note, '')), ''),
          nullif(trim(coalesce(p_contact_name, '')), ''),
          nullif(trim(coalesce(p_contact_email, '')), ''),
          nullif(trim(coalesce(p_contact_phone, '')), ''),
          v_snap)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'application_id', v_id, 'snapshot', v_snap);
end $fn$;

grant execute on function public.apply_for_partnership(text, text, text, text) to authenticated;
revoke all on function public.apply_for_partnership(text, text, text, text) from public, anon;

-- ============================================================================
-- 5) Deciding
-- ============================================================================
create or replace function public.decide_partnership(
  p_application_id uuid,
  p_approve        boolean,
  p_reason         text,
  p_months         integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_app     public.partner_applications%rowtype;
  v_plan    uuid;
  v_months  int;
  v_ends    timestamptz;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'قرار الشراكة من صلاحيات إدارة مرصد');
  end if;
  if coalesce(trim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'القرار يحتاج سبباً — يُعرض للشركة');
  end if;

  select * into v_app from public.partner_applications where id = p_application_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الطلب غير موجود');
  end if;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'الطلب محسوم مسبقاً');
  end if;

  update public.partner_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = public.get_current_user_id(),
         decided_at = now(),
         decision_reason = trim(p_reason)
   where id = p_application_id;

  if not p_approve then
    return jsonb_build_object('ok', true, 'approved', false);
  end if;

  select id into v_plan from public.plans where code = 'partner';
  if v_plan is null then
    raise exception 'باقة الشركاء غير موجودة';
  end if;

  select coalesce(p_months, (value ->> 'grant_months')::int, 12) into v_months
    from public.system_settings where key = 'partner_program';
  v_months := greatest(1, least(coalesce(v_months, 12), 60));
  v_ends := now() + (v_months || ' months')::interval;

  -- subscriptions.tenant_id is unique: a tenant has one row, and changing plan
  -- means changing that row. Inserting a second is what a payment gateway would
  -- want and what this schema refuses.
  insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (v_app.tenant_id, v_plan, 'active', now(), v_ends)
  on conflict (tenant_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'approved', true, 'until', v_ends, 'months', v_months);
end $fn$;

grant execute on function public.decide_partnership(uuid, boolean, text, integer) to authenticated;
revoke all on function public.decide_partnership(uuid, boolean, text, integer) from public, anon;

-- ============================================================================
-- 6) Ending a partnership before its term
-- ============================================================================
create or replace function public.revoke_partnership(p_tenant_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_n int;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'السحب من صلاحيات إدارة مرصد');
  end if;
  if coalesce(trim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'السحب يحتاج سبباً');
  end if;

  update public.subscriptions s
     set status = 'cancelled', updated_at = now()
    from public.plans p
   where p.id = s.plan_id and p.code = 'partner'
     and s.tenant_id = p_tenant_id and s.status = 'active';
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'لا توجد شراكة فعّالة لهذه الشركة');
  end if;

  -- Falls back to the default plan on the next read; no row is left claiming
  -- benefits that were withdrawn.
  return jsonb_build_object('ok', true, 'reason', trim(p_reason));
end $fn$;

grant execute on function public.revoke_partnership(uuid, text) to authenticated;
revoke all on function public.revoke_partnership(uuid, text) from public, anon;

-- ============================================================================
-- 7) One screen's worth of the whole programme
-- ============================================================================
-- Applications waiting, partners running, and the companies that already meet
-- the terms without having asked — which is the list that grows the programme.
create or replace function public.partner_overview()
returns table (
  tenant_id uuid, tenant_name text, cr_number text, sector text,
  reports_approved integer, companies_added integer, reject_rate integer,
  reporting_suspended boolean,
  state text,                     -- partner · pending · eligible · below
  qualifies boolean,
  application_id uuid, applied_at timestamptz, application_note text,
  partner_since timestamptz, partner_until timestamptz, days_left integer
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
         else greatest(0, (sub.current_period_end::date - current_date))::int end
  from c
  cross join terms t
  left join sub on sub.tenant_id = c.tenant_id
  left join app on app.tenant_id = c.tenant_id
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
-- 8) A subscription that has ended is not an active subscription
-- ============================================================================
-- my_entitlements picks the newest subscription with status='active' and never
-- looks at current_period_end. Without this, a twelve-month partnership grants
-- its benefits forever — the term would be decoration.
--
-- Safe to add: all three subscriptions today end in 2126, so nothing currently
-- in flight changes plan because of it.
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_user_id   text := public.get_current_user_id();
  v_tenant_id uuid;
  v_plan      record;
  v_credits   numeric;
  v_settings  jsonb;
  v_views     int;
  v_features  text[];
begin
  if v_user_id is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا توجد جلسة');
  end if;

  select tenant_id into v_tenant_id from public.users where id = v_user_id;

  select jsonb_object_agg(key, value) into v_settings
    from public.system_settings
   where key in ('give_to_get_rules', 'entitlements_enforcement', 'feature_catalog');

  -- Marsad's own staff read the platform whole, and keep whatever company they
  -- happen to belong to. Nothing is metered against them: a lookup limit exists
  -- to price a customer's usage, and they are not a customer.
  if public.is_platform_admin() or coalesce(public.get_current_user_role(), '') = 'reviewer' then
    select coalesce(array_agg(k), '{}') into v_features
      from jsonb_object_keys(coalesce(v_settings -> 'feature_catalog', '{}'::jsonb)) k;

    select coalesce(sum(amount), 0) into v_credits
      from public.credits_ledger where tenant_id = v_tenant_id;

    return jsonb_build_object(
      'tenantId', v_tenant_id,
      'plan', jsonb_build_object('code', 'platform', 'name', 'إدارة مرصد'),
      'planCode', 'platform',
      'isPlatform', true,
      'limits', jsonb_build_object(
        'searches_per_month', -1, 'watchlist_items', -1, 'users', -1,
        'pending_reports', -1, 'compare_items', -1,
        'reports_per_month', -1, 'companies_per_month', -1),
      'features', to_jsonb(v_features),
      'credits', coalesce(v_credits, 0),
      'usage', jsonb_build_object('searches_per_month', 0),
      'giveToGetEnabled', false,
      'giveToGetRules', coalesce(v_settings -> 'give_to_get_rules', '{}'::jsonb),
      'featureCatalog', coalesce(v_settings -> 'feature_catalog', '{}'::jsonb),
      'enforcementDisabled', false,
      'degraded', false
    );
  end if;

  if v_tenant_id is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا يوجد كيان مرتبط بالحساب');
  end if;

  select p.* into v_plan
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.tenant_id = v_tenant_id
     and s.status = 'active'
     and (s.current_period_end is null or s.current_period_end > now())
   order by s.created_at desc
   limit 1;

  if v_plan is null then
    select p.* into v_plan from public.plans p where p.is_default limit 1;
  end if;

  if v_plan is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا توجد باقة مرتبطة بالكيان');
  end if;

  select coalesce(sum(amount), 0) into v_credits
    from public.credits_ledger where tenant_id = v_tenant_id;

  select count(distinct entity_id) into v_views
    from public.audit_logs
   where tenant_id = v_tenant_id
     and action = 'company_report_viewed'
     and created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'plan', jsonb_build_object(
      'id', v_plan.id, 'code', v_plan.code, 'name', v_plan.name,
      'description', v_plan.description, 'price_monthly', v_plan.price_monthly,
      'active', v_plan.active, 'give_to_get_enabled', v_plan.give_to_get_enabled
    ),
    'planCode', v_plan.code,
    'isPlatform', false,
    'limits', coalesce(v_plan.limits, '{}'::jsonb),
    'features', to_jsonb(coalesce(v_plan.features, '{}'::text[])),
    'credits', v_credits,
    'usage', jsonb_build_object('searches_per_month', v_views),
    'giveToGetEnabled', coalesce(v_plan.give_to_get_enabled, false),
    'giveToGetRules', coalesce(v_settings -> 'give_to_get_rules', '{}'::jsonb),
    'featureCatalog', coalesce(v_settings -> 'feature_catalog', '{}'::jsonb),
    'enforcementDisabled', coalesce((v_settings #>> '{entitlements_enforcement,disabled}')::boolean, false),
    'degraded', false
  );
end $fn$;

-- ============================================================================
-- Prove the whole cycle on a real tenant, then put it back
-- ============================================================================
create temporary table _090_before on commit drop as
  select s.* from public.subscriptions s
   where s.tenant_id = (select u.tenant_id from public.users u
                         where u.role = 'company_admin' and u.tenant_id is not null limit 1);

do $blk$
declare
  v_admin text; v_tadmin text; v_tenant uuid; v_res jsonb; v_ent jsonb; v_app uuid;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select u.id, u.tenant_id into v_tadmin, v_tenant
    from public.users u where u.role = 'company_admin' and u.tenant_id is not null limit 1;
  if v_tenant is null then raise notice 'لا مدير شركة للفحص'; return; end if;

  -- 1) A company applies.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_res := public.apply_for_partnership('فحص المهاجرة 090', 'فحص', 'probe-090@example.com', null);
  if not (v_res->>'ok')::boolean then
    raise exception 'فشل التقديم: %', v_res->>'reason';
  end if;
  v_app := (v_res->>'application_id')::uuid;

  -- and cannot apply twice.
  v_res := public.apply_for_partnership('مرة ثانية');
  if (v_res->>'ok')::boolean then raise exception 'قُبل طلبان مفتوحان'; end if;

  -- 2) Marsad decides. No reason, no decision.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_res := public.decide_partnership(v_app, true, '');
  if (v_res->>'ok')::boolean then raise exception 'قُبل قرار بلا سبب'; end if;

  v_res := public.decide_partnership(v_app, true, 'فحص المهاجرة 090', 12);
  if not (v_res->>'ok')::boolean then raise exception 'فشل الاعتماد: %', v_res->>'reason'; end if;

  -- 3) The company now reads as a partner, with the promised limits.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_ent := public.my_entitlements();
  if v_ent->>'planCode' <> 'partner' then
    raise exception 'الباقة بعد الاعتماد: %', v_ent->>'planCode';
  end if;
  if (v_ent #>> '{limits,searches_per_month}')::int <> 100 then
    raise exception 'حد البحث غير مطابق للوعد';
  end if;
  if not (v_ent -> 'features' ? 'full_trust_report') then
    raise exception 'التقرير الكامل غير مفعّل للشريك';
  end if;

  -- 4) The overview sees them as a running partner.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  if not exists (select 1 from public.partner_overview()
                  where tenant_id = v_tenant and state = 'partner' and days_left > 300) then
    raise exception 'الشريك لا يظهر في اللوحة';
  end if;

  -- 5) Withdrawing returns them to the default plan.
  v_res := public.revoke_partnership(v_tenant, 'فحص المهاجرة 090');
  if not (v_res->>'ok')::boolean then raise exception 'فشل السحب: %', v_res->>'reason'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_ent := public.my_entitlements();
  if v_ent->>'planCode' = 'partner' then
    raise exception 'بقيت مزايا الشراكة بعد سحبها';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ التقديم والقرار والمزايا والسحب — كلها تعمل';
end $blk$;

-- Put the tenant's subscription back exactly as it was. The check rewrote one
-- real row in place — there is nothing to delete, only to restore.
update public.subscriptions s
   set plan_id = b.plan_id, status = b.status,
       current_period_start = b.current_period_start,
       current_period_end = b.current_period_end,
       updated_at = now()
  from _090_before b
 where s.tenant_id = b.tenant_id;

delete from public.partner_applications where decision_reason = 'فحص المهاجرة 090';

do $blk$
declare v_bad int;
begin
  select count(*) into v_bad from public.tenants t
   where (select count(*) from public.subscriptions s
           where s.tenant_id = t.id and s.status = 'active') > 1;
  if v_bad > 0 then raise exception '% كيان لديه أكثر من اشتراك فعّال', v_bad; end if;

  select count(*) into v_bad from public.partner_applications;
  if v_bad > 0 then raise exception 'بقيت طلبات من الفحص'; end if;

  select count(*) into v_bad from public.subscriptions s join _090_before b on b.tenant_id = s.tenant_id
   where s.plan_id is distinct from b.plan_id or s.status is distinct from b.status;
  if v_bad > 0 then raise exception 'لم يُستعد اشتراك الشركة كما كان'; end if;

  raise notice '✅ لم يبقَ أثر، ولا كيان بأكثر من اشتراك فعّال';
end $blk$;
