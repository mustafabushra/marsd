-- Migration: 089_invite_company_from_server.sql
-- Purpose: invite_company refuses the server that is allowed to call it.
--
-- ============================================================================
-- The failure
-- ============================================================================
-- Pressing "دعوة الشركة لاستلام سجلّها" as a platform admin returns
-- "دعوة الشركات من صلاحيات إدارة مرصد". The message looks like the endpoint's
-- 403, and it is not — it is the function's own refusal, with the same wording.
--
-- The chain: the browser sends its Clerk token to /api/invite-user, which
-- verifies it and confirms in the database that the caller is a platform admin.
-- That part works. Then it calls invite_company() through the Supabase client
-- built with the SERVICE ROLE key — because the Clerk secret cannot go to the
-- browser, so the whole thing has to run server-side.
--
-- The service role key is a JWT with role=service_role and no `sub`. So inside
-- the function auth.jwt() ->> 'sub' is null, get_current_user_id() is null,
-- is_platform_admin() is false, and the function refuses the one caller that had
-- already proved who it was.
--
-- This is the same shape as 076: SECURITY DEFINER changes what the function may
-- do, never who it thinks is calling. I wrote the endpoint and the function in
-- the same session and still connected them as if the identity travelled.
--
-- ============================================================================
-- The fix, without turning the service key into a skeleton key
-- ============================================================================
-- The server path names the administrator it already authenticated, and the
-- function checks that name against the users table itself. So holding the
-- service key is not enough: the call must also name a real, active platform
-- admin, and that admin is what lands in the audit trail.
--
-- The browser path is untouched — no p_actor_id, and is_platform_admin() as
-- before. Passing p_actor_id from a browser session is ignored, so a company
-- user cannot borrow an admin's id.

create or replace function public.invite_company(
  p_company_id uuid,
  p_email      text,
  p_note       text default null,
  p_actor_id   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_co      public.companies%rowtype;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_service boolean;
  v_actor   text;
  v_tenant  uuid;
  v_members int;
  v_invite  uuid;
begin
  -- PostgREST puts the key's claims here. The service role key carries
  -- role=service_role and no subject; a signed-in person carries a subject.
  v_service := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';

  if v_service then
    if coalesce(trim(coalesce(p_actor_id, '')), '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'الدعوة من الخادم يجب أن تُنسب لمسؤول');
    end if;
    -- Checked here and not taken on trust: the endpoint verifying the session is
    -- one layer, and this is the layer that does not depend on it being correct.
    if not exists (select 1 from public.users u
                    where u.id = p_actor_id and u.role = 'platform_admin' and u.status = 'active') then
      return jsonb_build_object('ok', false, 'reason', 'المسؤول المذكور ليس مديراً نشطاً في مرصد');
    end if;
    v_actor := p_actor_id;
  elsif coalesce(public.is_platform_admin(), false) then
    -- A browser session identifies itself; anything it claims here is ignored.
    v_actor := public.get_current_user_id();
  else
    return jsonb_build_object('ok', false, 'reason', 'دعوة الشركات من صلاحيات إدارة مرصد');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    return jsonb_build_object('ok', false, 'reason', 'صيغة البريد غير صحيحة');
  end if;

  select * into v_co from public.companies where id = p_company_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;
  if not v_co.approved then
    return jsonb_build_object('ok', false, 'reason', 'السجل غير معتمد بعد — يُعتمد أولاً');
  end if;

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id limit 1;

  if v_tenant is not null then
    select count(*) into v_members
      from public.users u where u.tenant_id = v_tenant and u.status = 'active';
    if v_members > 0 then
      return jsonb_build_object('ok', false, 'reason', 'الشركة استلمت سجلّها بالفعل');
    end if;
  else
    -- tenants.cr_number and tenants.email are both unique and not null. Say which
    -- one is taken rather than letting a constraint name reach the screen.
    if exists (select 1 from public.tenants t where t.cr_number = v_co.cr_number) then
      return jsonb_build_object('ok', false, 'reason',
        'السجل التجاري مستخدم في حساب شركة آخر — يُراجَع التكرار أولاً');
    end if;
    if exists (select 1 from public.tenants t where lower(t.email) = v_email) then
      return jsonb_build_object('ok', false, 'reason', 'هذا البريد مستخدم في حساب شركة آخر');
    end if;

    insert into public.tenants (name, cr_number, email, phone, sector, city, company_id, status)
    values (v_co.name, v_co.cr_number, v_email, v_co.phone, v_co.sector, v_co.city,
            p_company_id, 'active')
    returning id into v_tenant;
  end if;

  if exists (select 1 from public.users u where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'reason', 'هذا البريد مسجّل لمستخدم آخر في مرصد');
  end if;

  select id into v_invite
    from public.pending_invites
   where tenant_id = v_tenant and lower(email) = v_email and status = 'pending'
   limit 1;

  if v_invite is null then
    insert into public.pending_invites (tenant_id, email, role, invited_by, status, expires_at)
    values (v_tenant, v_email, 'company_admin', v_actor, 'pending', now() + interval '7 days')
    returning id into v_invite;
  else
    update public.pending_invites
       set expires_at = now() + interval '7 days', invited_by = v_actor
     where id = v_invite;
  end if;

  if v_co.official_email is null then
    perform set_config('marsad.change_reason',
      'استُكمل البريد الرسمي من دعوة استلام السجل', true);
    update public.companies set official_email = v_email where id = p_company_id;
    perform set_config('marsad.change_reason', '', true);
  end if;

  insert into public.company_audit_log (company_id, action, actor_id, change_reason, new_values, created_at)
  values (p_company_id, 'claim_invited', v_actor,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'دعوة الشركة لاستلام سجلّها'),
          jsonb_build_object('email', v_email, 'tenant_id', v_tenant, 'invite_id', v_invite),
          now());

  return jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'invite_id', v_invite, 'email', v_email);
