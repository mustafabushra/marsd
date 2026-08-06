-- Migration: 085_admin_edit_company.sql
-- Purpose: nobody at Marsad can correct a company's data. Anywhere.
--
-- ============================================================================
-- What the registry looks like right now
-- ============================================================================
-- 31 companies. 18 of them carry a "commercial registration number" that is not
-- one: CR12159676, 123456789, 20222222222222. 30 have no main activity, 29 have
-- no contact of any kind, 5 have no sector.
--
-- guard_company_profile_edit blocks a company from editing its own identity
-- fields — correctly, since a business must not be able to rename itself out of
-- its own reports. It exempts platform admins. But no screen ever used that
-- exemption, so the exemption has never been exercised: a wrong name, a wrong
-- sector or a malformed CR number is permanent.
--
-- That is the gap under the word "إدارة". This adds the one write path that was
-- missing, with the validation the direct UPDATE could never carry.
--
-- No CHECK constraint on cr_number format, deliberately. 18 existing rows would
-- fail it, and a NOT VALID constraint still fires on UPDATE — so suspending a
-- company whose CR number is malformed would start raising an error about a
-- field the suspension never touched. Validation belongs on the edit path.

-- ============================================================================
-- 1) The audit log records what changed and never who
-- ============================================================================
-- company_audit_log has had actor_id and change_reason since it was created.
-- Both are NULL in every row, because log_company_change never set them. On a
-- platform whose product is trust, "someone renamed this company" is not an
-- audit trail.
--
-- The comparisons are also NULL-unsafe: `NEW.status != OLD.status` is NULL when
-- either side is NULL, so a status arriving from NULL was logged as a plain
-- 'updated'. `is distinct from` says what was meant.
create or replace function public.log_company_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.company_audit_log (
    company_id, action, actor_id, change_reason, old_values, new_values, created_at
  ) values (
    new.id,
    case
      when tg_op = 'INSERT'                                   then 'created'
      when new.status   is distinct from old.status           then 'status_changed'
      when new.approved is distinct from old.approved
        then (case when new.approved then 'approved' else 'unapproved' end)
      else 'updated'
    end,
    public.get_current_user_id(),
    -- Set by admin_update_company for the duration of its transaction. Anything
    -- writing to companies by another route simply leaves it null.
    nullif(current_setting('marsad.change_reason', true), ''),
    case when tg_op = 'UPDATE' then row_to_json(old) else null end,
    row_to_json(new),
    current_timestamp
  );
  return new;
end $fn$;

