-- Migration: 021_enable_rls_phase3.sql
-- Purpose: cover the Marsad tables row-level security had not reached.
--
-- Four tables carried correct policies and had never been switched on:
-- trust_scores, business_requests, company_profiles, subscriptions. Four more
-- had no policies at all — claim_requests, registration_requests,
-- company_data_requests, company_audit_log — which is to say every row of every
-- company's claim and registration paperwork was readable and writable by
-- anyone holding the anon key, which is published in the browser bundle.
--
-- Not touched, deliberately: Appointment, KnowledgeSource, Lead, Page, Post,
-- SiteSetting and Testimonial. No Marsad file references any of them; they
-- belong to another project sharing this database. They are equally exposed,
-- but enabling RLS on a table this application does not own would break
-- somebody else's application without warning. Reported instead.
--
-- Idempotent.

-- ============================================================================
-- 1) Already had policies, never enabled
-- ============================================================================
-- trust_scores stays publicly readable: a score is what the product shows a
-- visitor, and search renders it before anyone signs in.

alter table public.trust_scores      enable row level security;
alter table public.business_requests enable row level security;
alter table public.company_profiles  enable row level security;
alter table public.subscriptions     enable row level security;

-- ============================================================================
-- 2) claim_requests — a company claiming its own registry entry
-- ============================================================================

drop policy if exists claim_requests_select on public.claim_requests;
drop policy if exists claim_requests_insert on public.claim_requests;
drop policy if exists claim_requests_update on public.claim_requests;

create policy claim_requests_select on public.claim_requests
for select using (
  tenant_id = public.get_current_tenant_id()
  or user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

-- Filed during onboarding, before the user is attached to a tenant, so it can
-- only be keyed to the claimant themselves.
create policy claim_requests_insert on public.claim_requests
for insert with check (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

-- Reviewing a claim is a platform decision. A claimant who could update their
-- own row could approve their own claim to another company's identity.
create policy claim_requests_update on public.claim_requests
for update using (public.is_platform_admin())
with check (public.is_platform_admin());

alter table public.claim_requests enable row level security;

-- ============================================================================
-- 3) registration_requests — the same shape, for a new company
-- ============================================================================

drop policy if exists registration_requests_select on public.registration_requests;
drop policy if exists registration_requests_insert on public.registration_requests;
drop policy if exists registration_requests_update on public.registration_requests;

create policy registration_requests_select on public.registration_requests
for select using (
  tenant_id = public.get_current_tenant_id()
  or user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy registration_requests_insert on public.registration_requests
for insert with check (
  user_id = public.get_current_user_id()
  or public.is_platform_admin()
);

create policy registration_requests_update on public.registration_requests
for update using (public.is_platform_admin())
with check (public.is_platform_admin());

alter table public.registration_requests enable row level security;

-- ============================================================================
-- 4) company_data_requests — asking for a registry entry to be corrected
-- ============================================================================

drop policy if exists company_data_requests_select on public.company_data_requests;
drop policy if exists company_data_requests_insert on public.company_data_requests;
drop policy if exists company_data_requests_update on public.company_data_requests;

create policy company_data_requests_select on public.company_data_requests
for select using (
  requested_by_tenant_id = public.get_current_tenant_id()
  or public.is_platform_admin()
);

create policy company_data_requests_insert on public.company_data_requests
for insert with check (
  requested_by_tenant_id = public.get_current_tenant_id()
  and requested_by_user_id = public.get_current_user_id()
);

create policy company_data_requests_update on public.company_data_requests
for update using (public.is_platform_admin())
with check (public.is_platform_admin());

alter table public.company_data_requests enable row level security;

-- ============================================================================
-- 5) company_audit_log — a record of who changed a registry entry
-- ============================================================================
-- Append-only and never edited. Readable by platform staff, because it exists
-- for them; writable by anyone signed in, under their own identity, because the
-- flows that change a company record run in the browser. An entry nobody can
-- forge is the only kind worth keeping.

drop policy if exists company_audit_log_select on public.company_audit_log;
drop policy if exists company_audit_log_insert on public.company_audit_log;

create policy company_audit_log_select on public.company_audit_log
for select using (public.is_platform_admin());

create policy company_audit_log_insert on public.company_audit_log
for insert with check (
  actor_id is null or actor_id = public.get_current_user_id()
);

alter table public.company_audit_log enable row level security;
