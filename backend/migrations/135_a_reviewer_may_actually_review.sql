-- A reviewer may actually review
-- ============================================================================
--
-- The `reviewer` role could not approve a single registration. Both guards on
-- `companies` recognise `is_platform_admin()` and nothing else, so
-- `decide_company_request` — running as a reviewer — was refused by its own
-- database with «لا يمكن تعديل بيانات الهوية أو حالة التحقق من لوحة الشركة».
--
-- This has been true since the request work landed. It never showed because
-- there is no reviewer account in the data: every test, mine included, signed
-- in as a platform admin. A role that exists in the constraint, is checked by
-- every request function, and cannot complete the one act it exists for.
--
-- ============================================================================
-- Why not a transaction-local flag
-- ============================================================================
-- The quick fix is `set_config('marsad.decision', 'on', true)` inside the
-- definer function and an escape hatch in the guards. It is also a hole: a
-- custom GUC can be set by any client, so any company account could send
-- `select set_config('marsad.decision','on',true)` and then edit its own
-- identity columns. A guard that can be switched off by the thing it guards
-- against is not a guard.
--
-- So the authority is widened precisely instead: staff are staff, but a
-- reviewer's reach stops where a supervisor's begins.

/**
 * A company may not rewrite its own identity. Staff may — with a division.
 *
 * Identity (name, registration number, source, tax id, search priority) is
 * what makes this company this company. Only a platform admin touches it.
 *
 * Workflow (status, approved, verified) is the review outcome, which is a
 * reviewer's whole job.
 */
create or replace function public.guard_company_profile_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(public.is_platform_admin(), false) then
    return new;
  end if;

  -- A reviewer decides requests, and deciding one moves `status`, `approved`
  -- and `verified`. Identity stays out of reach.
  if coalesce(public.is_reviewer(), false) then
    if new.id is distinct from old.id
       or new.name is distinct from old.name
       or new.cr_number is distinct from old.cr_number
       or new.source is distinct from old.source
       or new.search_priority is distinct from old.search_priority
       or new.tax_id is distinct from old.tax_id
    then
      raise exception 'تعديل هوية الشركة من صلاحيات مسؤول المنصة';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.name is distinct from old.name
     or new.cr_number is distinct from old.cr_number
     or new.source is distinct from old.source
     or new.approved is distinct from old.approved
     or new.status is distinct from old.status
     or new.search_priority is distinct from old.search_priority
     or new.tax_id is distinct from old.tax_id
     or new.verified is distinct from old.verified
     or new.verified_at is distinct from old.verified_at
     or new.verification_source is distinct from old.verification_source
  then
    raise exception 'لا يمكن تعديل بيانات الهوية أو حالة التحقق من لوحة الشركة';
  end if;

  -- companies_updated_at_trigger has already stamped now(); put it back so the
  -- comparison below is about the data and not about the fact that a save
  -- happened. A save that changes nothing must not cost a company its badge.
  new.updated_at := old.updated_at;

  if new is not distinct from old then
    return new;
  end if;

  if old.verified then
    new.verified := false;
    new.verified_at := null;
    new.verification_source := 'pending_reverification';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

/**
 * Who may move a company's status, and to where.
 *
 * A reviewer moves a company through the outcome of a request — active when it
 * is approved, rejected when it is not. Suspension is a different act: it takes
 * a company that is already trusted and publicly removes it, and that stays
 * with a platform admin.
 */
create or replace function public.guard_company_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'تغيير حالة الشركة من صلاحيات إدارة مرصد';
  end if;

  -- Taking a live company off the platform is a supervisor's act.
  if new.status = 'suspended' and not coalesce(public.is_platform_admin(), false) then
    raise exception 'تعليق الشركة من صلاحيات مسؤول المنصة';
  end if;

  if new.status = 'suspended' and coalesce(trim(new.status_reason), '') = '' then
    raise exception 'التعليق يحتاج سبباً — يُعرض للشركة';
  end if;

  -- Reactivating clears the reason: leaving it would show an active company a
  -- suspension notice. The history stays in company_audit_log.
  if new.status <> 'suspended' then
    new.status_reason := null;
  end if;

  new.status_at := now();
  new.status_by := public.get_current_user_id();
  return new;
end;
$fn$;

/**
 * Same division for the verification badge.
 *
 * `guard_company_verification` recognised only platform admins, so a reviewer
 * approving a claim on a Ministry record could not carry the badge across.
 */
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'guard_company_verification') then
    raise notice 'guard_company_verification موجود — يُراجع يدوياً إن منع المراجع';
  end if;
end;
$$;
