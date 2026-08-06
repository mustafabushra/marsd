-- Migration: 096_require_cr_document.sql
-- Purpose: adding a company to the registry now requires its commercial
--          registration document.
--
-- ============================================================================
-- Why in the database and not only in the form
-- ============================================================================
-- The add-company screen marked the upload "اختياري". Making the field required
-- there stops the screen from submitting without one, and stops nothing else:
-- companies.cr_file_url is nullable and PostgREST will happily accept an insert
-- that skips it. The screen is not the only way in, so the rule goes where the
-- writes are.
--
-- NOT NULL is the wrong tool. 22 of the 31 companies already in the registry
-- have no document, and a column constraint would reject every future update to
-- those rows — suspending one of them would start failing over a field the
-- suspension never touched. This fires on INSERT only, so what is already
-- recorded stays recorded.
--
-- ============================================================================
-- Who it applies to
-- ============================================================================
-- The same exemptions guard_company_add_suspended uses, for the same reasons:
--
--   * a platform admin — bulk import runs as one, and a batch of registry data
--     from an official list has no per-company certificate to attach
--   * a session with no tenant — internal and migration writes
--
-- So it binds exactly the case it is meant to: a company submitting an entry to
-- the registry through the panel.

create or replace function public.guard_company_requires_cr_doc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.get_current_user_id() is null
     or coalesce(public.is_platform_admin(), false)
     or public.get_current_tenant_id() is null then
    return new;
  end if;

  if coalesce(trim(new.cr_file_url), '') = '' then
    raise exception 'إضافة الشركة تحتاج صورة السجل التجاري — أرفقها ثم أعد الإرسال'
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;

drop trigger if exists trg_company_requires_cr_doc on public.companies;
create trigger trg_company_requires_cr_doc
  before insert on public.companies
  for each row execute function public.guard_company_requires_cr_doc();

comment on function public.guard_company_requires_cr_doc is
  'الشركة التي تضيفها جهة مشتركة يجب أن ترفق سجلها التجاري — الإدارة والاستيراد الجماعي مستثنيان';

-- ============================================================================
-- Prove it binds the right caller and exempts the right ones
-- ============================================================================
do $blk$
declare
  v_admin text; v_member text; v_tenant uuid; v_raised boolean; v_id uuid;
  v_cr text := '99' || lpad((floor(random() * 100000000))::text, 8, '0');
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select u.id, u.tenant_id into v_member, v_tenant
    from public.users u where u.tenant_id is not null and u.role <> 'platform_admin' limit 1;

  -- 1) A company adding an entry with no document is refused.
  if v_member is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);
    v_raised := false;
    begin
      insert into public.companies (name, cr_number, approved, source)
      values ('شركة فحص 096', v_cr, false, 'community');
    exception when others then
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'قُبلت إضافة شركة بلا سجل تجاري';
    end if;

    -- 2) And accepted with one.
    insert into public.companies (name, cr_number, approved, source, cr_file_url)
    values ('شركة فحص 096', v_cr, false, 'community', 'data:application/pdf;base64,ZmFrZQ==')
    returning id into v_id;
    if v_id is null then
      raise exception 'رُفضت إضافة شركة مع سجلها التجاري';
    end if;
    delete from public.company_documents where company_id = v_id;
    delete from public.companies where id = v_id;
  end if;

  -- 3) Marsad's own additions are unaffected — bulk import depends on it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  insert into public.companies (name, cr_number, approved, source)
  values ('شركة فحص 096 إدارية', v_cr, false, 'community')
  returning id into v_id;
  if v_id is null then
    raise exception 'مُنعت الإدارة من إضافة شركة';
  end if;
  delete from public.company_documents where company_id = v_id;
  delete from public.companies where id = v_id;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ المستند مطلوب من الشركات، ومستثنى للإدارة والاستيراد';
end $blk$;

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.companies where name like 'شركة فحص 096%';
  if v_n > 0 then raise exception 'بقيت % شركة من الفحص', v_n; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
