-- Migration: 020_enable_rls_phase2.sql
-- Purpose: finish enabling row-level security, on the tables members write.
--
-- Phase one covered plans, credits_ledger, tenants and users: money and
-- permission, written by no ordinary flow, where the worst mistake was an
-- administrator who could not save. These are different. Reports, companies,
-- watchlists and notifications are written by members going about their work,
-- so a wrong policy here is somebody unable to do their job.
--
-- Two policies are corrected first, for the same reason as in 017 — they never
-- name the caller:
--
--   companies.allow_anon_insert_companies  TO anon WITH CHECK (true)
--     Anyone at all, signed in or not, may add a row to the registry. Adding
--     companies is meant to be open to members, and it stays open to them; what
--     it should not be is open to nobody in particular.
--
--   pending_invites_update_acceptor
--     Reads auth.uid() against auth.users, which holds no rows in this project,
--     so accepting an invitation could never have matched. The rewrite lets an
--     invitee mark their own invitation accepted, which /auth/callback does.
--
-- companies and trust_scores stay publicly readable on purpose: the registry and
-- its scores are what the product shows visitors, and search runs before anyone
-- signs in.
--
-- Idempotent. To roll back one table:
--   alter table public.<name> disable row level security;

-- ============================================================================
-- companies — public to read, members to write
-- ============================================================================

drop policy if exists allow_anon_insert_companies    on public.companies;
drop policy if exists allow_service_insert_companies on public.companies;

create policy companies_insert on public.companies
for insert with check (
  public.get_current_user_id() is not null
);

alter table public.companies enable row level security;

-- ============================================================================
-- reports
-- ============================================================================
-- Existing policies already scope these to the filing tenant and to reviewers.

alter table public.reports enable row level security;

-- ============================================================================
-- watchlist_items
-- ============================================================================

alter table public.watchlist_items enable row level security;

-- ============================================================================
-- pending_invites
-- ============================================================================
-- An invitee is not yet a member of the tenant that invited them, so the
-- acceptance path cannot be scoped by tenant. It is scoped by address instead:
-- you may accept an invitation addressed to you, and set it to no status but
-- accepted.

drop policy if exists pending_invites_update_acceptor on public.pending_invites;

create policy pending_invites_update_acceptor on public.pending_invites
for update using (
  email = (select u.email from public.users u where u.id = public.get_current_user_id())
) with check (
  email = (select u.email from public.users u where u.id = public.get_current_user_id())
  and status = 'accepted'
);

alter table public.pending_invites enable row level security;

-- ============================================================================
-- notifications
-- ============================================================================
-- Insert was restricted to service_role and platform admins in 017.

alter table public.notifications enable row level security;

-- ============================================================================
-- audit_logs
-- ============================================================================
-- Insert was narrowed in 017 to the caller's own tenant under their own
-- identity. A trail anyone may write anything into records nothing.

alter table public.audit_logs enable row level security;

-- ============================================================================
-- Report the result
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select c.relname, c.relrowsecurity as rls, count(p.polname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by 1, 2
    having count(p.polname) > 0
    order by c.relrowsecurity, c.relname
  loop
    raise notice 'rls=%  policies=%  %', r.rls, r.policies, r.relname;
  end loop;
end $$;
