-- Migration: 025_restore_lost_limits.sql
-- Purpose: put back limits the admin panel deleted, and stop it happening again.
--
-- Saving a plan from /admin/plans rebuilt the limits object from the keys that
-- form renders, so any key it did not render was dropped. pending_reports was
-- not in the form, and disappeared from every plan it had been set on. The limit
-- did not fail loudly — it simply stopped existing, and an absent limit is
-- unlimited by design, so the ceiling on reports awaiting review quietly became
-- none.
--
-- The form is fixed to merge rather than replace. This restores what was lost
-- and adds a guard so the same shape of mistake is caught by the database rather
-- than by a user noticing a limit no longer applies.
--
-- Idempotent.

-- ============================================================================
-- 1) Restore, without disturbing values an operator has since tuned
-- ============================================================================
-- jsonb || only overwrites the keys named, so a plan whose searches were raised
-- in the panel keeps that change.

update public.plans set limits = limits || '{"pending_reports": 5,  "compare_items": 0}'::jsonb, updated_at = now() where code = 'free';
update public.plans set limits = limits || '{"pending_reports": 15, "compare_items": 0}'::jsonb, updated_at = now() where code = 'basic';
update public.plans set limits = limits || '{"pending_reports": 50, "compare_items": 6}'::jsonb, updated_at = now() where code = 'pro';
update public.plans set limits = limits || '{"pending_reports": -1, "compare_items": -1}'::jsonb, updated_at = now() where code = 'enterprise';

-- ============================================================================
-- 2) Refuse a plan that is missing a limit the application enforces
-- ============================================================================
-- The application treats an absent key as unlimited, which is the right default
-- for a limit nobody ever set and the wrong one for a limit that was deleted.
-- The database cannot tell those apart from the value alone — so it requires the
-- keys that exist to keep existing.

create or replace function public.check_plan_limits_complete()
returns trigger
language plpgsql
as $$
declare
  required text[] := array['searches_per_month', 'users', 'watchlist_items', 'pending_reports'];
  k text;
begin
  foreach k in array required loop
    if not (new.limits ? k) then
      raise exception 'الباقة % ينقصها الحد %', new.code, k;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_plan_limits_complete on public.plans;
create trigger trg_plan_limits_complete
  before insert or update on public.plans
  for each row execute function public.check_plan_limits_complete();

do $$
declare r record;
begin
  for r in select code, limits from public.plans order by sort_order loop
    raise notice '% -> %', r.code, r.limits;
  end loop;
end $$;