-- ============================================================================
-- 2) The edit itself
-- ============================================================================
-- A jsonb patch rather than twenty parameters: the form sends only what the
-- administrator touched, and a field that is absent keeps its value while a
-- field explicitly set to null is cleared. Twenty nullable parameters cannot
-- tell those two apart.
create or replace function public.admin_update_company(
  p_company_id uuid,
  p_patch      jsonb,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  -- Identity and profile fields only. approved, verified, status, review_status
  -- and official_status each have their own guarded flow and are not editable
  -- through a general-purpose patch.
  k_allowed text[] := array[
    'name', 'name_en', 'commercial_name', 'cr_number', 'sector', 'city', 'region',
    'entity_type', 'main_activity', 'sub_activities', 'founding_date', 'founded_year',
    'phone', 'official_email', 'website', 'national_address', 'unified_number',
    'license_number', 'tax_id', 'enterprise_size', 'keywords'
  ];
  v_key     text;
  v_cr      text;
  v_year    int;
  v_changed jsonb := '{}'::jsonb;
  v_old     public.companies%rowtype;
  v_new     public.companies%rowtype;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'تعديل بيانات الشركة من صلاحيات إدارة مرصد';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'التعديل يحتاج سبباً — يُحفظ في سجل الشركة';
  end if;

  select * into v_old from public.companies where id = p_company_id;
  if not found then
    raise exception 'الشركة غير موجودة';
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'لا يوجد ما يُحفظ';
  end if;

  -- An unknown key is a mistake in the caller, not something to ignore quietly.
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (k_allowed)) then
      raise exception 'حقل غير قابل للتعديل: %', v_key;
    end if;
  end loop;

  -- ---- validation -------------------------------------------------------
  if p_patch ? 'name' and coalesce(trim(p_patch->>'name'), '') = '' then
    raise exception 'اسم الشركة لا يكون فارغاً';
  end if;

  if p_patch ? 'cr_number' then
    v_cr := trim(p_patch->>'cr_number');
    if v_cr !~ '^[0-9]{10}$' then
      raise exception 'السجل التجاري يتكوّن من ١٠ أرقام';
    end if;
    if exists (select 1 from public.companies c
                where c.cr_number = v_cr and c.id <> p_company_id) then
      raise exception 'السجل التجاري % مسجَّل لشركة أخرى', v_cr;
    end if;
  end if;

  if p_patch ? 'official_email' and coalesce(p_patch->>'official_email', '') <> ''
     and p_patch->>'official_email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    raise exception 'البريد الرسمي غير صالح';
  end if;

  if p_patch ? 'website' and coalesce(p_patch->>'website', '') <> ''
     and p_patch->>'website' !~* '^https?://' then
    raise exception 'الموقع يبدأ بـ http:// أو https://';
  end if;

  if p_patch ? 'founded_year' and coalesce(p_patch->>'founded_year', '') <> '' then
    v_year := (p_patch->>'founded_year')::int;
    if v_year < 1900 or v_year > extract(year from now())::int then
      raise exception 'سنة التأسيس خارج المدى المعقول';
    end if;
  end if;

  if p_patch ? 'founding_date' and coalesce(p_patch->>'founding_date', '') <> ''
     and (p_patch->>'founding_date')::date > current_date then
    raise exception 'تاريخ التأسيس في المستقبل';
  end if;

  -- ---- the write --------------------------------------------------------
  -- The reason travels to log_company_change through the transaction, so the
  -- audit row and the change are written together or not at all.
  perform set_config('marsad.change_reason', trim(p_reason), true);

  update public.companies set
    name             = case when p_patch ? 'name'             then trim(p_patch->>'name')             else name end,
    name_en          = case when p_patch ? 'name_en'          then nullif(trim(p_patch->>'name_en'), '')          else name_en end,
    commercial_name  = case when p_patch ? 'commercial_name'  then nullif(trim(p_patch->>'commercial_name'), '')  else commercial_name end,
    cr_number        = case when p_patch ? 'cr_number'        then trim(p_patch->>'cr_number')        else cr_number end,
    sector           = case when p_patch ? 'sector'           then nullif(trim(p_patch->>'sector'), '')           else sector end,
    city             = case when p_patch ? 'city'             then nullif(trim(p_patch->>'city'), '')             else city end,
    region           = case when p_patch ? 'region'           then nullif(trim(p_patch->>'region'), '')           else region end,
    entity_type      = case when p_patch ? 'entity_type'      then nullif(trim(p_patch->>'entity_type'), '')      else entity_type end,
    main_activity    = case when p_patch ? 'main_activity'    then nullif(trim(p_patch->>'main_activity'), '')    else main_activity end,
    sub_activities   = case when p_patch ? 'sub_activities'   then nullif(trim(p_patch->>'sub_activities'), '')   else sub_activities end,
    founding_date    = case when p_patch ? 'founding_date'    then nullif(p_patch->>'founding_date', '')::date    else founding_date end,
    founded_year     = case when p_patch ? 'founded_year'     then nullif(p_patch->>'founded_year', '')::int      else founded_year end,
    phone            = case when p_patch ? 'phone'            then nullif(trim(p_patch->>'phone'), '')            else phone end,
    official_email   = case when p_patch ? 'official_email'   then nullif(trim(p_patch->>'official_email'), '')   else official_email end,
    website          = case when p_patch ? 'website'          then nullif(trim(p_patch->>'website'), '')          else website end,
    national_address = case when p_patch ? 'national_address' then nullif(trim(p_patch->>'national_address'), '') else national_address end,
    unified_number   = case when p_patch ? 'unified_number'   then nullif(trim(p_patch->>'unified_number'), '')   else unified_number end,
    license_number   = case when p_patch ? 'license_number'   then nullif(trim(p_patch->>'license_number'), '')   else license_number end,
    tax_id           = case when p_patch ? 'tax_id'           then nullif(trim(p_patch->>'tax_id'), '')           else tax_id end,
    enterprise_size  = case when p_patch ? 'enterprise_size'  then nullif(trim(p_patch->>'enterprise_size'), '')  else enterprise_size end,
    keywords         = case when p_patch ? 'keywords'         then nullif(trim(p_patch->>'keywords'), '')         else keywords end
  where id = p_company_id
  returning * into v_new;

  if v_new.id is null then
    raise exception 'لم يُحفظ التعديل';
  end if;

  -- What actually moved, so the screen can report it and the caller cannot be
  -- told "saved" about a save that changed nothing.
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('من', o.value, 'إلى', n.value)), '{}'::jsonb)
    into v_changed
    from jsonb_each(to_jsonb(v_old)) o
    join jsonb_each(to_jsonb(v_new)) n on n.key = o.key
   where o.key = any (k_allowed)
     and o.value is distinct from n.value;

  perform set_config('marsad.change_reason', '', true);
  return jsonb_build_object(
    'changed', v_changed,
    'count', (select count(*) from jsonb_object_keys(v_changed)));
