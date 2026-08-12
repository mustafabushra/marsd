-- Registration carries the whole identity
-- ============================================================================
--
-- register_company_for_current_user took nine fields. The company file wants
-- twenty: /admin/add-company already collects the legal entity, the register
-- type and status, the expiry and founding dates, the capital, the region, the
-- national address, the website — every one of them a real column on
-- `companies` — and a company registering itself was asked for four of them.
--
-- So the identity a company arrives with was thinner than the identity Marsad
-- records about a company somebody else added, and the difference had to be
-- filled in afterwards by an operator reading the certificate.
--
-- Every new parameter has a default, so the existing callers — CompanyOnboarding
-- as it stands, and anything else passing nine — keep working unchanged.
--
-- Nothing here decides anything new. The status is still 'pending' and the
-- source still 'community': registering does not admit a company, it opens a
-- file for review, and that is unchanged.

create or replace function public.register_company_for_current_user(
  p_name                    text,
  p_cr_number               text,
  p_email                   text,
  p_phone                   text default null,
  p_city                    text default null,
  p_sector                  text default null,
  p_unified_number          text default null,
  p_cr_file_url             text default null,
  p_founded_year            integer default null,
  -- The official identity, as the Ministry states it or as the certificate
  -- reads. All optional: a company that cannot supply one of these should not
  -- be blocked from registering over it.
  p_name_en                 text default null,
  p_entity_type             text default null,
  p_cr_type                 text default null,
  p_cr_status               text default null,
  p_cr_expiry_date          date default null,
  p_founding_date           date default null,
  p_capital                 numeric default null,
  p_region                  text default null,
  p_national_address        text default null,
  p_website                 text default null
)
returns table (company_id uuid, tenant_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user     text := public.get_current_user_id();
  v_existing uuid;
  v_company  uuid;
  v_tenant   uuid;
  v_request  uuid;
  v_status   text;
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

  if exists (select 1 from public.users u
              where u.id = v_user and u.tenant_id is not null) then
    raise exception 'هذا الحساب مرتبط بشركة بالفعل';
  end if;

  select c.id, c.status into v_existing, v_status
    from public.companies c where c.cr_number = btrim(p_cr_number);

  if v_existing is not null then
    if exists (select 1 from public.tenants t where t.company_id = v_existing) then
      if v_status = 'pending' then
        raise exception 'رقم السجل محجوز بتسجيل لم يكتمل — تواصل مع مرصد لاسترداده';
      end if;
      raise exception 'رقم السجل مسجّل بالفعل لشركة أخرى';
    end if;
    v_company := v_existing;

    -- coalesce throughout: a blank field on the form must not erase something
    -- the register already told us about this company.
    update public.companies
       set official_email     = coalesce(p_email, official_email),
           city               = coalesce(p_city, city),
           sector             = coalesce(p_sector, sector),
           unified_number     = coalesce(p_unified_number, unified_number),
           cr_file_url        = coalesce(p_cr_file_url, cr_file_url),
           name_en            = coalesce(p_name_en, name_en),
           entity_type        = coalesce(p_entity_type, entity_type),
           cr_type            = coalesce(p_cr_type, cr_type),
           cr_status          = coalesce(p_cr_status, cr_status),
           cr_expiry_date     = coalesce(p_cr_expiry_date, cr_expiry_date),
           founding_date      = coalesce(p_founding_date, founding_date),
           capital            = coalesce(p_capital, capital),
           region             = coalesce(p_region, region),
           national_address   = coalesce(p_national_address, national_address),
           website            = coalesce(p_website, website),
           phone              = coalesce(p_phone, phone)
     where id = v_company;
  else
    insert into public.companies (
      name, cr_number, unified_number, official_email, city, sector,
      founded_year, cr_file_url, source, status,
      name_en, entity_type, cr_type, cr_status, cr_expiry_date, founding_date,
      capital, region, national_address, website, phone
    ) values (
      p_name, btrim(p_cr_number), p_unified_number, p_email, p_city, p_sector,
      p_founded_year, p_cr_file_url, 'community', 'pending',
      p_name_en, p_entity_type, p_cr_type, p_cr_status, p_cr_expiry_date,
      p_founding_date, p_capital, p_region, p_national_address, p_website, p_phone
    )
    returning id into v_company;
  end if;

  if exists (select 1 from public.tenants t where lower(t.email) = lower(btrim(p_email))) then
    raise exception 'هذا البريد مستخدم في حساب شركة آخر';
  end if;

  insert into public.tenants (name, cr_number, email, phone, city, sector, company_id, status)
  values (p_name, btrim(p_cr_number), p_email, p_phone, p_city, p_sector, v_company, 'active')
  returning id into v_tenant;

  update public.users
     set tenant_id = v_tenant, role = 'company_admin', status = 'active'
   where id = v_user;

  insert into public.company_requests (company_id, tenant_id, requested_by, kind, status)
  values (v_company, v_tenant, v_user, 'registration', 'draft')
  returning id into v_request;

  insert into public.company_request_events (request_id, actor_id, event, to_status)
  values (v_request, v_user, 'created', 'draft');

  insert into public.registration_requests (company_id, tenant_id, user_id, cr_document_url, status)
  values (v_company, v_tenant, v_user, p_cr_file_url, 'pending');

  return query select v_company, v_tenant, v_request;
end;
$fn$;

revoke all on function public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, integer,
  text, text, text, text, date, date, numeric, text, text, text) from anon, public;
grant execute on function public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, integer,
  text, text, text, text, date, date, numeric, text, text, text) to authenticated;

-- ============================================================================
-- The nine-argument version has to go
-- ============================================================================
-- `create or replace` does not replace a function with a different argument
-- list — it adds an overload beside it. With both present, a call naming the
-- original nine matches either (the new one defaults the rest) and Postgres
-- refuses it as ambiguous:
--
--     function public.register_company_for_current_user(p_name => unknown, …)
--     is not unique
--
-- Which is exactly the call CompanyOnboarding makes today. Leaving both would
-- have broken registration for everybody the moment this shipped.
drop function if exists public.register_company_for_current_user(
  text, text, text, text, text, text, text, text, integer);
