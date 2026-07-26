-- Migration: 014_rls_helpers_for_clerk.sql
-- Purpose: teach the row-level-security helpers to read Clerk identities.
--
-- Seventy-nine policies exist across twenty tables and they are written well —
-- almost all of them go through four helper functions rather than reading the
-- token directly. That is the whole reason this is a small change: the policies
-- do not need rewriting, the functions they call do.
--
-- Those functions still read auth.uid(), which belongs to Supabase Auth. This
-- project authenticates with Clerk, so auth.uid() is always null and every
-- helper returns null. Where RLS is already enabled that means the table is
-- shut: system_settings has RLS on and an is_platform_admin() write policy, and
-- an update through it changes nothing — which is why the admin settings page
-- could not save. Where RLS is off it means nothing at all, and the anon key
-- writes freely: a browser can currently insert credits, edit plan limits, and
-- change tenant records.
--
-- There is also a type problem underneath. users.id became text in migration
-- 010 to hold Clerk identifiers, but get_current_user_id() still returns uuid,
-- so `users.id = get_current_user_id()` could not have matched even with a
-- session. Return types cannot be changed in place, and five policies depend on
-- that function, so they are dropped and recreated here unchanged.
--
-- This migration does NOT enable RLS anywhere. It makes the helpers correct so
-- that enabling it, table by table, becomes safe to verify.
--
-- Idempotent.

-- ============================================================================
-- 1) Drop the five policies that pin the function's signature
-- ============================================================================

drop policy if exists notifications_select_policy   on public.notifications;
drop policy if exists notifications_update_policy   on public.notifications;
drop policy if exists notifications_delete_policy   on public.notifications;
drop policy if exists pending_invites_select_policy on public.pending_invites;
drop policy if exists review_actions_insert_policy  on public.review_actions;

-- ============================================================================
-- 1b) Columns that hold a user id and are still uuid
-- ============================================================================
-- Migration 010 converted actor_id, entity_id and invited_by to text so they
-- could hold Clerk identifiers. It stopped there. These five were left as uuid,
-- which means a Clerk id cannot be written to any of them — a notification
-- addressed to a user, a document's uploader, a reviewer's action, the person
-- who added a watchlist entry. The same defect 010 was written to fix, in the
-- rows it did not reach.
--
-- Only notifications and review_actions carry policies over these columns; the
-- other three are governed by tenant_id and are unaffected by the type change.

alter table public.notifications    alter column user_id     type text using user_id::text;
alter table public.review_actions   alter column reviewer_id type text using reviewer_id::text;
alter table public.export_jobs      alter column user_id     type text using user_id::text;
alter table public.report_documents alter column uploaded_by type text using uploaded_by::text;
alter table public.watchlist_items  alter column created_by  type text using created_by::text;

-- ============================================================================
-- 2) The helpers, reading Clerk
-- ============================================================================
-- auth.jwt() carries whatever token the request presented. With Supabase
-- configured to trust Clerk as a third-party provider, that is the Clerk
-- session token and 'sub' is the Clerk user id — the same value stored in
-- users.id. A request with only the anon key has no 'sub', so every helper
-- returns null and every policy denies. That is the correct default.

drop function if exists public.get_current_user_id() cascade;

create function public.get_current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

comment on function public.get_current_user_id() is
  'Clerk user id from the request token. Text, matching users.id — not a uuid.';

create or replace function public.get_current_user_role()
returns varchar
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = public.get_current_user_id() limit 1
$$;

create or replace function public.get_current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = public.get_current_user_id() limit 1
$$;

-- Unchanged in meaning; restated so they resolve against the new definitions.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_current_user_role() = 'platform_admin', false)
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_current_user_role() in ('company_admin', 'platform_admin'), false)
$$;

-- ============================================================================
-- 3) Recreate the five policies
-- ============================================================================
-- Same rules as before. The only change is that the comparisons now have
-- matching types, and pending_invites reads the address from public.users
-- rather than auth.users — this project has no rows in auth.users, so that
-- subquery could only ever have returned null.

create policy notifications_select_policy on public.notifications
for select using (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy notifications_update_policy on public.notifications
for update using (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
) with check (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy notifications_delete_policy on public.notifications
for delete using (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy pending_invites_select_policy on public.pending_invites
for select using (
  tenant_id = public.get_current_tenant_id()
  or email = (select u.email from public.users u where u.id = public.get_current_user_id())
  or public.is_platform_admin()
);

create policy review_actions_insert_policy on public.review_actions
for insert with check (
  reviewer_id = public.get_current_user_id()
  and public.is_reviewer()
);

-- ============================================================================
-- 4) A way to see who the database thinks you are
-- ============================================================================
-- Callable from the browser. Enabling RLS blind is how a policy that denies
-- everything reaches production; this answers "does my token arrive, and as
-- whom" before any table is switched on.

create or replace function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'clerk_user_id', public.get_current_user_id(),
    'role',          public.get_current_user_role(),
    'tenant_id',     public.get_current_tenant_id(),
    'is_tenant_admin',   public.is_tenant_admin(),
    'is_platform_admin', public.is_platform_admin(),
    'jwt_present',   (auth.jwt() is not null),
    'jwt_issuer',    auth.jwt() ->> 'iss'
  )
$$;

grant execute on function public.whoami() to anon, authenticated;
