-- Migration: 093_decision_timestamps.sql
-- Purpose: two decisions written in one transaction carry the same timestamp,
--          so "the latest one" is whichever the planner happened to return.
--
-- ============================================================================
-- How it shows up
-- ============================================================================
-- partner_overview reports whether a partnership began by application or by
-- appointment, by taking the most recent approved row per tenant. It ordered by
-- decided_at, which both functions set with now().
--
-- now() is the transaction timestamp, constant for the whole transaction. And
-- grant_partnership writes two rows in one transaction whenever it appoints a
-- company that had also applied: it approves the pending application, then
-- inserts the appointment. Both get the same decided_at, distinct on picks
-- arbitrarily, and the panel reports an appointment as an application.
--
-- The probe hit it because it exercised both paths on one tenant. In production
-- it needs no coincidence at all — appointing any company that had applied is
-- enough.
--
-- clock_timestamp() reads the wall clock at the moment the row is written, which
-- is what an audit timestamp is supposed to mean. The ordering then reflects the
-- order the decisions were actually made in.

create or replace function public.decide_partnership(
  p_application_id uuid,
  p_approve        boolean,
  p_reason         text,
  p_months         integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_app     public.partner_applications%rowtype;
  v_plan    uuid;
  v_months  int;
  v_ends    timestamptz;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'قرار الشراكة من صلاحيات إدارة مرصد');
  end if;
  if coalesce(trim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'القرار يحتاج سبباً — يُعرض للشركة');
  end if;

  select * into v_app from public.partner_applications where id = p_application_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الطلب غير موجود');
  end if;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'الطلب محسوم مسبقاً');
  end if;

  update public.partner_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = public.get_current_user_id(),
         decided_at = clock_timestamp(),
         decision_reason = trim(p_reason)
   where id = p_application_id;

  if not p_approve then
    return jsonb_build_object('ok', true, 'approved', false);
  end if;

  select id into v_plan from public.plans where code = 'partner';
  if v_plan is null then
    raise exception 'باقة الشركاء غير موجودة';
  end if;

  select coalesce(p_months, (value ->> 'grant_months')::int, 12) into v_months
    from public.system_settings where key = 'partner_program';
  v_months := greatest(1, least(coalesce(v_months, 12), 60));
  v_ends := now() + (v_months || ' months')::interval;

  insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (v_app.tenant_id, v_plan, 'active', now(), v_ends)
  on conflict (tenant_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'approved', true, 'until', v_ends, 'months', v_months);
end $fn$;

create or replace function public.grant_partnership(
  p_tenant_id uuid,
  p_reason    text,
  p_months    integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tenant  public.tenants%rowtype;
  v_plan    uuid;
  v_months  int;
  v_ends    timestamptz;
  v_snap    jsonb;
  v_app     uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'تعيين الشركاء من صلاحيات إدارة مرصد');
  end if;
  if coalesce(trim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'التعيين يحتاج سبباً — يُعرض للشركة');
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;
  if v_tenant.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'حساب الشركة غير نشط');
  end if;

  if exists (select 1 from public.subscriptions s
               join public.plans p on p.id = s.plan_id
              where s.tenant_id = p_tenant_id and s.status = 'active' and p.code = 'partner'
                and (s.current_period_end is null or s.current_period_end > now())) then
    return jsonb_build_object('ok', false, 'reason', 'الشركة شريك بالفعل');
  end if;

  select id into v_plan from public.plans where code = 'partner';
  if v_plan is null then
    raise exception 'باقة الشركاء غير موجودة';
  end if;

  select coalesce(p_months, (value ->> 'grant_months')::int, 12) into v_months
    from public.system_settings where key = 'partner_program';
  v_months := greatest(1, least(coalesce(v_months, 12), 60));
  v_ends := now() + (v_months || ' months')::interval;

  select jsonb_build_object(
      'reports_approved', count(*) filter (where r.status = 'approved'),
      'reports_total',    count(*),
      'companies_added',  (select count(*) from public.audit_logs al
                            where al.tenant_id = p_tenant_id and al.action = 'company_add_requested'),
      'at',               clock_timestamp())
    into v_snap
    from public.reports r where r.reporter_tenant_id = p_tenant_id;

  -- Closed first, and stamped before the appointment below, so the two rows are
  -- ordered by the clock rather than tied.
  update public.partner_applications
     set status = 'approved', decided_by = public.get_current_user_id(),
         decided_at = clock_timestamp(),
         decision_reason = coalesce(decision_reason, '') || trim(p_reason)
   where tenant_id = p_tenant_id and status = 'pending';

  insert into public.partner_applications
    (tenant_id, note, snapshot, status, origin, decided_by, decided_at, decision_reason)
  values (p_tenant_id, null, v_snap, 'approved', 'appointed',
          public.get_current_user_id(), clock_timestamp(), trim(p_reason))
  returning id into v_app;

  insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (p_tenant_id, v_plan, 'active', now(), v_ends)
  on conflict (tenant_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'application_id', v_app,
                            'until', v_ends, 'months', v_months, 'snapshot', v_snap);
