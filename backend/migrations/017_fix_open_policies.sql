-- Migration: 017_fix_open_policies.sql
-- Purpose: replace policies that grant everyone everything.
--
-- Enabling row-level security in 016 changed less than it appeared to. Three
-- policies were written in a way that never refers to the caller, so they
-- evaluate the same for everybody:
--
--   tenants.allow_admin_manage_tenants   FOR ALL
--     USING (EXISTS (SELECT 1 FROM users WHERE role = 'platform_admin'))
--
--     Asks whether a platform administrator exists anywhere in the table, not
--     whether this caller is one. It was harmless only while no such row
--     existed — creating the first platform_admin in migration 015 turned it
--     true for everyone, on every command, including delete.
--
--   tenants.allow_tenant_read_own
--     USING (EXISTS (SELECT 1 FROM users WHERE users.tenant_id = tenants.id))
--
--     Asks whether the tenant has any members at all. Every company record is
--     readable by every visitor.
--
--   credits_ledger.credits_ledger_insert_system   WITH CHECK (true)  TO PUBLIC
--
--     Admits any insert from anyone. Verified against production: an anonymous
--     request minted a balance and the row landed. An earlier check called this
--     blocked because PostgREST reported an error — from the returning select,
--     which RLS did filter, while the insert itself had already succeeded.
--
-- The same `true`-to-PUBLIC shape exists on audit_logs and notifications and is
-- narrowed here too: an audit entry that anyone may forge is not an audit trail,
-- and a notification anyone may inject is a channel for phishing members.
--
-- Idempotent.

-- ============================================================================
-- tenants
-- ============================================================================

drop policy if exists allow_admin_manage_tenants on public.tenants;
drop policy if exists allow_tenant_read_own      on public.tenants;
drop policy if exists allow_tenant_insert        on public.tenants;

create policy tenants_select on public.tenants
for select using (
  id = public.get_current_tenant_id()
  or public.is_platform_admin()
);

-- Onboarding creates the tenant before the user is attached to one, so this
-- cannot require membership of the row being written. It does require that
-- somebody is signed in, which the previous `true` did not.
create policy tenants_insert on public.tenants
for insert with check (
  public.get_current_user_id() is not null
);

create policy tenants_update on public.tenants
for update using (
  (id = public.get_current_tenant_id() and public.is_tenant_admin())
  or public.is_platform_admin()
) with check (
  (id = public.get_current_tenant_id() and public.is_tenant_admin())
  or public.is_platform_admin()
);

create policy tenants_delete on public.tenants
for delete using (public.is_platform_admin());

-- ============================================================================
-- credits_ledger
-- ============================================================================
-- The open policy is replaced rather than narrowed. Awarding runs in the
-- browser today, and any client-side rule permissive enough to let a member be
-- credited is permissive enough to let them choose the amount — the balance
-- decides what the plan allows, so it cannot be writable by the party it
-- benefits. Inserts are restricted to service_role, and the awarding path moves
-- to a serverless function that verifies the Clerk session and applies the rates
-- from settings.

drop policy if exists credits_ledger_insert_system on public.credits_ledger;
drop policy if exists credits_ledger_insert_policy on public.credits_ledger;

create policy credits_ledger_insert on public.credits_ledger
for insert to service_role with check (true);

-- Members read their own company's ledger; the balance is shown on
-- /subscription and by the entitlement resolver.
drop policy if exists credits_ledger_select_policy on public.credits_ledger;
create policy credits_ledger_select on public.credits_ledger
for select using (
  tenant_id = public.get_current_tenant_id()
  or public.is_platform_admin()
);

-- ============================================================================
-- audit_logs
-- ============================================================================
-- Written from the browser throughout the app, so it stays client-writable —
-- but only for the caller's own tenant and under their own identity. A trail
-- anyone can write anything into records nothing.

drop policy if exists audit_logs_insert_system on public.audit_logs;

create policy audit_logs_insert on public.audit_logs
for insert with check (
  (tenant_id is null or tenant_id = public.get_current_tenant_id())
  and (actor_id is null or actor_id = public.get_current_user_id())
);

-- ============================================================================
-- notifications
-- ============================================================================
-- Addressed to a person, so an open insert is a way to put text in front of
-- another company's staff. Server-side only.

drop policy if exists notifications_insert_system on public.notifications;
drop policy if exists notifications_insert_policy on public.notifications;

create policy notifications_insert on public.notifications
for insert to service_role with check (true);

create policy notifications_insert_admin on public.notifications
for insert with check (public.is_platform_admin());
