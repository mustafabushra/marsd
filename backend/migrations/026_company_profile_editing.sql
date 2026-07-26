-- Migration: 026_company_profile_editing.sql
-- Purpose: let a company edit its own profile — and make the save button honest.
--
-- /profile renders every field of the company record as an editable form with a
-- green "حفظ التغييرات". Only is_platform_admin() could update public.companies,
-- so the UPDATE matched no rows for every company user who has ever pressed it.
-- PostgREST does not treat that as an error — a row filtered out by RLS is not a
-- failure, it is simply not there — so the page reported success and saved
-- nothing. Every company that has filled in its profile since launch has had the
-- work discarded silently.
--
-- Two things are needed and only one of them is a policy: permission to write the
-- row, and a rule about which columns. RLS grants or refuses a row, never a
-- column, so the column rule lives in a trigger where it cannot be bypassed by
-- whichever client is talking to the database.
--
-- Idempotent.

-- ============================================================================
-- 1) Which company, if any, belongs to the caller
-- ============================================================================
-- SECURITY DEFINER because the policy on companies would otherwise read users
-- and tenants under their own policies, and a policy that queries a table whose
-- policy queries back is how the recursion in 020 happened.

create or replace function public.current_tenant_company_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.company_id
    from public.users u
    join public.tenants t on t.id = u.tenant_id
   where u.id = public.get_current_user_id()
     and u.status = 'active'
   limit 1
$$;

revoke all on function public.current_tenant_company_id() from public;
grant execute on function public.current_tenant_company_id() to authenticated, service_role;

-- ============================================================================
-- 2) A company admin may update the row that is their own company
-- ============================================================================
-- Not any member: the profile is what the market sees when it looks the company
-- up, and BR treats it the same as inviting a user or spending credits. The
-- existing platform-admin policy stays and covers every other row.

drop policy if exists companies_update_own_profile on public.companies;
create policy companies_update_own_profile on public.companies
  for update
  to authenticated
  using (
    public.is_tenant_admin()
    and id = public.current_tenant_company_id()
  )
  with check (
    public.is_tenant_admin()
    and id = public.current_tenant_company_id()
  );

-- ============================================================================
-- 3) Identity and verification are not the company's to edit
-- ============================================================================
-- The form already shows name, cr_number and source as read-only text, but the
-- form is not the enforcement point — anything holding a session token can send
-- whatever columns it likes. A company that could set its own verified flag could
-- mint the one signal on the platform that is supposed to mean someone checked.
--
-- Editing a verified company clears the badge rather than refusing the edit, so
-- the page's own promise — "تعديل البيانات الموثّقة قد يتطلب إعادة التحقق" —
-- becomes something the database does instead of something the copy says.

create or replace function public.guard_company_profile_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_platform_admin() then
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
$$;

-- Name matters: BEFORE UPDATE triggers fire in alphabetical order, and this must
-- run before trigger_companies_search_vector so the index reflects what was kept.
drop trigger if exists company_profile_guard_trigger on public.companies;
create trigger company_profile_guard_trigger
  before update on public.companies
  for each row execute function public.guard_company_profile_edit();

-- ============================================================================
-- 4) Notification preferences, stored where they can be honoured
-- ============================================================================
-- /profile has toggled these in useState since launch: they reset on reload and
-- nothing has ever read them. A switch that flips and changes nothing is worse
-- than no switch, because the user believes they have turned something off.

alter table public.users
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

comment on column public.users.notification_prefs is
  'Per-type opt-out. Absent key = on. Read by notifyTenant before writing a row.';

do $$
begin
  raise notice 'companies: يمكن لمدير الشركة تعديل ملف شركته؛ الهوية والتحقق محميّان';
end $$;
