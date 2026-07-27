-- Migration: 038_entitlements_one_call.sql
-- Purpose: answer "what does this user's plan allow" in one request.
--
-- Resolving entitlements takes two sequential round trips today: query users for
-- the caller's tenant_id, wait, then query subscriptions, system_settings,
-- credits_ledger and audit_logs with it. The second batch cannot start until the
-- first returns, so the wait is the sum, and it happens after Clerk has already
-- taken its turn.
--
-- Every gated screen sits behind that wait. A user reported comparison as
-- "locking ten seconds after I open it" — the gate itself was inverted and is
-- fixed separately, but the ten seconds were real, and they are this.
--
-- One function, one round trip, and the tenant lookup happens inside the
-- database where it costs nothing.
--
-- Idempotent.

create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user_id   text := public.get_current_user_id();
  v_tenant_id uuid;
  v_plan      record;
  v_credits   numeric;
  v_settings  jsonb;
  v_views     int;
begin
  if v_user_id is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا توجد جلسة');
  end if;

  select tenant_id into v_tenant_id from public.users where id = v_user_id;
  if v_tenant_id is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا يوجد كيان مرتبط بالحساب');
  end if;

  select p.* into v_plan
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.tenant_id = v_tenant_id and s.status = 'active'
   order by s.created_at desc
   limit 1;

  -- A tenant with no active subscription falls to the default plan, not to
  -- nothing. Returning degraded here would switch enforcement off for anyone
  -- whose subscription lapsed, which is the wrong way round.
  if v_plan is null then
    select p.* into v_plan from public.plans p where p.is_default limit 1;
  end if;

  if v_plan is null then
    return jsonb_build_object('degraded', true, 'reason', 'لا توجد باقة مرتبطة بالكيان');
  end if;

  -- The ledger is append-only and holds earnings and spends alike, so the
  -- balance is its sum and never a stored counter that can drift from it.
  select coalesce(sum(amount), 0) into v_credits
    from public.credits_ledger where tenant_id = v_tenant_id;

  select jsonb_object_agg(key, value) into v_settings
    from public.system_settings
   where key in ('give_to_get_rules', 'entitlements_enforcement', 'feature_catalog');

  -- Distinct companies opened this month, counted from audit_logs because it
  -- records which company was opened — a member is not charged twice for
  -- returning to the same one.
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
    'limits', coalesce(v_plan.limits, '{}'::jsonb),
    'features', to_jsonb(coalesce(v_plan.features, '{}'::text[])),
    'credits', v_credits,
    -- searches_per_month is the key the application reads. The meter counts
    -- distinct companies opened, which is what a search costs — naming it
    -- anything else here silently zeroes every remaining-searches figure.
    'usage', jsonb_build_object('searches_per_month', v_views),
    'giveToGetEnabled', coalesce(v_plan.give_to_get_enabled, false),
    'giveToGetRules', coalesce(v_settings -> 'give_to_get_rules', '{}'::jsonb),
    'featureCatalog', coalesce(v_settings -> 'feature_catalog', '{}'::jsonb),
    'enforcementDisabled', not coalesce((v_settings #>> '{entitlements_enforcement,enabled}')::boolean, true),
    'degraded', false
  );
end;
$$;

revoke all on function public.my_entitlements() from public;
grant execute on function public.my_entitlements() to authenticated, service_role;

do $$
begin
  raise notice 'my_entitlements: نداء واحد بدل رحلتين متتاليتين';
end $$;