end $fn$;

-- The old three-argument signature would keep answering and keep refusing the
-- server, so it goes.
drop function if exists public.invite_company(uuid, text, text);

grant execute on function public.invite_company(uuid, text, text, text) to authenticated;
revoke all on function public.invite_company(uuid, text, text, text) from public, anon;

-- ============================================================================
-- Prove the server path works and cannot be borrowed
-- ============================================================================
do $blk$
declare
  v_admin text; v_member text; v_co uuid; v_res jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' and status = 'active' limit 1;
  select id into v_member from public.users where role <> 'platform_admin' and status = 'active' limit 1;
  select c.id into v_co from public.companies c
   where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
   limit 1;
  if v_co is null then raise notice 'لا سجل بلا مالك للفحص'; return; end if;

  -- 1) The server, as it actually calls: service_role claims, admin named.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_res := public.invite_company(v_co, 'probe-089@example.com', 'فحص', null);
  if (v_res->>'ok')::boolean then raise exception 'قُبلت دعوة من الخادم بلا مسؤول'; end if;

  v_res := public.invite_company(v_co, 'probe-089@example.com', 'فحص', 'user_does_not_exist');
  if (v_res->>'ok')::boolean then raise exception 'قُبل مسؤول غير موجود'; end if;

  if v_member is not null then
    v_res := public.invite_company(v_co, 'probe-089@example.com', 'فحص', v_member);
    if (v_res->>'ok')::boolean then raise exception 'قُبل مستخدم عادي كمسؤول'; end if;
  end if;

  v_res := public.invite_company(v_co, 'probe-089@example.com', 'فحص', v_admin);
  if not (v_res->>'ok')::boolean then
    raise exception 'رُفضت الدعوة من الخادم: %', v_res->>'reason';
  end if;

  -- The audit names the administrator, not "nobody".
  if not exists (select 1 from public.company_audit_log
                  where company_id = v_co and action = 'claim_invited' and actor_id = v_admin) then
    raise exception 'الدعوة لم تُنسب لمسؤول في السجل';
  end if;

  raise notice '✅ مسار الخادم يعمل وينسب الدعوة لمن أذن بها';
end $blk$;

-- Undo the invitation the check sent.
delete from public.pending_invites where email = 'probe-089@example.com';
delete from public.tenants t
 where t.email = 'probe-089@example.com'
   and not exists (select 1 from public.users u where u.tenant_id = t.id);
update public.companies set official_email = null where official_email = 'probe-089@example.com';
delete from public.company_audit_log
 where action = 'claim_invited' and new_values->>'email' = 'probe-089@example.com';

-- ============================================================================
-- And a browser session still works exactly as before
-- ============================================================================
do $blk$
declare v_admin text; v_member text; v_co uuid; v_res jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_member from public.users where role <> 'platform_admin' and status = 'active' limit 1;
  select c.id into v_co from public.companies c
   where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
   limit 1;
  if v_co is null then return; end if;

  -- A company member naming the admin must still be refused: the browser branch
  -- ignores p_actor_id entirely.
  if v_member is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);
    v_res := public.invite_company(v_co, 'probe-089b@example.com', null, v_admin);
    if (v_res->>'ok')::boolean then
      raise exception 'عضو شركة انتحل صفة مسؤول عبر p_actor_id';
    end if;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_res := public.invite_company(v_co, 'probe-089b@example.com', null);
  if not (v_res->>'ok')::boolean then
    raise exception 'رُفضت دعوة من المتصفح: %', v_res->>'reason';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ مسار المتصفح كما كان، ولا يُنتحل';
end $blk$;

delete from public.pending_invites where email = 'probe-089b@example.com';
delete from public.tenants t
 where t.email = 'probe-089b@example.com'
   and not exists (select 1 from public.users u where u.tenant_id = t.id);
update public.companies set official_email = null where official_email = 'probe-089b@example.com';
delete from public.company_audit_log
 where action = 'claim_invited' and new_values->>'email' = 'probe-089b@example.com';

do $blk$
begin
  if exists (select 1 from public.tenants where email like 'probe-089%@example.com')
     or exists (select 1 from public.pending_invites where email like 'probe-089%@example.com') then
    raise exception 'بقيت آثار من الفحص';
  end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
