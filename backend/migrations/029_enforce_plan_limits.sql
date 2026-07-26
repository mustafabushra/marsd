-- Migration: 029_enforce_plan_limits.sql
-- Purpose: make plan limits hold in the database, not only in the interface.
--
-- The free plan allows 3 watchlist entries. One tenant has 4, and the four rows
-- were written within three seconds of each other — this is not a leftover from
-- before the limit existed, it is the limit being walked past. Nothing in the
-- schema has ever stopped it: watchlist_items has RLS for whose rows they are and
-- no rule at all about how many.
--
-- Every limit check lived in React. That is a courtesy to the user, not a
-- constraint on the data: it is one client among several paths to the same
-- PostgREST endpoint, it can be skipped by a second tab racing the first, and
-- adding a screen that writes the same table means writing the check again and
-- remembering to. The watchlist is written from two screens and only one of them
-- ever asked.
--
-- The rule stays where the operator sets it. This reads plans.limits and
-- system_settings at the moment of the write, so raising a plan in the admin
-- panel raises the ceiling immediately, with no deploy — which is the standing
-- requirement for everything on this platform.
--
-- Idempotent.

-- ============================================================================
-- 1) What a tenant's plan allows
-- ============================================================================
-- A tenant with no active subscription falls to the plan marked is_default rather
-- than to unlimited. An absent limit key still means unlimited — that is the
-- documented meaning, and 025 keeps the keys that matter from going absent by
-- accident.

create or replace function public.tenant_limit(p_tenant_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select (p.limits ->> p_key)::int
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
      where s.tenant_id = p_tenant_id and s.status = 'active'
      order by s.created_at desc
      limit 1),
    (select (p.limits ->> p_key)::int
       from public.plans p
      where p.is_default
      limit 1),
    -1
  )
$$;

revoke all on function public.tenant_limit(uuid, text) from public;
grant execute on function public.tenant_limit(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 2) One trigger, told which limit it is guarding
-- ============================================================================
-- TG_ARGV[0] is the key in plans.limits; TG_ARGV[1] is an optional predicate for
-- limits that count a subset of the table, like reports awaiting review. Both
-- come from this file, never from a request.

create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key       text := tg_argv[0];
  v_predicate text := coalesce(tg_argv[1], 'true');
  v_enabled   boolean;
  v_grace     numeric;
  v_limit     integer;
  v_count     bigint;
  v_ceiling   integer;
begin
  -- No JWT means this is a migration, a seed, or the service role: paths that
  -- bypass RLS entirely and are trusted by construction. Enforcing a customer
  -- plan against them would only break our own tooling.
  if public.get_current_user_id() is null then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  select coalesce((value ->> 'enabled')::boolean, true),
         coalesce((value ->> 'grace_percent')::numeric, 0)
    into v_enabled, v_grace
    from public.system_settings
   where key = 'entitlements_enforcement';

  if not coalesce(v_enabled, true) then
    return new;
  end if;

  v_limit := public.tenant_limit(new.tenant_id, v_key);
  if v_limit is null or v_limit < 0 then      -- absent or -1: unlimited
    return new;
  end if;

  -- Two requests can each read a count of 2 against a limit of 3 and both write.
  -- The lock is per tenant and per limit, so it serialises only the writers that
  -- could actually overrun each other.
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':' || v_key, 0));

  execute format('select count(*) from public.%I where tenant_id = $1 and (%s)',
                 tg_table_name, v_predicate)
     into v_count
    using new.tenant_id;

  v_ceiling := floor(v_limit * (1 + v_grace / 100.0));

  if v_count >= v_ceiling then
    raise exception 'بلغت حد باقتك (% من %). ارفع الباقة أو احذف عنصراً.', v_count, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 3) Where it applies
-- ============================================================================

drop trigger if exists enforce_watchlist_limit on public.watchlist_items;
create trigger enforce_watchlist_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_plan_limit('watchlist_items');

-- Seats need their own function: a seat is held by an account or by an invitation
-- waiting to be accepted, and counting the two tables separately lets a company
-- at its limit issue a full set of invites on top. The invite is the moment the
-- seat is spent, so that is where it has to be counted.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enabled boolean;
  v_grace   numeric;
  v_limit   integer;
  v_taken   bigint;
begin
  if public.get_current_user_id() is null or public.is_platform_admin() then
    return new;
  end if;

  select coalesce((value ->> 'enabled')::boolean, true),
         coalesce((value ->> 'grace_percent')::numeric, 0)
    into v_enabled, v_grace
    from public.system_settings
   where key = 'entitlements_enforcement';

  if not coalesce(v_enabled, true) then
    return new;
  end if;

  v_limit := public.tenant_limit(new.tenant_id, 'users');
  if v_limit is null or v_limit < 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':users', 0));

  -- An invite matching this email is the same seat, not a second one. Without
  -- this, accepting an invitation counts twice for the instant between the
  -- account appearing and the invitation being closed, and the last seat a
  -- company has can never be filled.
  select (select count(*) from public.users u
           where u.tenant_id = new.tenant_id
             and u.status <> 'inactive'
             and lower(u.email) <> lower(new.email))
       + (select count(*) from public.pending_invites i
           where i.tenant_id = new.tenant_id
             and i.status = 'pending'
             and i.expires_at > now()
             and lower(i.email) <> lower(new.email))
    into v_taken;

  if v_taken >= floor(v_limit * (1 + v_grace / 100.0)) then
    raise exception 'بلغت حد المستخدمين في باقتك (% من %، بما فيها الدعوات المعلّقة).', v_taken, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_users_limit on public.users;
create trigger enforce_users_limit
  before insert on public.users
  for each row when (new.tenant_id is not null)
  execute function public.enforce_seat_limit();

drop trigger if exists enforce_pending_invites_limit on public.pending_invites;
create trigger enforce_pending_invites_limit
  before insert on public.pending_invites
  for each row execute function public.enforce_seat_limit();

-- Reports awaiting review, not reports in total: the limit is on how much a
-- company can put in the queue at once, and an approved report has left it.
drop trigger if exists enforce_pending_reports_limit on public.reports;
create trigger enforce_pending_reports_limit
  before insert on public.reports
  for each row execute function public.enforce_plan_limit('pending_reports', 'status = ''pending_review''');

-- ============================================================================
-- 4) What is already over
-- ============================================================================
-- The trigger fires on insert, so rows written before it stay. Deleting a
-- customer's data to satisfy a rule introduced afterwards is not this
-- migration's call — it reports, and a human decides.

do $$
declare r record;
begin
  for r in
    select t.name, count(w.id) as have, public.tenant_limit(t.id, 'watchlist_items') as allowed
      from public.tenants t
      left join public.watchlist_items w on w.tenant_id = t.id
     group by t.id, t.name
    having public.tenant_limit(t.id, 'watchlist_items') >= 0
       and count(w.id) > public.tenant_limit(t.id, 'watchlist_items')
  loop
    raise notice 'تجاوز قائم: % — % من %', r.name, r.have, r.allowed;
  end loop;
end $$;
