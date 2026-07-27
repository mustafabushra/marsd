-- Migration: 045_report_approval_single_writer.sql
-- Purpose: stop the approval trigger writing credits, which is why approving a
-- report failed even once reviewers were allowed to.
--
-- 044 gave reviewers an UPDATE policy and approving still failed:
--
--     new row violates row-level security policy for table "credits_ledger"
--
-- on_report_approved fires when a report becomes approved and inserts a credit
-- row. credits_ledger accepts inserts from service_role only — the lock that
-- stops a company minting its own points — and a trigger runs as the caller, so
-- the insert was refused and took the whole UPDATE down with it.
--
-- Granting the trigger the privilege would have fixed the symptom and left a
-- worse problem. There are two writers for the same event:
--
--   this trigger              10 points, hard-coded
--   /api/award-credits        20 points, read from give_to_get_rules, capped
--                             monthly, skipped on plans that do not earn
--
-- The panel calls the endpoint. So had the trigger ever worked, an approval
-- would have paid 30 at two different rates, one of them ignoring the monthly
-- cap and the plan. The figure on /subscription — read from settings — would
-- have described neither.
--
-- The trigger keeps the one thing that must happen on every path: the score.
-- A report approved by a migration, a seed or a backfill still has to move the
-- company's rating, and only the database sees all of those.
--
-- Idempotent.

create or replace function public.on_report_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and (old is null or old.status <> 'approved') then
    -- The score, and only the score.
    --
    -- Credits are the application's: it reads the rate from settings, enforces
    -- the monthly cap, and skips plans that do not earn that way — none of which
    -- a trigger can see. Notifications are the application's too: this sent one
    -- to a single company_admin, and a company is more than its administrator.
    perform public.compute_trust_score(new.target_company_id);
  end if;

  -- A report leaving 'approved' — withdrawn after a dispute, or corrected —
  -- must also move the score. The old version only recomputed on the way in, so
  -- a withdrawn report kept counting until something else happened to that
  -- company.
  if old is not null and old.status = 'approved' and new.status <> 'approved' then
    perform public.compute_trust_score(new.target_company_id);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- Was anything paid twice while both writers existed?
-- ============================================================================
-- The trigger's insert was refused for any caller without service_role, so in
-- practice only seeds and migrations could have produced one. Checking rather
-- than assuming.

do $$
declare r record; n int := 0;
begin
  for r in
    select report_id, count(*) as rows, sum(amount) as total
      from public.credits_ledger
     where reason = 'report_approved' and report_id is not null
     group by report_id
    having count(*) > 1
  loop
    n := n + 1;
    raise notice 'تقرير % مُنح % مرة بمجموع % نقطة', r.report_id, r.rows, r.total;
  end loop;

  if n = 0 then
    raise notice 'لا تقرير مُنح نقاطاً مرتين';
  else
    raise notice '% تقرير يحتاج مطابقة', n;
  end if;
end $$;