end $fn$;

grant execute on function public.admin_update_company(uuid, jsonb, text) to authenticated;
revoke all on function public.admin_update_company(uuid, jsonb, text) from public, anon;

-- ============================================================================
-- Prove it, including every refusal
-- ============================================================================
create temporary table _085_before on commit drop as
  select id, sector, city from public.companies where approved limit 1;

do $blk$
declare
  v_admin text; v_member text; v_co uuid; v_other_cr text;
  v_res jsonb; v_raised boolean; v_log record;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_member from public.users where role <> 'platform_admin' and tenant_id is not null limit 1;
  select id into v_co from _085_before;
  select cr_number into v_other_cr from public.companies where id <> v_co limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 1) A real edit goes through and reports what moved.
  v_res := public.admin_update_company(v_co,
    jsonb_build_object('sector', 'قطاع الفحص', 'city', 'مدينة الفحص'),
    'فحص المهاجرة 085');
  if (v_res->>'count')::int <> 2 then
    raise exception 'عدد الحقول المتغيّرة % وليس 2', v_res->>'count';
  end if;

  -- 2) The audit row carries who and why, which it never did before.
  select actor_id, change_reason into v_log
    from public.company_audit_log
   where company_id = v_co order by created_at desc limit 1;
  if v_log.actor_id is distinct from v_admin or v_log.change_reason <> 'فحص المهاجرة 085' then
    raise exception 'سجل التدقيق بلا فاعل أو بلا سبب';
  end if;

  -- 3) Every refusal actually refuses.
  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('name','س'), '');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل تعديل بلا سبب'; end if;

  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('cr_number','CR123'), 'فحص');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل سجل تجاري غير صالح'; end if;

  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('cr_number', v_other_cr), 'فحص');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل سجل تجاري مكرّر'; end if;

  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('approved', true), 'فحص');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل تعديل حقل محميّ'; end if;

  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('name',''), 'فحص');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل اسم فارغ'; end if;

  v_raised := false;
  begin perform public.admin_update_company(v_co, jsonb_build_object('official_email','لا-بريد'), 'فحص');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل بريد غير صالح'; end if;

  -- 4) A company member cannot use it, even though it is SECURITY DEFINER.
  if v_member is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);
    v_raised := false;
    begin perform public.admin_update_company(v_co, jsonb_build_object('name','محاولة'), 'فحص');
    exception when others then v_raised := true; end;
    if not v_raised then raise exception 'عضو شركة عدّل بيانات الشركة'; end if;
  end if;

  raise notice '✅ التعديل يعمل، والرفض يعمل، والسجل يعرف الفاعل';
end $blk$;

-- The checks above are a real write on a real company, so put it back exactly as
-- it was — not "back to empty", which is what a guessed cleanup would do.
update public.companies c
   set sector = b.sector, city = b.city
  from _085_before b
 where c.id = b.id;

delete from public.company_audit_log
 where change_reason = 'فحص المهاجرة 085';

do $blk$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.companies c join _085_before b on b.id = c.id
   where c.sector is distinct from b.sector or c.city is distinct from b.city;
  if v_bad > 0 then
    raise exception 'لم تُستعد بيانات الشركة بعد الفحص';
  end if;
  raise notice '✅ أُعيدت بيانات شركة الفحص كما كانت';
end $blk$;