end $fn$;

-- ============================================================================
-- Prove the ordering holds when both rows are written together
-- ============================================================================
create temporary table _093_before on commit drop as
  select s.* from public.subscriptions s
   where s.tenant_id = (select u.tenant_id from public.users u
                         where u.role = 'company_admin' and u.tenant_id is not null limit 1);

do $blk$
declare
  v_admin text; v_tadmin text; v_tenant uuid; v_res jsonb; v_origin text; v_n int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select u.id, u.tenant_id into v_tadmin, v_tenant
    from public.users u where u.role = 'company_admin' and u.tenant_id is not null limit 1;
  if v_tenant is null then raise notice 'لا مدير شركة للفحص'; return; end if;

  -- The exact production sequence that was ambiguous: the company applies, then
  -- Marsad appoints it instead of answering the application.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tadmin)::text, true);
  v_res := public.apply_for_partnership('فحص المهاجرة 093');
  if not (v_res->>'ok')::boolean then raise exception 'فشل التقديم'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_res := public.grant_partnership(v_tenant, 'فحص المهاجرة 093', 6);
  if not (v_res->>'ok')::boolean then raise exception 'فشل التعيين: %', v_res->>'reason'; end if;

  select origin into v_origin from public.partner_overview() where tenant_id = v_tenant;
  if v_origin is distinct from 'appointed' then
    raise exception 'الأصل المسجَّل % بدل appointed', coalesce(v_origin, 'فارغ');
  end if;

  -- And the application it superseded is not left waiting in the queue.
  select count(*) into v_n from public.partner_applications
   where tenant_id = v_tenant and status = 'pending';
  if v_n <> 0 then raise exception 'بقي طلب معلّق بعد التعيين'; end if;

  perform public.revoke_partnership(v_tenant, 'فحص المهاجرة 093');
  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ التعيين يُقرأ تعييناً حتى لو سبقه طلب في نفس اللحظة';
end $blk$;

update public.subscriptions s
   set plan_id = b.plan_id, status = b.status,
       current_period_start = b.current_period_start,
       current_period_end = b.current_period_end,
       updated_at = now()
  from _093_before b
 where s.tenant_id = b.tenant_id;

delete from public.partner_applications
 where decision_reason like '%فحص المهاجرة 093%' or note = 'فحص المهاجرة 093';

do $blk$
declare v_bad int;
begin
  select count(*) into v_bad from public.partner_applications;
  if v_bad > 0 then raise exception 'بقيت % سجلات من الفحص', v_bad; end if;
  select count(*) into v_bad from public.subscriptions s
    join _093_before b on b.tenant_id = s.tenant_id
   where s.plan_id is distinct from b.plan_id or s.status is distinct from b.status;
  if v_bad > 0 then raise exception 'لم يُستعد الاشتراك'; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
