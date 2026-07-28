-- Migration: 052_last_login_and_orphan_account.sql
-- Purpose: record when someone actually signed in, and retire an account that
--          cannot sign in at all.
--
-- ============================================================================
-- 1) last_login_at has never been written
-- ============================================================================
-- Zero of six accounts have a value. The admin panel shows "آخر دخول" and it is
-- blank for everyone, so there is no way to tell an active account from an
-- abandoned one — which is the first thing you want when deciding whether a
-- seat is in use or a suspicious login happened.
--
-- Written through a function rather than by widening the update policy on users.
-- A policy letting a member update their own row to set a timestamp lets them
-- update their own row, and role and tenant_id and status live there too. This
-- takes no arguments, so the only row it can touch is the caller's.

create or replace function public.touch_last_login()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id text := public.get_current_user_id();
begin
  if v_id is null then
    return;
  end if;
  update public.users set last_login_at = now() where id = v_id;
end $$;

comment on function public.touch_last_login is
  'تسجيل وقت آخر دخول للمستخدم الحالي فقط — لا يقبل معرّفاً حتى لا يكتب لأحد غيره';

grant execute on function public.touch_last_login() to authenticated;

-- ============================================================================
-- 2) An account that can never sign in
-- ============================================================================
-- company@marsad.sa is keyed by a uuid. Every real account is keyed by a Clerk
-- id (user_…), because that is what the session token's `sub` carries and what
-- get_current_user_id() compares against. Nothing can ever authenticate as this
-- row: it is seed data from before Clerk.
--
-- It is not deleted. It is the author of rows elsewhere — audit entries and
-- possibly reports — and removing it would either cascade those away or fail on
-- the reference, and neither is worth it to tidy a list. Marking it inactive
-- takes it out of the seat count and the active-user statistics while leaving
-- every trail it is named in intact.
--
-- 'inactive', not 'suspended': users_status_check admits active, inactive and
-- pending_email_verification. 'suspended' is the vocabulary of tenants, not of
-- users, and the first draft of this migration used it and was refused.

do $$
declare v_n int;
begin
  update public.users
     set status = 'inactive'
   where id !~ '^user_'
     and status = 'active';
  get diagnostics v_n = row_count;
  raise notice 'حسابات بلا معرّف Clerk عُلّقت: %', v_n;
end $$;

-- ============================================================================
-- 3) Verify
-- ============================================================================
do $$
declare v_n int;
begin
  select count(*) into v_n from public.users where id !~ '^user_' and status = 'active';
  if v_n > 0 then
    raise exception 'ما زال % حساباً نشطاً بلا معرّف Clerk', v_n;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'touch_last_login') then
    raise exception 'دالة تسجيل الدخول غير موجودة';
  end if;

  raise notice '✅ تسجيل آخر دخول جاهز · لا حساب نشط بلا هوية';
end $$;
