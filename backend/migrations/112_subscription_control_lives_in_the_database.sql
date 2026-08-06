-- Migration: 112_subscription_control_lives_in_the_database.sql
-- Purpose: /admin/subscriptions could change a plan and little else, and the
--          rules for doing it safely existed nowhere.
--
-- ============================================================================
-- Why this is more than a screen
-- ============================================================================
-- Since 110 a company cannot set its own plan, so every subscription in the
-- product is decided on one screen. That screen offered three buttons — renew
-- exactly thirty days, change plan, cancel — with no reason recorded, no view of
-- what the company is actually using, no way to reach a tenant that has no
-- subscription row at all, and no guard against the mistake that is already in
-- the data: two subscriptions ending in the year 2126, entered by typing a year.
--
-- Putting more buttons on the page would repeat the mistake this codebase keeps
-- finding: rules that live in JavaScript are advisory. The controls go in the
-- database, where the same rule applies to the screen, to a script, and to
-- whoever calls the API next year.
--
-- ============================================================================
-- What is enforced here rather than asked politely
-- ============================================================================
--   - platform admin only, checked in the function, not in the router
--   - every change carries a reason, because a subscription is a decision about
--     a customer and «who changed this and why» is the first question asked when
--     one goes wrong. The partnership functions already work this way.
--   - a term cannot be set more than five years out. That is the 2126 typo, and
--     it is the only defence against it: a date field accepts anything.
--   - the period cannot be moved into the past to fake an expiry; cancelling is
--     how a subscription ends, and it is its own action with its own record.

