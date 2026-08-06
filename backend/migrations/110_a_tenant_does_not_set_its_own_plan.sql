-- Migration: 110_a_tenant_does_not_set_its_own_plan.sql
-- Purpose: any company administrator could give themselves the enterprise plan.
--
-- ============================================================================
-- What was open
-- ============================================================================
-- `subscriptions_update_policy` allowed an update when
--
--     (tenant_id = get_current_tenant_id() and is_tenant_admin()) or is_platform_admin()
--
-- so a tenant admin could update their own subscription row. Two of the columns
-- on that row decide everything the account is entitled to:
--
--     PATCH /rest/v1/subscriptions?tenant_id=eq.<mine>
--     { "plan_id": "<enterprise>", "current_period_end": "2036-01-01" }
--
-- Measured, not reasoned about: as an ordinary company_admin, both statements
-- returned 1 row. That is every limit removed and every feature unlocked, for
-- nothing, without touching an RPC or knowing anything about the schema beyond
-- what the network tab already shows.
--
-- It outranks what 108 closed. That needed someone to call a function directly;
-- this is one request against a table the page already reads.
--
-- ============================================================================
-- Why the policy existed
-- ============================================================================
-- Presumably so a company could manage its own subscription. It never did. The
-- company side of the product only ever:
--
--   - inserts one free subscription at sign-up (src/lib/api.ts)
--   - reads its own row
--   - asks for a different plan through `plan_change_requests`, which an
--     administrator approves (src/pages/Subscription.jsx)
--
-- There is no screen anywhere that updates a subscription as the tenant. The
-- permission was granted for a flow that was never built, and stayed after the
-- flow went another way.
--
-- ============================================================================
-- What this does
-- ============================================================================
-- UPDATE becomes Marsad's alone. INSERT stays open to a tenant admin for its own
-- tenant, because sign-up needs it — but only for the default plan. Choosing
-- which plan you are on is the thing being taken away, and an INSERT that may
-- name any plan hands it straight back.

drop policy if exists subscriptions_update_policy on public.subscriptions;
create policy subscriptions_update_policy on public.subscriptions
  for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

comment on policy subscriptions_update_policy on public.subscriptions is
  'تعديل الاشتراك لإدارة مرصد وحدها. الشركة تطلب التغيير عبر plan_change_requests ولا تكتبه بنفسها.';

drop policy if exists subscriptions_insert_policy on public.subscriptions;
create policy subscriptions_insert_policy on public.subscriptions
  for insert
  with check (
    public.is_platform_admin()
    or (
      public.is_tenant_admin()
      and tenant_id = public.get_current_tenant_id()
      -- The default plan and nothing else. Sign-up creates a free subscription;
      -- anything that names a plan is a choice, and choosing is what moved to
      -- Marsad.
      and plan_id = (select p.id from public.plans p where p.is_default limit 1)
    )
  );

comment on policy subscriptions_insert_policy on public.subscriptions is
  'الشركة تنشئ اشتراكها المجاني عند التسجيل فقط. أي باقة أخرى من إدارة مرصد.';

-- ============================================================================
-- Prove it
-- ============================================================================
do $blk$
declare
  v_user   text;
  v_tenant uuid;
  v_ent    uuid;
  v_n      int;
begin
  begin
    select u.id, u.tenant_id into v_user, v_tenant
      from public.users u
      join public.subscriptions s on s.tenant_id = u.tenant_id
     where u.role = 'company_admin' and u.tenant_id is not null
     limit 1;
    select id into v_ent from public.plans where code = 'enterprise';

    if v_user is null or v_ent is null then
      raise notice 'لا بيانات كافية للفحص داخل الترحيل';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    -- The escalation, attempted exactly as it was found.
    update public.subscriptions set plan_id = v_ent where tenant_id = v_tenant;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise exception 'الشركة ما زالت تغيّر باقتها بنفسها: % صف', v_n;
    end if;

    update public.subscriptions set current_period_end = now() + interval '10 years'
     where tenant_id = v_tenant;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise exception 'الشركة ما زالت تمدّد اشتراكها بنفسها: % صف', v_n;
    end if;

    -- And it still reads its own row, which the pages depend on.
    select count(*) into v_n from public.subscriptions where tenant_id = v_tenant;
    if v_n = 0 then
      raise exception 'الشركة فقدت قراءة اشتراكها — كُسر أكثر مما أُغلق';
    end if;

    reset role;
    perform set_config('request.jwt.claims', null, true);
    raise notice '✅ الشركة لا تمنح نفسها باقة ولا تمدّد اشتراكها، وما زالت تقرأه';
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
