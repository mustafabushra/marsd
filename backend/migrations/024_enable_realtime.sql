-- Migration: 024_enable_realtime.sql
-- Purpose: publish the tables the dashboards read, so they can update themselves.
--
-- The supabase_realtime publication exists and contains no tables, so no change
-- has ever been broadcast. Both dashboards show whatever was true when the page
-- loaded: an administrator approving a report has no way to know another one
-- arrived, and the company that filed it learns its credit landed only by
-- reloading.
--
-- Row-level security applies to the stream as it does to a query — a subscriber
-- receives only changes to rows it could have selected — so publishing a table
-- widens nothing. That is only true because the policies are now correct;
-- publishing before this week would have broadcast every tenant's rows to
-- everyone holding the anon key.
--
-- REPLICA IDENTITY FULL is set on the tables whose deletions matter to a
-- listener. Postgres otherwise sends only the primary key on delete, which is
-- enough to remove a row from a list but not to tell whose it was — and a
-- dashboard filtering by tenant cannot decide whether a delete concerns it.
-- It costs more WAL per update, so it is not applied where nothing is deleted.
--
-- Idempotent.

do $$
declare
  t text;
begin
  foreach t in array array[
    -- Company dashboard
    'reports', 'companies', 'credits_ledger', 'watchlist_items',
    'notifications', 'trust_scores', 'company_data_requests',
    -- Admin dashboard
    'tenants', 'users', 'subscriptions', 'pending_invites',
    'claim_requests', 'registration_requests', 'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipped (absent): %', t;
      continue;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'published: %', t;
    end if;
  end loop;
end $$;

-- Rows get removed from these and a listener has to know which tenant lost one.
alter table public.watchlist_items      replica identity full;
alter table public.pending_invites      replica identity full;
alter table public.reports              replica identity full;
alter table public.company_data_requests replica identity full;

do $$
declare n integer;
begin
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime';
  raise notice 'realtime tables: %', n;
end $$;
