-- Migration: 015_platform_admin.sql
-- Purpose: give the platform an administrator, before row-level security needs one.
--
-- Five users exist and every one of them is company_admin or company_member.
-- No row carries platform_admin, and every write policy on plans and
-- system_settings requires is_platform_admin(). Enabling RLS in that state locks
-- the admin panel against everybody, including whoever is meant to unlock it —
-- so the role has to exist first.
--
-- The account named here is the project owner's, identified by email rather than
-- by Clerk id so the intent stays readable and the statement survives that
-- account being recreated.
--
-- Worth saying plainly: one account now holds both jobs — running Marsad and
-- belonging to a company on it. That is fine while the only tenants are the
-- owner's own, and it stops being fine the day a real customer needs
-- suspending by the same person who is signed in as one. Before that day,
-- platform staff should have their own accounts, and this one should go back to
-- company_admin. The application supports it already: is_tenant_admin() treats
-- platform_admin as a superset, so the split costs nothing but a second login.
--
-- Idempotent.

update public.users
set role = 'platform_admin',
    updated_at = now()
where lower(email) = lower('mustafabushra.1779@gmail.com')
  and role <> 'platform_admin';

-- Fail loudly rather than leaving RLS to be enabled against a database with no
-- administrator in it — a silent no-op here becomes an unopenable admin panel
-- three migrations later.
do $$
declare
  n integer;
begin
  select count(*) into n from public.users where role = 'platform_admin';
  if n = 0 then
    raise exception 'لا يوجد platform_admin بعد تطبيق الهجرة — تحقّق من البريد الإلكتروني في هذا الملف';
  end if;
  raise notice 'platform_admin count: %', n;
end $$;
