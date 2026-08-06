-- Migration: 113_no_expiry_is_an_absence_not_a_century.sql
-- Purpose: two subscriptions end on 24/08/2126. Nobody typed that.
--
-- ============================================================================
-- Where it came from
-- ============================================================================
-- Migration 011, putting every existing tenant on the default plan:
--
--     insert into public.subscriptions (…, current_period_end)
--     select t.id, p.id, 'active', now(), (now() + interval '100 years')
--
-- with a comment that says exactly what it was working around:
--
--     «The far-future period end is what "does not expire" looks like in a
--      column declared not null.»
--
-- So it is not a typo. It is a column that refuses to say "no expiry", and a
-- migration inventing a date to mean it. The extra month — 2126-07-25 became
-- 2126-08-24 — came from the renew button, which is written to extend an
-- unexpired term rather than shorten it, and dutifully added thirty days to a
-- century.
--
-- ============================================================================
-- Why the workaround has to go rather than be tidied
-- ============================================================================
-- Both readers of this column already understand the honest form:
--
--     my_entitlements:      (s.current_period_end is null or s.current_period_end > now())
--     report_access_state:  the same test
--
-- The code was written for a nullable column all along; only the column
-- disagreed. So a free plan that never expires is one where the end date is
-- absent — not one where it is a hundred years away and every screen has to
-- decide whether to believe it.
--
-- The alternative — leaving the century and teaching each screen to hide it —
-- is what produced «⚠️ تاريخ غير معقول» in the first place: a warning about a
-- value the system had written itself.

alter table public.subscriptions
  alter column current_period_end drop not null;

comment on column public.subscriptions.current_period_end is
  'نهاية المدة. NULL تعني بلا انتهاء — وهي الصيغة التي يفهمها my_entitlements وreport_access_state أصلاً. لا تُستخدم تواريخ بعيدة للتعبير عن ذلك.';

-- The rows 011 invented. Bounded to what it wrote — anything beyond fifty years
-- is that migration or the renew button adding to it — so a term an operator
-- deliberately set for a few years is left alone.
update public.subscriptions
   set current_period_end = null,
       updated_at = now()
 where current_period_end > now() + interval '50 years';

-- ============================================================================
-- The admin screen needs to be able to say it too
-- ============================================================================
-- admin_set_subscription took the end date as a nullable parameter, where null
-- means "leave it". There was no way to say "remove it", so the only route to a
-- non-expiring subscription was the century this migration just deleted.
--
-- Dropped and recreated rather than replaced: the signature changes, and CREATE
-- OR REPLACE with a different argument list leaves the old function in place as
-- an overload. Two functions with the same name and different rules is worse
-- than either.
drop function if exists public.admin_set_subscription(uuid, text, uuid, text, timestamptz);

create function public.admin_set_subscription(
  p_subscription_id uuid,
  p_reason text,
  p_plan_id uuid default null,
  p_status text default null,
  p_period_end timestamptz default null,
  p_no_expiry boolean default false)
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

  if p_no_expiry and p_period_end is not null then
    return jsonb_build_object('ok', false,
      'reason', 'إمّا بلا انتهاء وإمّا تاريخ — لا الاثنان');
  end if;

  -- Three cases, and only the third invents anything: clear it, set it, or
  -- leave whatever is there.
  v_end := case when p_no_expiry then null
                when p_period_end is not null then p_period_end
                else v_row.current_period_end end;

  if v_end is not null and v_end > now() + interval '5 years' then
    return jsonb_build_object('ok', false,
      'reason', 'التاريخ أبعد من خمس سنوات — إن كان الاشتراك بلا انتهاء فاختر «بلا انتهاء»');
  end if;

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
                             'status', p_status, 'period_end', p_period_end,
                             'no_expiry', p_no_expiry));

  return jsonb_build_object(
    'ok', true,
    'status', v_row.status,
    'planId', v_row.plan_id,
    'periodEnd', v_row.current_period_end,
    'isLive', v_row.status = 'active'
              and (v_row.current_period_end is null or v_row.current_period_end > now()));
end $$;

comment on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz, boolean) is
  'الطريق الوحيد لتغيير اشتراك: صلاحية إدارة، وسبب مكتوب، وتاريخ معقول أو بلا انتهاء صراحةً. يكتب السجل في المعاملة نفسها.';

-- A DROP re-applies the schema default on the new function, which on Supabase
-- grants EXECUTE to anon. Said again because it was just dropped.
revoke all on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_set_subscription(uuid, text, uuid, text, timestamptz, boolean) to authenticated;

-- ============================================================================
-- Prove it
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_sub   uuid;
  v_res   jsonb;
  v_n     int;
  v_live  boolean;
begin
  begin
    select count(*) into v_n from public.subscriptions
     where current_period_end > now() + interval '50 years';
    if v_n > 0 then raise exception 'بقي % اشتراكاً بتاريخ بعد خمسين سنة', v_n; end if;

    select id into v_admin from public.users where role = 'platform_admin' limit 1;
    select id into v_sub from public.subscriptions limit 1;
    if v_admin is null or v_sub is null then
      raise notice 'لا بيانات كافية للفحص';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- "No expiry" is now sayable, and means what the engine already reads.
    v_res := public.admin_set_subscription(v_sub, 'باقة مجانية دائمة', null, 'active', null, true);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'تعذّر ضبط «بلا انتهاء»: %', v_res;
    end if;
    if v_res ->> 'periodEnd' is not null then
      raise exception 'التاريخ لم يُمسح: %', v_res ->> 'periodEnd';
    end if;
    if not coalesce((v_res ->> 'isLive')::boolean, false) then
      raise exception 'اشتراك بلا انتهاء لا يُعتبر قائماً';
    end if;

    -- And the engine agrees, which is the whole point of removing the century.
    select (s.status = 'active'
            and (s.current_period_end is null or s.current_period_end > now()))
      into v_live from public.subscriptions s where s.id = v_sub;
    if not v_live then raise exception 'محرّك الصلاحيات لا يعتبره قائماً'; end if;

    -- Both at once is refused rather than silently preferring one.
    v_res := public.admin_set_subscription(v_sub, 'فحص', null, null, now() + interval '30 days', true);
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'قُبل «بلا انتهاء» مع تاريخ';
    end if;

    -- The five-year guard still stands, and now says what to do instead.
    v_res := public.admin_set_subscription(v_sub, 'فحص', null, null, now() + interval '100 years', false);
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'قُبل تاريخ بعد مئة سنة';
    end if;

    raise notice '✅ «بلا انتهاء» غياب لا قرن، والحارس ما زال قائماً';
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
