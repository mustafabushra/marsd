-- Migration: 109_every_opening_is_a_lookup.sql
-- Purpose: opening the same company's report twice in a month now costs twice.
--
-- ============================================================================
-- What changed, and why it is a decision rather than a fix
-- ============================================================================
-- The meter counted distinct companies: open a report once and it stayed free
-- for the rest of the month, however many times you came back. That was a
-- deliberate rule — "someone renegotiating with the same supplier should not pay
-- twice for the same fact" — and the owner has replaced it. Each opening is a
-- lookup, the way each message to an assistant is a message.
--
-- ============================================================================
-- The two halves have to move together
-- ============================================================================
-- `my_entitlements` reports usage and `open_company_report` records it. One
-- counted distinct companies and the other wrote at most one row per company,
-- which agreed. Changing either alone breaks it in a way that looks like
-- nothing: count rows while the writer still de-duplicates and the number
-- freezes at the number of companies; write every time while the count is still
-- distinct and the customer is charged for openings that never show up. So both
-- are in this file.
--
-- ============================================================================
-- What did not change
-- ============================================================================
-- `company_report_access` still asks whether this tenant has opened this company
-- at all this month, and it stays that way on purpose. The live refresh on the
-- report page re-reads the same three functions whenever a score moves, and a
-- gate that expired would blank the page somebody is reading. The charge is
-- taken where the reader acts — one call to open_company_report per page load —
-- not where the page happens to re-fetch.
--
-- The consequence, stated rather than discovered later: after the first paid
-- opening in a month, the three read functions will answer for that company
-- without a further charge if something calls them directly. That is a much
-- smaller opening than the one 108 closed, and closing it would mean a gate with
-- a time window, which is what would break the live refresh.

CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Every open, not every distinct company.
  --
  -- It counted `distinct entity_id`, so re-opening a company already looked at
  -- this month was free for the rest of it. The owner's decision is that each
  -- opening is a lookup, the way each message to an assistant is a message —
  -- so the meter counts openings, and open_company_report records one every
  -- time rather than short-circuiting on a company it has seen before. The two
  -- must change together: a count of rows against a meter that writes one row
  -- per company would simply stop moving.
  select count(*) into v_views
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
end $function$;


-- ============================================================================
-- The meter records every opening
-- ============================================================================
create or replace function public.open_company_report(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   jsonb;
  v_user    text := public.get_current_user_id();
  v_tenant  uuid;
  v_ceiling int;
  v_used    int := 0;
  v_spend   jsonb;
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;

  v_state := public.report_access_state(p_company_id);
  if not coalesce((v_state ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', v_state ->> 'reason');
  end if;
  if coalesce((v_state ->> 'exempt')::boolean, false) then
    return jsonb_build_object('ok', true, 'metered', false,
                              'reason', v_state ->> 'reason');
  end if;

  v_tenant  := (v_state ->> 'tenantId')::uuid;
  v_ceiling := coalesce((v_state ->> 'ceiling')::int, -1);

  -- One opener per tenant at a time. Two tabs opening on the last remaining
  -- slot otherwise read the same count and both pass.
  perform pg_advisory_xact_lock(hashtext('report_open:' || v_tenant::text));

  -- There is no early return for a company already opened this month. That
  -- branch used to make a revisit free; the rule is now that every opening is
  -- a lookup. `company_report_access` still reads the same rows, so a report
  -- opened once stays readable — what changed is that opening it again is
  -- counted and paid for.
  if v_ceiling >= 0 then
    select count(*) into v_used
      from public.audit_logs
     where tenant_id = v_tenant
       and action = 'company_report_viewed'
       and created_at >= date_trunc('month', now());

    if v_used >= v_ceiling then
      if coalesce((v_state ->> 'giveToGet')::boolean, false) then
        v_spend := public.spend_credits('search_unlock');
        if coalesce((v_spend ->> 'spent')::int, 0) <= 0
           and not coalesce((v_spend ->> 'proceed')::boolean, false) then
          return jsonb_build_object('ok', false, 'reason', 'انتهت مشاهدات هذا الشهر',
                                    'used', v_used, 'ceiling', v_ceiling,
                                    'credits', v_spend -> 'balance');
        end if;
      else
        return jsonb_build_object('ok', false, 'reason', 'انتهت مشاهدات هذا الشهر',
                                  'used', v_used, 'ceiling', v_ceiling);
      end if;
    end if;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id)
  values (v_tenant, v_user, 'company_report_viewed', 'company', p_company_id::text);

  return jsonb_build_object('ok', true, 'metered', true,
                            'used', v_used + 1, 'ceiling', v_ceiling);
end $$;

comment on function public.open_company_report(uuid) is
  'يفتح تقرير شركة ويحتسبه على باقة الكيان. كل فتحة تُحتسب، حتى لنفس الشركة. يرجع ok=false مع السبب عند انتهاء الحصة.';

-- ============================================================================
-- Prove it, before it ships
-- ============================================================================
do $blk$
declare
  v_user    text;
  v_tenant  uuid;
  v_company uuid;
  v_before  int;
  v_after   int;
  v_res     jsonb;
begin
  begin
    select u.id, u.tenant_id into v_user, v_tenant
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      join public.subscriptions s on s.tenant_id = t.id
      join public.plans p on p.id = s.plan_id
     where u.role in ('company_admin', 'company_member')
       and coalesce((p.limits ->> 'searches_per_month')::int, -1) >= 0
     limit 1;

    select c.id into v_company from public.companies c
     where c.id not in (select company_id from public.tenants where company_id is not null)
     limit 1;

    if v_user is null or v_company is null then
      raise notice 'لا بيانات كافية للفحص داخل الترحيل';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    v_before := ((public.my_entitlements() -> 'usage') ->> 'searches_per_month')::int;

    v_res := public.open_company_report(v_company);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'الفتح الأول فشل: %', v_res;
    end if;

    -- The same company again. This is the whole change.
    v_res := public.open_company_report(v_company);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'الفتح الثاني فشل: %', v_res;
    end if;
    if coalesce((v_res ->> 'alreadySeen')::boolean, false) then
      raise exception 'الفتح الثاني ما زال مجانياً: %', v_res;
    end if;

    v_after := ((public.my_entitlements() -> 'usage') ->> 'searches_per_month')::int;
    if v_after <> v_before + 2 then
      raise exception 'العدّاد تحرّك % بدل 2 — الدالتان لا تتفقان', v_after - v_before;
    end if;

    -- And the report is still readable, which is what makes the second charge
    -- honest rather than a toll on nothing.
    if not exists (select 1 from public.get_company_knowledge_base(v_company)) then
      raise exception 'التقرير صار غير مقروء بعد الفتح';
    end if;

    perform set_config('request.jwt.claims', null, true);
    raise notice '✅ كل فتحة تُحتسب، والعدّاد يتحرّك بالمقدار نفسه';
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
