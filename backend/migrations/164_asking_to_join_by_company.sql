-- Asking to join, by the thing the screen actually has
-- ============================================================================
--
-- request_to_join_company took a tenant_id. Every screen that would call it
-- holds a *company* — the gate matched a company, the search returns companies,
-- the file is a company — and the tenant is an internal detail nobody outside
-- the database has a reason to know. Resolving it in the browser means reading
-- `tenants` for a company you do not belong to, which RLS refuses, correctly.
--
-- So it takes a company id and finds the tenant itself. The parameter changed
-- rather than an overload being added: two signatures with defaults is how
-- register_company_for_current_user became ambiguous in migration 161, and one
-- lesson of that is enough.
--
-- Also here: what the screen needs in order to offer the right thing. A company
-- with an owner can be joined; one without can be claimed. Asking the browser
-- to work that out means letting it read other companies' membership, so the
-- database answers the question instead of exposing the rows behind it.

drop function if exists public.request_to_join_company(uuid, text);

create or replace function public.request_to_join_company(
  p_company_id uuid,
  p_message    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me     text := public.get_current_user_id();
  v_mine   uuid;
  v_tenant uuid;
  v_id     uuid;
begin
  if v_me is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select u.tenant_id into v_mine from public.users u where u.id = v_me;

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id;
  if v_tenant is null then
    raise exception 'لا يوجد حساب لهذه الشركة بعد — قدّم طلب ملكية بدلاً من الانضمام';
  end if;

  if v_mine is not null then
    if v_mine = v_tenant then
      raise exception 'أنت عضو في هذه الشركة بالفعل';
    end if;
    raise exception 'حسابك مرتبط بشركة أخرى';
  end if;

  -- A company with nobody in it has nobody to answer.
  if not exists (select 1 from public.users u where u.tenant_id = v_tenant) then
    raise exception 'لا يوجد مسؤول لهذه الشركة بعد — قدّم طلب ملكية بدلاً من الانضمام';
  end if;

  insert into public.join_requests (tenant_id, user_id, message)
  values (v_tenant, v_me, nullif(btrim(coalesce(p_message, '')), ''))
  on conflict (tenant_id, user_id) where status = 'pending'
  do update set message = coalesce(excluded.message, public.join_requests.message)
  returning id into v_id;

  insert into public.notifications (user_id, tenant_id, type, payload)
  select u.id, v_tenant, 'join_requested',
         jsonb_build_object('title', 'طلب انضمام جديد',
                            'message', 'طلب أحدهم الانضمام إلى شركتك في مرصد.',
                            'request_id', v_id)
    from public.users u
   where u.tenant_id = v_tenant and u.role = 'company_admin' and u.status = 'active';

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_me, 'join_requested', 'join_request', v_id::text,
          jsonb_build_object('tenant_id', v_tenant, 'company_id', p_company_id));

  return v_id;
end;
$fn$;

-- ============================================================================
-- What the screen may offer
-- ============================================================================
-- Whether this company has an account, whether it has anybody in it, and
-- whether the asker already has a request open. Three booleans instead of three
-- queries the caller is not allowed to run.

create or replace function public.company_access_options(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me     text := public.get_current_user_id();
  v_tenant uuid;
begin
  if v_me is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id;

  return jsonb_build_object(
    'has_account', v_tenant is not null,
    'has_members', v_tenant is not null and exists (
      select 1 from public.users u where u.tenant_id = v_tenant),
    'i_belong', v_tenant is not null and exists (
      select 1 from public.users u where u.id = v_me and u.tenant_id = v_tenant),
    'i_have_company', exists (
      select 1 from public.users u where u.id = v_me and u.tenant_id is not null),
    'pending_request', exists (
      select 1 from public.join_requests j
       where j.tenant_id = v_tenant and j.user_id = v_me and j.status = 'pending'));
end;
$fn$;

revoke all on function public.request_to_join_company(uuid, text) from anon, public;
revoke all on function public.company_access_options(uuid) from anon, public;
grant execute on function public.request_to_join_company(uuid, text) to authenticated;
grant execute on function public.company_access_options(uuid) to authenticated;
