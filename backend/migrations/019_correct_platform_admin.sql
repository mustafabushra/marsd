-- Migration: 019_correct_platform_admin.sql
-- Purpose: put platform_admin on the account that actually operates Marsad.
--
-- Migration 015 assigned it to mustafabushra.1779@gmail.com. The operator's
-- account is mustafabushra1779@gmail.com — the same string without the dot.
-- Gmail treats those as one mailbox and Clerk treats them as two accounts, so
-- both exist here as separate users with separate Clerk ids, and the wrong one
-- was promoted.
--
-- The admin panel had been reachable from the right account all along because
-- AdminRoute read Clerk's publicMetadata.role rather than users.role. Moving the
-- gate onto the value the database enforces was correct — it is the only one
-- that governs anything — but it exposed that the two had never agreed, and the
-- database's answer was the one that had been wrong.
--
-- Idempotent.

-- Return the company account to what it was before 015 touched it.
update public.users
set role = 'company_admin',
    updated_at = now()
where lower(email) = lower('mustafabushra.1779@gmail.com')
  and role = 'platform_admin';

-- Promote the operator's account.
update public.users
set role = 'platform_admin',
    updated_at = now()
where lower(email) = lower('mustafabushra1779@gmail.com')
  and role <> 'platform_admin';

-- Exactly one platform administrator, and it is the intended one. Enabling RLS
-- against a database with none — or with the wrong one — locks the panel
-- against whoever is meant to open it, so this refuses to pass quietly.
do $$
declare
  admins text;
begin
  select string_agg(email, ', ') into admins
  from public.users where role = 'platform_admin';

  if admins is null then
    raise exception 'لا يوجد platform_admin بعد الهجرة';
  end if;
  if admins <> 'mustafabushra1779@gmail.com' then
    raise exception 'مدير المنصة غير متوقع: %', admins;
  end if;

  raise notice 'platform_admin = %', admins;
end $$;
