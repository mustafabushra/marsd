-- Ownership is decided in one place
-- ============================================================================
--
-- Approving an ownership claim is the moment a person becomes the company on
-- Marsad: a tenant is created if there is none, the claimant is attached to it
-- as company_admin, and the request is closed. Three writes across three
-- tables, done from the browser one after another, with no transaction around
-- them. A failure between the second and the third leaves a user who is now
-- company_admin of a tenant, and a claim still sitting in the queue as pending
-- — so the next reviewer approves it again.
--
-- It happens in one statement now, or not at all.
--
-- The rules are the ones the screen already applied; nothing here is new
-- policy:
--   the tenant is the one already attached to the company, or a new one built
--     from the company's own fields
--   users.tenant_id is what gets written, not company_id — every policy and
--     every screen reads tenant_id, and writing the other column linked the
--     claimant to nothing
--   a rejection carries a reason
--   a rejected claimant may have no tenant at all, and notifications.tenant_id
--     is NOT NULL, so there is nowhere to write the message unless the company
--     already has an owner. The reason stays on the row either way.
--
-- `platform.admin`, matching what is true today: these screens sit behind
-- AdminRoute. The role model is untouched.

create or replace function public.decide_claim_request(
  p_claim_id uuid,
  p_approve  boolean,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r        public.claim_requests;
  co       public.companies;
  v_me     text := public.get_current_user_id();
  v_tenant uuid;
begin
  if not coalesce(public.has_permission('platform.admin'), false) then
    raise exception 'قرار الملكية من صلاحيات إدارة مرصد';
  end if;

  select * into r from public.claim_requests where id = p_claim_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then
    raise exception 'الطلب في حالة «%» ولا يقبل قراراً جديداً', r.status;
  end if;

  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'الرفض يحتاج سبباً يُعرض على مقدّم الطلب';
  end if;

  select * into co from public.companies where id = r.company_id;
  if co.id is null then raise exception 'الشركة غير موجودة'; end if;

  -- ===== Rejected =====
  if not p_approve then
    update public.claim_requests
       set status = 'rejected', rejection_reason = btrim(p_reason),
           reviewed_at = now(), reviewed_by = v_me
     where id = p_claim_id;

    select t.id into v_tenant from public.tenants t where t.company_id = r.company_id;
    if v_tenant is not null then
      insert into public.notifications (user_id, tenant_id, type, payload)
      values (r.user_id, v_tenant, 'claim_rejected',
              jsonb_build_object('title', 'رُفض طلب الملكية',
                                 'message', btrim(p_reason),
                                 'company_id', r.company_id));
    end if;

    insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
    values (v_me, 'platform_admin', 'claim_rejected', 'claim_request', p_claim_id::text,
            jsonb_build_object('company_id', r.company_id, 'user_id', r.user_id,
                               'reason', btrim(p_reason)));

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- ===== Approved =====
  select t.id into v_tenant from public.tenants t where t.company_id = r.company_id;

  if v_tenant is null then
    -- email and phone are NOT NULL and the company may carry neither; blank is
    -- what the screen wrote and what the column accepts.
    insert into public.tenants (name, cr_number, email, phone, sector, city, company_id, status)
    values (co.name, co.cr_number, coalesce(co.official_email, ''), coalesce(co.phone, ''),
            coalesce(co.sector, ''), coalesce(co.city, ''), r.company_id, 'active')
    returning id into v_tenant;
  end if;

  update public.users
     set tenant_id = v_tenant, role = 'company_admin', status = 'active'
   where id = r.user_id;

  if not found then
    raise exception 'لم يُربط المستخدم بالشركة — الحساب غير موجود';
  end if;

  update public.claim_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = v_me, tenant_id = v_tenant
   where id = p_claim_id;

  insert into public.notifications (user_id, tenant_id, type, payload)
  values (r.user_id, v_tenant, 'claim_approved',
          jsonb_build_object('title', 'تمت الموافقة على طلب الملكية',
                             'message', 'أصبحت مسؤولاً عن «' || co.name || '» في مرصد.',
                             'company_id', r.company_id));

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_me, 'platform_admin', 'claim_approved', 'claim_request', p_claim_id::text,
          jsonb_build_object('company_id', r.company_id, 'user_id', r.user_id,
                             'tenant_id', v_tenant));

  return jsonb_build_object('ok', true, 'status', 'approved', 'tenant_id', v_tenant);
end;
$fn$;

revoke all on function public.decide_claim_request(uuid, boolean, text) from anon, public;
grant execute on function public.decide_claim_request(uuid, boolean, text) to authenticated;

-- ============================================================================
-- The claims on one company, for its file
-- ============================================================================
-- The company file had no way to see who is asking to own the company it is
-- showing, which is the one screen where that question comes up.

create or replace function public.admin_company_claims(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
    from (
      select r.id, r.status, r.created_at, r.reviewed_at, r.rejection_reason,
             r.user_id, u.email as user_email,
             btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as user_name,
             r.supporting_documents
        from public.claim_requests r
        left join public.users u on u.id = r.user_id
       where r.company_id = p_company_id
         and coalesce(public.has_permission('platform.admin'), false)
    ) x;
$fn$;

revoke all on function public.admin_company_claims(uuid) from anon, public;
grant execute on function public.admin_company_claims(uuid) to authenticated;
