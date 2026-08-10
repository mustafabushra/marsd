-- One registration writes one request
-- ============================================================================
--
-- Registration was writing twice, into two tables, from two places:
--
--   register_company_for_current_user()  →  registration_requests (pending)
--   CompanyOnboarding.jsx                →  open_company_request  (draft)
--
-- One registration, two records, two independent lifecycles — and only the
-- second one was ever closed by a decision. That is why every real
-- registration read `pending` in the old table forever, and why the new queue
-- was empty while two registrations sat waiting.
--
-- The request is opened here now, in the same transaction as the company and
-- the account. A registration that half-happens because the browser closed
-- between two calls is exactly the state this function was written to prevent,
-- and opening the request outside it put that failure straight back.
--
-- The legacy insert stays for now. `AdminRequests` and `AdminDashboard` still
-- read that table, and it is closed by `decide_company_request` — so the two
-- agree. It stops being written only when nothing reads it.

drop function if exists public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, int);

create or replace function public.register_company_for_current_user(
  p_name           text,
  p_cr_number      text,
  p_email          text,
  p_phone          text default null,
  p_city           text default null,
  p_sector         text default null,
  p_unified_number text default null,
  p_cr_file_url    text default null,
  p_founded_year   int  default null
)
returns table (company_id uuid, tenant_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user     text := public.get_current_user_id();
  v_company  uuid;
  v_tenant   uuid;
  v_existing uuid;
  v_request  uuid;
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
  -- a double-tap or a stale tab does not read as an error. The open request is
  -- returned with it — otherwise resuming would open a second one.
  select t.company_id, t.id into v_company, v_tenant
    from public.users u join public.tenants t on t.id = u.tenant_id
   where u.id = v_user;

  if v_tenant is not null then
    select r.id into v_request
      from public.company_requests r
     where r.company_id = v_company
       and r.kind = 'registration'
       and r.status in ('draft', 'clarification_needed')
     order by r.created_at desc
     limit 1;

    return query select v_company, v_tenant, v_request;
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

  -- The request, in the same transaction as everything it belongs to.
  insert into public.company_requests (company_id, tenant_id, requested_by, kind, status)
  values (v_company, v_tenant, v_user, 'registration', 'draft')
  returning id into v_request;

  insert into public.company_request_events (request_id, actor_id, event, to_status)
  values (v_request, v_user, 'created', 'draft');

  -- Kept in step until nothing reads it. `decide_company_request` closes this
  -- row too, so the two tables can no longer disagree the way they did.
  insert into public.registration_requests (company_id, tenant_id, user_id, cr_document_url, status)
  values (v_company, v_tenant, v_user, p_cr_file_url, 'pending');

  return query select v_company, v_tenant, v_request;
end;
$fn$;

revoke all on function public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, int) from anon, public;
grant execute on function public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, int) to authenticated;