-- ============================================================================
-- 1. Everything the screen needs, in one read
-- ============================================================================
-- Tenants with no subscription are included deliberately. They are invisible on
-- a screen built from `subscriptions`, and since 110 they cannot create one
-- themselves — so a tenant in that state had no way back and nobody could see
-- it had happened.
create or replace function public.admin_subscription_overview()
returns table (
  subscription_id uuid,
  tenant_id uuid,
  tenant_name text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  plan_active boolean,
  price_monthly numeric,
  limits jsonb,
  status text,
  period_start timestamptz,
  period_end timestamptz,
  is_live boolean,
  days_left integer,
  lookups_used integer,
  seats_used integer,
  pending_request boolean,
  requested_plan_name text,
  last_change_at timestamptz,
  last_change_reason text,
  paid_total numeric,
  unpaid_count integer,
  overdue_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    t.id,
    t.name::text,
    p.id,
    p.code::text,
    p.name::text,
    p.active,
    p.price_monthly,
    coalesce(p.limits, '{}'::jsonb),
    s.status::text,
    s.current_period_start,
    s.current_period_end,
    -- The same test my_entitlements applies. The badge used to disagree with it.
    coalesce(s.status = 'active'
             and (s.current_period_end is null or s.current_period_end > now()), false),
    case when s.current_period_end is null then null
         else floor(extract(epoch from (s.current_period_end - now())) / 86400)::int end,
    (select count(*)::int from public.audit_logs a
      where a.tenant_id = t.id and a.action = 'company_report_viewed'
        and a.created_at >= date_trunc('month', now())),
    (select count(*)::int from public.users u where u.tenant_id = t.id),
    exists (select 1 from public.plan_change_requests r
             where r.tenant_id = t.id and r.status = 'pending'),
    (select rp.name::text from public.plan_change_requests r
       join public.plans rp on rp.id = r.requested_plan_id
      where r.tenant_id = t.id and r.status = 'pending'
      order by r.created_at desc limit 1),
    (select a.created_at from public.audit_logs a
      where a.tenant_id = t.id and a.action = 'subscription_changed'
      order by a.created_at desc limit 1),
    (select a.meta ->> 'reason' from public.audit_logs a
      where a.tenant_id = t.id and a.action = 'subscription_changed'
      order by a.created_at desc limit 1),
    -- Invoices exist, carry money, and no screen has ever shown them against a
    -- subscription. `amount + vat` is computed here because there is no `total`
    -- column — /admin/payments sums `i.total`, which is undefined, so the figure
    -- it prints as «المحصّل» is always zero.
    (select coalesce(sum(i.amount + coalesce(i.vat, 0)), 0) from public.invoices i
      where i.subscription_id = s.id and i.status = 'paid'),
    (select count(*)::int from public.invoices i
      where i.subscription_id = s.id and i.status <> 'paid'),
    (select count(*)::int from public.invoices i
      where i.subscription_id = s.id and i.status = 'pending'
        and i.due_at is not null and i.due_at < now())
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id
  left join public.plans p on p.id = s.plan_id
  where public.is_platform_admin()
  order by
    -- What needs attention first: no subscription, then dead, then expiring.
    (s.id is null) desc,
    (s.status <> 'active') desc,
    s.current_period_end nulls last;
$$;

comment on function public.admin_subscription_overview() is
  'كل ما تحتاجه شاشة الاشتراكات في قراءة واحدة، ومعها الكيانات التي بلا اشتراك — لا تظهر في جدول الاشتراكات ولا تستطيع إنشاءه بنفسها.';

-- ============================================================================
-- 2. One guarded way to change a subscription
-- ============================================================================
create or replace function public.admin_set_subscription(
  p_subscription_id uuid,
  p_reason text,
  p_plan_id uuid default null,
  p_status text default null,
  p_period_end timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    public.subscriptions;
  v_actor  text := public.get_current_user_id();
  v_plan   public.plans;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_end    timestamptz;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'reason', 'تغيير الاشتراكات من صلاحيات إدارة مرصد');
  end if;

  -- Not decoration: this text is shown to the company in the notification and
  -- is the only record of why somebody's plan changed.
  if v_reason is null or length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'اكتب سبب التغيير — يُعرض للشركة ويُحفظ في السجل');
  end if;

  select * into v_row from public.subscriptions where id = p_subscription_id;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'الاشتراك غير موجود');
  end if;

  if p_plan_id is not null then
    select * into v_plan from public.plans where id = p_plan_id;
    if v_plan.id is null then
      return jsonb_build_object('ok', false, 'reason', 'الباقة غير موجودة');
    end if;
  end if;

  if p_status is not null
     and p_status not in ('active', 'cancelled', 'expired', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'حالة غير معروفة: ' || p_status);
  end if;

  v_end := coalesce(p_period_end, v_row.current_period_end);

  -- The 2126 guard. A date input accepts any year, and two rows in this database
  -- already carry one — «36513 يوماً» remaining. Nothing else stands between a
  -- slipped keystroke and a subscription that outlives the company.
  if v_end is not null and v_end > now() + interval '5 years' then
    return jsonb_build_object('ok', false,
      'reason', 'التاريخ أبعد من خمس سنوات — راجعه. الاشتراكات تُجدَّد لا تُمنح للأبد');
  end if;

  -- Backdating an end date to force an expiry hides the decision. Cancelling is
  -- an action with a name and a record, and it is right there.
  if p_period_end is not null and p_period_end < now() then
    return jsonb_build_object('ok', false,
      'reason', 'لا يُرجَّع تاريخ الانتهاء للماضي — استخدم الإلغاء');
  end if;

  update public.subscriptions
     set plan_id            = coalesce(p_plan_id, plan_id),
         status             = coalesce(p_status, status),
         current_period_end = v_end,
         updated_at         = now()
   where id = p_subscription_id
  returning * into v_row;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, meta)
  values (v_row.tenant_id, v_actor, 'subscription_changed', 'subscription',
          v_row.id::text,
          jsonb_build_object('reason', v_reason, 'plan_id', p_plan_id,
                             'status', p_status, 'period_end', p_period_end));

  return jsonb_build_object(
    'ok', true,
    'status', v_row.status,
    'planId', v_row.plan_id,
    'periodEnd', v_row.current_period_end,
    'isLive', v_row.status = 'active'
              and (v_row.current_period_end is null or v_row.current_period_end > now()));
end $$;

comment on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz) is
  'الطريق الوحيد لتغيير اشتراك: يشترط صلاحية الإدارة وسبباً مكتوباً، ويرفض التواريخ غير المعقولة، ويكتب السجل في المعاملة نفسها.';

