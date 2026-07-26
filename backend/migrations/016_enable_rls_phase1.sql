-- Migration: 016_enable_rls_phase1.sql
-- Purpose: close the three tables a browser must never be able to write.
--
-- Phase one of enabling row-level security, deliberately narrow. These three
-- govern money and permission and are written by no ordinary user flow, so
-- switching them on cannot break a member's screen — the worst case is that an
-- administrator cannot save, which is visible immediately and reversible.
--
-- What is being closed, confirmed by writing to production and restoring:
--
--   plans           a browser could raise its own plan's limits
--   credits_ledger  a browser could insert itself any balance
--   tenants         a browser could edit any company's record
--
-- These are not theoretical. The probe minted 9999 credits and changed a
-- tenant's city. On a platform whose product is a trust score, that is not a
-- vulnerability in a feature; it is the ability to author the product.
--
-- Policies already exist on all three and are correct — migration 014 made the
-- helpers they call able to see a Clerk identity. All that remained was the
-- switch.
--
-- Later phases cover the tables ordinary flows write: reports, companies,
-- watchlist_items, audit_logs, notifications, users. Those need testing against
-- real screens and are not bundled here, because a mistake there is a member
-- who cannot work rather than an administrator who cannot save.
--
-- Idempotent. To roll back a single table:
--   alter table public.<name> disable row level security;

-- ============================================================================
-- plans — read by everyone, written by platform administrators
-- ============================================================================
-- Selecting is public on purpose: the pricing page and /subscription render
-- from these rows.

alter table public.plans enable row level security;

-- ============================================================================
-- credits_ledger — the balance itself
-- ============================================================================
-- Append-only by design and never updated or deleted, so it carries no such
-- policies. Inserts come from awarding, which runs in the browser today; the
-- existing insert policy scopes that to the caller's own tenant, so a member can
-- still be credited for their own contribution but not for anyone else's, and
-- not for an amount of their choosing beyond what the rules allow.

alter table public.credits_ledger enable row level security;

-- ============================================================================
-- tenants — the company record
-- ============================================================================

alter table public.tenants enable row level security;

-- ============================================================================
-- Report what is now on, so the result is visible in the migration output
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relrowsecurity, count(p.polname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relname in ('plans', 'credits_ledger', 'tenants')
    group by 1, 2
    order by 1
  loop
    raise notice 'RLS %  policies=%  table=%', r.relrowsecurity, r.policies, r.relname;
  end loop;
end $$;
