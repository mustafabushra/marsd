-- Migration: 018_secure_users_table.sql
-- Purpose: stop a browser from promoting itself.
--
-- public.users had row-level security disabled and not one policy. Every other
-- table secured in 016 and 017 keys off this one — get_current_user_role() and
-- get_current_tenant_id() both read it — so an anonymous request that could
-- write here could set its own role to platform_admin and then do anything the
-- policies allow a platform administrator to do. Verified: the update landed.
--
-- Row scope is enforced by policies. Role changes are enforced by a trigger,
-- because a policy cannot compare the row being written against the row that was
-- there: WITH CHECK sees only the new values, so "you may edit yourself" and
-- "you may not promote yourself" cannot both be expressed in one.
--
-- Legitimate role changes still work. A company administrator may move their own
-- members between company_admin and company_member — the application offers
-- exactly that on /users. What nobody but a platform administrator may do is
-- write platform_admin, or move a user into another company.
--
-- Idempotent.

-- ============================================================================
-- 1) Guard the columns that grant power
-- ============================================================================

create or replace function public.guard_user_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role  varchar := public.get_current_user_role();
  caller_id    text    := public.get_current_user_id();
  caller_tenant uuid   := public.get_current_tenant_id();
begin
  -- No session at all: service_role and migrations run without a JWT, and they
  -- are trusted by definition — they never reach here through PostgREST.
  if caller_id is null then
    return new;
  end if;

  if caller_role = 'platform_admin' then
    return new;
  end if;

  if new.role is distinct from old.role then
    if new.role = 'platform_admin' then
      raise exception 'لا يمكن منح دور platform_admin من التطبيق';
    end if;
    -- A company administrator may only re-rank members of their own company.
    if not (caller_role = 'company_admin'
            and old.tenant_id = caller_tenant
            and new.role in ('company_admin', 'company_member')) then
      raise exception 'تغيير الدور متاح لمدير الشركة داخل شركته فقط';
    end if;
  end if;

  -- Moving someone between companies is a platform action. Leaving it open
  -- would let an administrator pull another company's staff into their own.
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'نقل مستخدم بين الكيانات متاح لإدارة المنصة فقط';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_user_privileges on public.users;
create trigger trg_guard_user_privileges
  before update on public.users
  for each row execute function public.guard_user_privileges();

-- Insert is where a new account chooses its own row, so the same rule applies
-- at creation: nobody signs up as a platform administrator.
create or replace function public.guard_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_current_user_id() is not null
     and new.role = 'platform_admin'
     and coalesce(public.get_current_user_role(), '') <> 'platform_admin' then
    raise exception 'لا يمكن إنشاء حساب بدور platform_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_insert on public.users;
create trigger trg_guard_user_insert
  before insert on public.users
  for each row execute function public.guard_user_insert();

-- ============================================================================
-- 2) Row scope
-- ============================================================================

drop policy if exists users_select on public.users;
drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;
drop policy if exists users_delete on public.users;

-- Colleagues are visible to each other: /users lists them, and reports and
-- audit entries are rendered with the name behind them.
create policy users_select on public.users
for select using (
  id = public.get_current_user_id()
  or tenant_id = public.get_current_tenant_id()
  or public.is_platform_admin()
);

-- Sign-up writes this row before any tenant exists, so it can only be keyed to
-- the caller's own identity.
create policy users_insert on public.users
for insert with check (
  id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy users_update on public.users
for update using (
  id = public.get_current_user_id()
  or (tenant_id = public.get_current_tenant_id() and public.is_tenant_admin())
  or public.is_platform_admin()
) with check (
  id = public.get_current_user_id()
  or (tenant_id = public.get_current_tenant_id() and public.is_tenant_admin())
  or public.is_platform_admin()
);

create policy users_delete on public.users
for delete using (public.is_platform_admin());

alter table public.users enable row level security;