-- ============================================================================
-- 3. And a way back for a tenant that has no subscription
-- ============================================================================
create or replace function public.admin_create_subscription(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_months integer,
  p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  text := public.get_current_user_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
  v_months int := coalesce(p_months, 1);
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'reason', 'إنشاء الاشتراكات من صلاحيات إدارة مرصد');
  end if;
  if v_reason is null or length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'اكتب سبب الإنشاء');
  end if;
  if v_months < 1 or v_months > 60 then
    return jsonb_build_object('ok', false, 'reason', 'المدة بين شهر و60 شهراً');
  end if;
  if exists (select 1 from public.subscriptions where tenant_id = p_tenant_id) then
    return jsonb_build_object('ok', false, 'reason', 'للكيان اشتراك بالفعل');
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then
    return jsonb_build_object('ok', false, 'reason', 'الباقة غير موجودة');
  end if;

  insert into public.subscriptions
    (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (p_tenant_id, p_plan_id, 'active', now(), now() + (v_months || ' months')::interval)
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, meta)
  values (p_tenant_id, v_actor, 'subscription_changed', 'subscription', v_id::text,
          jsonb_build_object('reason', v_reason, 'created', true,
                             'plan_id', p_plan_id, 'months', v_months));

  return jsonb_build_object('ok', true, 'subscriptionId', v_id);
end $$;

comment on function public.admin_create_subscription(uuid, uuid, integer, text) is
  'ينشئ اشتراكاً لكيان ليس له واحد. بعد 110 لا يستطيع الكيان إنشاءه بنفسه إلا بالباقة الافتراضية عند التسجيل.';

-- ============================================================================
-- 4. Privileges
-- ============================================================================
revoke all on function public.admin_subscription_overview() from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_create_subscription(uuid, uuid, integer, text) from public, anon;

grant execute on function public.admin_subscription_overview() to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_create_subscription(uuid, uuid, integer, text) to authenticated;

-- ============================================================================
-- 5. Prove it
-- ============================================================================
do $blk$
declare
  v_admin  text;
  v_member text;
  v_sub    uuid;
  v_res    jsonb;
  v_n      int;
begin
  begin
    select id into v_admin from public.users where role = 'platform_admin' limit 1;
    select id into v_member from public.users
      where role in ('company_admin', 'company_member') limit 1;
    select id into v_sub from public.subscriptions limit 1;
    if v_admin is null or v_sub is null then
      raise notice 'لا بيانات كافية للفحص';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    set local role authenticated;

    -- An ordinary company sees nothing and changes nothing.
    if v_member is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
      select count(*) into v_n from public.admin_subscription_overview();
      if v_n > 0 then raise exception 'شركة عادية تقرأ لوحة الاشتراكات: % صف', v_n; end if;

      v_res := public.admin_set_subscription(v_sub, 'محاولة', null, 'cancelled', null);
      if coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception 'شركة عادية غيّرت اشتراكاً';
      end if;
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select count(*) into v_n from public.admin_subscription_overview();
    if v_n = 0 then raise exception 'اللوحة فارغة للإدارة'; end if;

    -- A change with no reason is refused.
    v_res := public.admin_set_subscription(v_sub, '  ', null, 'active', null);
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'قُبل تغيير بلا سبب';
    end if;

    -- The 2126 typo is refused.
    v_res := public.admin_set_subscription(v_sub, 'فحص', null, null, now() + interval '100 years');
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'قُبل تاريخ بعد مئة سنة';
    end if;

    -- Backdating is refused.
    v_res := public.admin_set_subscription(v_sub, 'فحص', null, null, now() - interval '1 day');
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'قُبل تاريخ في الماضي';
    end if;

    -- A real change goes through, and is recorded with its reason.
    v_res := public.admin_set_subscription(v_sub, 'تجديد بعد سداد', null, 'active',
                                           now() + interval '30 days');
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'التغيير الصحيح رُفض: %', v_res;
    end if;
    if not exists (select 1 from public.audit_logs
                    where entity_id = v_sub::text and action = 'subscription_changed'
                      and meta ->> 'reason' = 'تجديد بعد سداد') then
      raise exception 'السبب لم يُحفظ في السجل';
    end if;

    raise notice '✅ اللوحة للإدارة وحدها، ولا تغيير بلا سبب، ولا تاريخ غير معقول';
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
