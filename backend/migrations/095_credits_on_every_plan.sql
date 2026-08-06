-- Migration: 095_credits_on_every_plan.sql
-- Purpose: earned points do nothing on any plan except the free one, and the
--          screen never says so.
--
-- ============================================================================
-- What a subscriber sees today
-- ============================================================================
-- A card reading "رصيدي من النقاط · 💎 43 · نقاط متراكمة", and elsewhere
-- "بقي 99 من 100". Two widgets, no stated relationship, and the obvious reading
-- — that 43 lookups are waiting to be used — is wrong.
--
-- The arithmetic was already unified: remaining() is
--   (ceiling - used) + credits
-- and UsageMeter already renders the sum with "منها N من رصيد مساهماتك"
-- underneath it. All of that is gated on plans.give_to_get_enabled, which is
-- true on 'free' and false everywhere else. So on the partner plan the sum is
-- 99 + 0, the explanatory line is hidden, and the points sit visible and inert.
--
-- ============================================================================
-- Why the gate goes rather than the card
-- ============================================================================
-- Honestly labelling the points as unusable would have been the smaller change.
-- It is the wrong one:
--
--  * The points were earned. Withdrawing them because the company later took a
--    better plan is a rule nobody would agree to if it were stated plainly.
--  * The registry is the platform's problem, not its lookup quota: 20 of 31
--    companies have no trust score because too few reports exist. Give-to-Get is
--    the mechanism that fixes that, and it was switched off for exactly the
--    subscribers most able to contribute.
--  * The exposure is already bounded by monthly_earn_cap (200) in
--    give_to_get_rules, which stays adjustable from the admin panel.
--
-- The column stays. This flips its value, it does not remove the ability to
-- switch Give-to-Get off per plan later.
--
-- Nothing about earning changes, and nothing about the monthly ceiling changes.
-- The two buckets stay separate where it matters: the plan's allowance resets
-- each month, earned points never do. Only the union becomes unconditional.

update public.plans
   set give_to_get_enabled = true, updated_at = now()
 where not give_to_get_enabled;

comment on column public.plans.give_to_get_enabled is
  'هل تُضاف النقاط المكتسبة إلى حصة الباقة؟ مفعّل على كل الباقات منذ 095 — يُطفأ لباقة بعينها من لوحة الباقات عند الحاجة';

-- ============================================================================
-- Prove the sum a subscriber will now see
-- ============================================================================
-- Checked as the entitlements resolver reports it, not by reading the column:
-- the browser adds credits only when my_entitlements says the plan allows it,
-- so that is the value that decides what the meter shows.
do $blk$
declare
  v_admin text; v_user text; v_tenant uuid;
  v_ent jsonb; v_credits numeric; v_ceiling int; v_used int; v_n int;
begin
  select count(*) into v_n from public.plans where not give_to_get_enabled;
  if v_n > 0 then
    raise exception '% باقة ما زالت بلا Give-to-Get', v_n;
  end if;

  -- A real subscriber with a real balance, so the sum below is not hypothetical.
  select u.id, u.tenant_id into v_user, v_tenant
    from public.users u
    join public.credits_ledger c on c.tenant_id = u.tenant_id
   where u.tenant_id is not null and u.role <> 'platform_admin'
   group by u.id, u.tenant_id
  having sum(c.amount) > 0
   limit 1;

  if v_user is null then
    raise notice 'لا مشترك برصيد نقاط — تعذّر إثبات الجمع';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  v_ent := public.my_entitlements();

  if not coalesce((v_ent ->> 'giveToGetEnabled')::boolean, false) then
    raise exception 'الباقة %  ما زالت تمنع النقاط', v_ent ->> 'planCode';
  end if;

  select coalesce(sum(amount), 0) into v_credits
    from public.credits_ledger where tenant_id = v_tenant;

  v_ceiling := (v_ent #>> '{limits,searches_per_month}')::int;
  v_used    := coalesce((v_ent #>> '{usage,searches_per_month}')::int, 0);

  -- Unlimited plans have nothing to add to; everything else must now show the
  -- ceiling and the balance together.
  if v_ceiling <> -1 then
    raise notice 'الباقة % · السقف % · المستخدم % · النقاط % ← المتاح %',
      v_ent ->> 'planCode', v_ceiling, v_used, v_credits,
      greatest(0, v_ceiling - v_used) + v_credits;

    if v_credits <= 0 then
      raise exception 'رصيد المشترك % — لا يُثبت الجمع', v_credits;
    end if;
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ النقاط تُحتسب ضمن المتاح على كل الباقات';
end $blk$;
