-- Migration: 048_settings_and_definer_hardening.sql
-- Purpose: stop system_settings leaking to the open internet, and pin the
--          search_path on every SECURITY DEFINER function.
--
-- ============================================================================
-- 1) system_settings was world-readable
-- ============================================================================
-- system_settings_select_policy was `using (true)` for role `public`, and the
-- Supabase anon key ships inside the browser bundle. One unauthenticated curl
-- returned the whole table:
--
--   trust_score_rules  — every weight, threshold and clamp. A company can
--                        compute exactly how many on-time reports it needs to
--                        reach 98. This is the platform's product.
--   give_to_get_rules  — the entire credit economy, which is what makes the
--                        award-credits hole obvious to anyone who looks.
--   billing_settings   — IBAN and account name. Empty today; leaks the moment
--                        they are filled in.
--
-- Writing was already refused (401), so this was read-only exposure. That does
-- not make it small: the scoring model is the thing customers pay for.
--
-- The fix is not "admins only". A paying company reads billing_settings on
-- /subscription to know where to transfer the money — locking the whole table
-- to platform_admin would break payment. So the split is by key, not by table.

drop policy if exists system_settings_select_policy on public.system_settings;
drop policy if exists system_settings_select_all on public.system_settings;

-- Keys a signed-in customer legitimately needs.
--   billing_settings        — the IBAN they pay into (Subscription.jsx)
--   feature_catalog         — the Arabic labels for feature keys (AdminPlans,
--                             and the plan comparison a customer sees)
--   entitlements_enforcement— whether limits are enforced, which the client
--                             uses to decide between a hard block and a notice
--
-- Everything else — the scoring model, the credit economy — is Marsad's.
create policy system_settings_select_shared on public.system_settings
  for select
  to authenticated
  using (
    key in ('billing_settings', 'feature_catalog', 'entitlements_enforcement')
  );

create policy system_settings_select_admin on public.system_settings
  for select
  to authenticated
  using (public.is_platform_admin());

-- The INSERT policy had no WITH CHECK at all, which for an INSERT policy means
-- the row is evaluated against nothing. It was unreachable in practice because
-- no GRANT let a customer insert, but a policy that permits everything it is
-- asked about is not a control — it is the absence of one, written down.
drop policy if exists system_settings_insert_policy on public.system_settings;
create policy system_settings_insert_admin on public.system_settings
  for insert
  to authenticated
  with check (public.is_platform_admin());

comment on table public.system_settings is
  'إعدادات المنصّة — نموذج التقييم واقتصاد النقاط مقصوران على إدارة مرصد؛ الفوترة وكتالوج الميزات متاحة للمشتركين';

-- ============================================================================
-- 2) SECURITY DEFINER without a pinned search_path
-- ============================================================================
-- A SECURITY DEFINER function runs with its owner's rights. If its search_path
-- is inherited from the caller, the caller chooses which schema every unqualified
-- name inside it resolves against — so the caller chooses what the function
-- actually executes, while it holds the owner's privileges.
--
-- is_reviewer is the sharp one: it is a permission check. A check whose body the
-- caller can redirect is a check the caller passes.
--
-- Done as a loop rather than three ALTERs so it covers whatever exists rather
-- than what was true when this was written, and so it cannot miss an overload.

do $$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
          where cfg like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.sig);
    n := n + 1;
    raise notice 'ثُبّت مسار البحث: %', fn.sig;
  end loop;
  raise notice 'إجمالي الدوال المُصلَحة: %', n;
end $$;

-- ============================================================================
-- 3) Verify, in the same transaction that made the change
-- ============================================================================
-- A migration that reports success because nothing raised is the same silent
-- pass this project has been bitten by repeatedly. Read the result back.

do $$
declare
  leaky int;
  unpinned int;
begin
  -- No policy may still hand system_settings to anon.
  select count(*) into leaky
    from pg_policies
   where tablename = 'system_settings'
     and cmd = 'SELECT'
     and (qual = 'true' or 'anon' = any(roles));
  if leaky > 0 then
    raise exception 'ما زالت % سياسة تكشف الإعدادات', leaky;
  end if;

  select count(*) into unpinned
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                      where c like 'search_path=%');
  if unpinned > 0 then
    raise exception 'ما زالت % دالة SECURITY DEFINER بلا مسار بحث مثبّت', unpinned;
  end if;

  raise notice '✅ الإعدادات محمية · كل دوال SECURITY DEFINER مثبّتة';
end $$;
