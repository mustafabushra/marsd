-- Migration: 030_realtime_remaining.sql
-- Purpose: finish the live dashboards. Four tables were still outside the
-- publication, and a screen subscribed to a table nobody replicates is not live —
-- it is a screen with a green badge on it.
--
-- plans and system_settings matter most. Everything on this platform is supposed
-- to be adjustable from the admin panel without a deploy, and 029 made the
-- database read those two at the moment of each write. If they do not replicate,
-- an operator raising a limit changes what the database enforces while every open
-- screen keeps showing and offering the old one until someone reloads — the rule
-- and the interface disagreeing is exactly what the panel was supposed to end.
--
-- Idempotent.

do $$
declare t text;
begin
  foreach t in array array[
    'plans',            -- limits and features an operator edits
    'system_settings',  -- enforcement switch, Give-to-Get rules
    'review_actions',   -- why a report was rejected, shown on تقاريري
    'invoices'          -- billing history on الاشتراك
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'أُضيف للبث اللحظي: %', t;
    end if;
  end loop;
end $$;

-- An update needs its old row to be identifiable by more than its primary key for
-- a subscriber to tell what changed.
alter table public.plans           replica identity full;
alter table public.system_settings replica identity full;

do $$
declare r record;
begin
  raise notice '—— جداول البث اللحظي ——';
  for r in select tablename from pg_publication_tables
            where pubname = 'supabase_realtime' order by tablename loop
    raise notice '  %', r.tablename;
  end loop;
end $$;
