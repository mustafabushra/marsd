-- Registering a company is one step, or none
-- ============================================================================
--
-- Reported: register a company, see «حسابك تحت المراجعة», sign out, sign in —
-- and land back on the onboarding form.
--
-- The database says why. The account has no tenant, and there is exactly one
-- orphaned company in the whole table: «شركة ايتكس العربية لتقنية المعلومات»,
-- created 2026-08-09 20:45, pending, with no tenant pointing at it.
--
-- Onboarding writes four rows in sequence from the browser — company, tenant,
-- user link, registration request — each its own request. The first succeeded
-- and a later one did not, and there is no transaction across four HTTP calls,
-- so the company stayed and the rest never happened.
--
-- What that leaves is worse than a failed registration. The person's account
-- has no tenant, so every sign-in resolves to «no company» and sends them to
-- the form. And their own half-finished attempt now holds their registration
-- number, so filling the form again is refused as a duplicate. They are locked
-- out by their own failure, and nothing on screen explains it.
--
-- ============================================================================
-- One call, one transaction
-- ============================================================================
-- A function, so the four writes commit together or not at all. A failure
-- leaves no company, no tenant, and no half-registered account — and the person
-- can simply try again.

create or replace function public.register_company_for_current_user(
  p_name            text,
  p_cr_number       text,
  p_email           text,
  p_phone           text default null,
  p_city            text default null,
  p_sector          text default null,
  p_unified_number  text default null,
  p_cr_file_url     text default null,
  p_founded_year    int  default null
)
returns table (company_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    text := public.get_current_user_id();
  v_company uuid;
  v_tenant  uuid;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'اسم الشركة مطلوب';
  end if;
  if coalesce(btrim(p_cr_number), '') = '' then
    raise exception 'رقم السجل التجاري مطلوب';
  end if;
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'البريد الإلكتروني مطلوب';
  end if;

  -- Already has one. Returned rather than refused, so a second submission from
  -- a double-tap or a stale tab does not read as an error.
  select t.company_id, t.id into v_company, v_tenant
    from public.users u join public.tenants t on t.id = u.tenant_id
   where u.id = v_user;

  if v_tenant is not null then
    return query select v_company, v_tenant;
    return;
  end if;

  -- Somebody else's company already holds this registration number.
  select c.id into v_existing
    from public.companies c
   where c.cr_number = btrim(p_cr_number)
   limit 1;

  if v_existing is not null then
    -- Unless it is the wreckage of this person's own failed attempt. Reusing it
    -- is the difference between «try again» and «you are locked out by your own
    -- half-finished registration», which is what they were.
    if exists (select 1 from public.tenants t where t.company_id = v_existing) then
      raise exception 'رقم السجل مسجّل بالفعل لشركة أخرى';
    end if;
    v_company := v_existing;

    -- The name is not touched. `guard_company_profile_edit` protects a
    -- company's identity — name, registration number, source, approval — from
    -- being rewritten by a company account, and that guard is why nobody can
    -- quietly become somebody else. Reusing the wreckage means filling in what
    -- is missing, not renaming what is there.
    update public.companies
       set official_email = coalesce(p_email, official_email),
           city = coalesce(p_city, city),
           sector = coalesce(p_sector, sector),
           unified_number = coalesce(p_unified_number, unified_number),
           cr_file_url = coalesce(p_cr_file_url, cr_file_url)
     where id = v_company;
  else
    insert into public.companies (
      name, cr_number, unified_number, official_email, city, sector,
      founded_year, cr_file_url, source, status, approved
    ) values (
      p_name, btrim(p_cr_number), p_unified_number, p_email, p_city, p_sector,
      p_founded_year, p_cr_file_url, 'community', 'pending', false
    )
    returning id into v_company;
  end if;

  -- One account per e-mail. `tenants_email_key` enforces it, and a unique
  -- violation surfaced as «duplicate key value violates unique constraint» —
  -- true, and not something the person filling the form can act on.
  if exists (select 1 from public.tenants t where lower(t.email) = lower(btrim(p_email))) then
    raise exception 'هذا البريد مستخدم في حساب شركة آخر';
  end if;

  insert into public.tenants (name, cr_number, email, phone, city, sector, company_id, status)
  values (p_name, btrim(p_cr_number), p_email, p_phone, p_city, p_sector, v_company, 'active')
  returning id into v_tenant;

  update public.users
     set tenant_id = v_tenant,
         role = 'company_admin',
         status = 'active'
   where id = v_user;

  insert into public.registration_requests (company_id, tenant_id, user_id, cr_document_url, status)
  values (v_company, v_tenant, v_user, p_cr_file_url, 'pending');

  return query select v_company, v_tenant;
end;
$$;

revoke all on function public.register_company_for_current_user(text, text, text, text, text, text, text, text, int) from anon, public;
grant execute on function public.register_company_for_current_user(text, text, text, text, text, text, text, text, int) to authenticated;

-- ============================================================================
-- Where this account stands, from the database
-- ============================================================================
-- The router asks three separate questions — the user's row, the tenant, the
-- company's status — and assembles an answer in the browser. Any one of them
-- being null reads as «no company yet», which is how a half-finished
-- registration became «start over» instead of «you are waiting».
--
-- One question, one answer, decided where the facts are.

create or replace function public.my_registration_state()
returns table (
  state           text,
  company_id      uuid,
  tenant_id       uuid,
  company_name    text,
  rejection_reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user text := public.get_current_user_id();
  r record;
begin
  if v_user is null then
    return query select 'anonymous'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  -- Marsad's own staff have no company and never will. Answering «none» for
  -- them sent administrators to a company sign-up form.
  if coalesce(public.is_platform_admin(), false) or coalesce(public.is_reviewer(), false) then
    return query select 'staff'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select u.tenant_id, t.company_id, c.status, c.approved, c.name, c.review_reason
    into r
    from public.users u
    left join public.tenants t on t.id = u.tenant_id
    left join public.companies c on c.id = t.company_id
   where u.id = v_user;

  if r.tenant_id is null then
    -- Nothing registered — or an attempt that left a company behind without a
    -- tenant. The second is reported as `none` too, because the form is still
    -- what they need; what changed is that submitting it now succeeds.
    return query select 'none'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  return query select
    case
      when r.company_id is null                    then 'none'
      when r.status = 'rejected'                   then 'rejected'
      when r.status = 'suspended'                  then 'suspended'
      when coalesce(r.approved, false)
       and r.status in ('active', 'approved')      then 'approved'
      else 'pending_review'
    end,
    r.company_id, r.tenant_id, r.name::text, r.review_reason::text;
end;
$$;

revoke all on function public.my_registration_state() from anon, public;
grant execute on function public.my_registration_state() to authenticated;

-- ============================================================================
-- The one who registers a company is its administrator
-- ============================================================================
-- `guard_user_privileges` refuses a role change nobody is entitled to make, and
-- it is right: an account must not be able to promote itself, and only a
-- company admin may re-rank members of their own company.
--
-- But somebody registering their first company has no company yet, so there is
-- no admin to promote them — and the person who creates a company is its
-- administrator by the act of creating it. The guard refused
-- `register_company_for_current_user` for that reason, which is the guard
-- doing its job against a case nobody had written down.
--
-- The exception is exactly that case and nothing wider: an account with no
-- tenant, gaining one, becoming `company_admin` of it. It cannot be used to
-- move between companies, cannot reach `platform_admin`, and stops applying the
-- moment the account has a tenant.

create or replace function public.guard_user_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role   varchar := public.get_current_user_role();
  caller_id     text    := public.get_current_user_id();
  caller_tenant uuid    := public.get_current_tenant_id();
begin
  if caller_id is null then
    return new;
  end if;

  if caller_role = 'platform_admin' then
    return new;
  end if;

  -- Registering your own first company.
  if caller_id = new.id
     and old.tenant_id is null
     and new.tenant_id is not null
     and new.role = 'company_admin'
     and coalesce(old.role, '') in ('company_member', 'company_admin', '')
  then
    return new;
  end if;

  if new.role is distinct from old.role then
    if new.role = 'platform_admin' then
      raise exception 'لا يمكن منح دور platform_admin من التطبيق';
    end if;
    if not (caller_role = 'company_admin'
            and old.tenant_id = caller_tenant
            and new.role in ('company_admin', 'company_member')) then
      raise exception 'تغيير الدور محظور';
    end if;
  end if;

  -- Moving an account between companies is not something an account may do to
  -- itself, and remains refused.
  if new.tenant_id is distinct from old.tenant_id and old.tenant_id is not null then
    raise exception 'لا يمكن نقل الحساب بين الشركات';
  end if;

  return new;
end;
$$;
