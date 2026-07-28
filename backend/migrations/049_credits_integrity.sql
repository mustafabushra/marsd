-- Migration: 049_credits_integrity.sql
-- Purpose: credits are earned by events the database witnessed, not by a request
--          that names an action; and spending is atomic.
--
-- ============================================================================
-- What was wrong
-- ============================================================================
-- POST /api/award-credits granted points from `body.action` alone. It never
-- checked that the action happened. The only dedupe was a partial unique index
-- covering report_approved with a non-null report_id, so company_added,
-- company_completed and documents_uploaded had no dedupe and no verification at
-- all — a signed-in user could loop the endpoint and mint the full monthly cap
-- without doing anything. The free plan is the only plan that earns and gets one
-- search a month, and credits buy searches, so this converted directly into the
-- product other customers pay for. The ledger already holds five company_added
-- rows with no linked entity.
--
-- The three earn actions are not client actions at all. Every one of them is an
-- administrator approving something:
--
--   report_approved    ← reports.status becomes 'approved'
--   company_added      ← registration_requests.status becomes 'approved'
--   company_completed  ← company_data_requests.status becomes 'approved'
--
-- So the event is a state transition this database performs. Granting belongs
-- where that transition happens, where it cannot be claimed by anyone who did
-- not cause it. The endpoint keeps only spending, which is genuinely initiated
-- by the customer.
--
-- documents_uploaded stays in the settings with no trigger: nothing in the
-- product emits it. It is unreachable rather than exploitable, and saying so is
-- better than wiring an event that does not exist.

-- ============================================================================
-- 1) A ledger row must name what caused it
-- ============================================================================
-- report_id could only ever describe one of the three sources. A generic pair
-- lets one unique index cover every earn type instead of one type.

alter table public.credits_ledger
  add column if not exists source_table text,
  add column if not exists source_id    uuid;

comment on column public.credits_ledger.source_table is
  'الجدول الذي وقع فيه الحدث المانح — لمنع منح النقاط مرتين على الحدث نفسه';
comment on column public.credits_ledger.source_id is
  'معرّف الصف الذي وقع عليه الحدث';

-- Existing report awards already carry their source in report_id.
update public.credits_ledger
   set source_table = 'reports', source_id = report_id
 where report_id is not null
   and source_id is null;

-- One award per event, whatever the event was.
drop index if exists idx_credits_one_award_per_report;
create unique index if not exists idx_credits_one_award_per_event
  on public.credits_ledger (source_table, source_id, reason)
  where source_id is not null and amount > 0;

-- ============================================================================
-- 2) Granting, in the transaction that witnessed the event
-- ============================================================================
-- SECURITY DEFINER because credits_ledger takes inserts only from service_role
-- — the balance decides what a plan allows, so the party it benefits must not
-- be able to write it. The rate, the plan's eligibility and the monthly ceiling
-- are read here from the same settings the admin panel edits.
--
-- The advisory lock is taken on the tenant, so two events approved at the same
-- instant cannot both read the same monthly total and both grant against it.

create or replace function public.grant_credits(
  p_tenant_id    uuid,
  p_reason       text,
  p_source_table text,
  p_source_id    uuid,
  p_user_id      text default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rules   jsonb;
  v_points  integer;
  v_cap     integer;
  v_earned  integer;
  v_grant   integer;
  v_enabled boolean;
begin
  if p_tenant_id is null or p_reason is null then
    return 0;
  end if;

  -- Does this tenant's plan earn at all?
  select coalesce(pl.give_to_get_enabled, false) into v_enabled
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
   where s.tenant_id = p_tenant_id;
  if not coalesce(v_enabled, false) then
    return 0;
  end if;

  select value into v_rules from public.system_settings where key = 'give_to_get_rules';
  v_points := coalesce((v_rules -> 'earn' -> p_reason ->> 'points')::integer, 0);
  if v_points <= 0 then
    return 0;
  end if;

  -- Serialise every grant and spend for this tenant. Without it, the ceiling is
  -- read by two transactions that then both write against the same headroom.
  perform pg_advisory_xact_lock(hashtext('credits:' || p_tenant_id::text));

  v_cap := coalesce((v_rules ->> 'monthly_earn_cap')::integer, 0);
  v_grant := v_points;

  if v_cap > 0 then
    -- Positive rows only: spending must not create room to earn again.
    -- Summed in SQL, not read into the application and added up there — a
    -- PostgREST read is capped at 1000 rows and returns 200 without saying so,
    -- which would silently uncap the month once a tenant passed that many rows.
    select coalesce(sum(amount), 0)::integer into v_earned
      from public.credits_ledger
     where tenant_id = p_tenant_id
       and amount > 0
       and created_at >= date_trunc('month', now());

    v_grant := greatest(0, least(v_points, v_cap - v_earned));
    if v_grant <= 0 then
      return 0;
    end if;
  end if;

  -- The unique index refuses a second award for the same event, which matters
  -- because approval gets repeated: a double click, a reopened review, a status
  -- corrected back to approved.
  insert into public.credits_ledger
    (tenant_id, user_id, amount, reason, report_id, source_table, source_id)
  values
    (p_tenant_id, p_user_id, v_grant, p_reason,
     case when p_source_table = 'reports' then p_source_id else null end,
     p_source_table, p_source_id)
  on conflict do nothing;

  if not found then
    return 0;
  end if;

  return v_grant;
end $$;

comment on function public.grant_credits is
  'منح النقاط على حدث وقع فعلاً في القاعدة — لا يُنادى من المتصفح';

revoke all on function public.grant_credits(uuid, text, text, uuid, text) from public, anon, authenticated;

-- ============================================================================
-- 3) The three events
-- ============================================================================

