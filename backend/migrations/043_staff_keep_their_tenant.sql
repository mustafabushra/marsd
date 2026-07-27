-- Migration: 043_staff_keep_their_tenant.sql
-- Purpose: a staff account that also belongs to a company keeps that company.
--
-- 042 gave Marsad staff platform-wide entitlements and returned tenantId null
-- with them, because a platform administrator normally has no tenant. But one
-- account may hold both jobs — running Marsad and belonging to a company on it —
-- and for that person null is wrong: every company screen keys on tenantId, so
-- their own dashboard, watchlist and reports would come back empty while they
-- were told they had unlimited access to everything.
--
-- The two facts are independent. What a viewer may see is decided by their role;
-- which company they belong to is a separate question with its own answer, and
-- conflating them broke the case where both are true.
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
      'tenantId', v_tenant_id,          -- null for pure staff, real for both-jobs
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
   where s.tenant_id = v_tenant_id and s.status = 'active'
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
    'enforcementDisabled', not coalesce((v_settings #>> '{entitlements_enforcement,enabled}')::boolean, true),
    'degraded', false
  );
end;
$$;

revoke all on function public.my_entitlements() from public;
grant execute on function public.my_entitlements() to authenticated, service_role;

do $$
begin
  raise notice 'my_entitlements: الدور يحدّد ما يُرى، والكيان يبقى كما هو';
end $$;