create or replace function public.award_on_report_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved' then
    perform public.grant_credits(
      new.reporter_tenant_id, 'report_approved', 'reports', new.id, new.reviewed_by);
  end if;
  return new;
end $$;

drop trigger if exists award_credits_on_report_approved on public.reports;
create trigger award_credits_on_report_approved
  after update on public.reports
  for each row execute function public.award_on_report_approved();

create or replace function public.award_on_registration_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved' then
    perform public.grant_credits(
      new.tenant_id, 'company_added', 'registration_requests', new.id, new.reviewed_by);
  end if;
  return new;
end $$;

drop trigger if exists award_credits_on_registration_approved on public.registration_requests;
create trigger award_credits_on_registration_approved
  after update on public.registration_requests
  for each row execute function public.award_on_registration_approved();

create or replace function public.award_on_data_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved' then
    perform public.grant_credits(
      new.requested_by_tenant_id, 'company_completed', 'company_data_requests', new.id, null);
  end if;
  return new;
end $$;

drop trigger if exists award_credits_on_data_request_approved on public.company_data_requests;
create trigger award_credits_on_data_request_approved
  after update on public.company_data_requests
  for each row execute function public.award_on_data_request_approved();

-- ============================================================================
-- 4) Spending, atomically
-- ============================================================================
-- The endpoint read the ledger, summed it in JavaScript, compared, then
-- inserted — four steps with no transaction and no lock, so two concurrent
-- requests read the same balance and both spent it. And the read was capped at
-- 1000 rows, so past that the balance itself was wrong.
--
-- Read, check and write in one statement sequence under one lock, with the sum
-- computed by the database.

create or replace function public.spend_credits(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   text := public.get_current_user_id();
  v_tenant_id uuid;
  v_cost      integer;
  v_balance   integer;
  v_enabled   boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('spent', 0, 'reason', 'غير مصرّح');
  end if;

  select tenant_id into v_tenant_id from public.users where id = v_user_id;
  if v_tenant_id is null then
    return jsonb_build_object('spent', 0, 'reason', 'لا يوجد كيان مرتبط');
  end if;

  select coalesce(pl.give_to_get_enabled, false) into v_enabled
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
   where s.tenant_id = v_tenant_id;
  if not coalesce(v_enabled, false) then
    -- A paid plan does not draw on credits; the caller should simply proceed.
    return jsonb_build_object('spent', 0, 'reason', 'الباقة لا تستخدم النقاط', 'proceed', true);
  end if;

  v_cost := coalesce(
    (select (value -> 'spend' -> p_action ->> 'points')::integer
       from public.system_settings where key = 'give_to_get_rules'), 0);
  if v_cost <= 0 then
    return jsonb_build_object('spent', 0, 'reason', 'لا تكلفة لهذا الإجراء', 'proceed', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || v_tenant_id::text));

  select coalesce(sum(amount), 0)::integer into v_balance
    from public.credits_ledger where tenant_id = v_tenant_id;

  if v_balance < v_cost then
    return jsonb_build_object('spent', 0, 'balance', v_balance,
                              'reason', 'الرصيد لا يكفي', 'insufficient', true);
  end if;

  insert into public.credits_ledger (tenant_id, user_id, amount, reason)
  values (v_tenant_id, v_user_id, -v_cost, p_action);

  return jsonb_build_object('spent', v_cost, 'balance', v_balance - v_cost);
end $$;

comment on function public.spend_credits is
  'خصم النقاط ذرّياً — القراءة والفحص والكتابة تحت قفل واحد، والمجموع يُحسب في القاعدة';

grant execute on function public.spend_credits(text) to authenticated;

-- ============================================================================
-- 5) The balance, computed where the data lives
-- ============================================================================
create or replace function public.my_credit_balance()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(cl.amount), 0)::integer
    from public.credits_ledger cl
    join public.users u on u.tenant_id = cl.tenant_id
   where u.id = public.get_current_user_id();
$$;

grant execute on function public.my_credit_balance() to authenticated;

-- ============================================================================
-- 6) Verify
-- ============================================================================
do $$
declare
  v_bad int;
begin
  -- The old report-only index must be gone and the generic one present.
  if not exists (select 1 from pg_indexes
                  where tablename = 'credits_ledger'
                    and indexname = 'idx_credits_one_award_per_event') then
    raise exception 'فهرس منع التكرار العام غير موجود';
  end if;

  -- Every earn action in the settings must have a trigger that can emit it,
  -- or be knowingly unreachable.
  select count(*) into v_bad from pg_trigger
   where tgname in ('award_credits_on_report_approved',
                    'award_credits_on_registration_approved',
                    'award_credits_on_data_request_approved');
  if v_bad <> 3 then
    raise exception 'مشغّلات المنح الناقصة: متوقّع 3، موجود %', v_bad;
  end if;

  raise notice '✅ المنح مربوط بأحداث القاعدة · الخصم ذرّي · الرصيد يُحسب في القاعدة';
end $$;
