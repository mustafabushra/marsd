-- Migration: 044_reviewers_can_review.sql
-- Purpose: let Marsad review a report. It never could.
--
-- reports has exactly one UPDATE policy:
--
--   using       (reporter_tenant_id = get_current_tenant_id() and status = 'draft')
--   with check  (reporter_tenant_id = get_current_tenant_id()
--                and status in ('draft', 'pending_review'))
--
-- A company editing its own draft, and nothing else. No clause for a reviewer,
-- none for a platform administrator. So approving a report, rejecting it, and
-- asking for more information have all been impossible since launch — the three
-- actions the review queue exists for.
--
-- It did not look impossible. An UPDATE that RLS filters out matches no rows and
-- raises nothing, so /admin/reports reported success, removed the row from the
-- list, and granted Give-to-Get credits through the service-role endpoint, which
-- does bypass RLS. Credits were paid for approvals that never happened, and the
-- report stayed in pending_review for the next reviewer to find.
--
-- Reading the row back after every admin write is what surfaced it, one day
-- after that check was added and months after the defect shipped. The error the
-- operator finally saw — "لم يُحفظ الطلب — تحقّق من صلاحيتك" — was correct.
--
-- Idempotent.

-- ============================================================================
-- 1) Reviewers may move a report through review
-- ============================================================================
-- Separate from the company's own policy rather than folded into it: they are
-- different rules about different rows, and one predicate holding both is how
-- the company clause came to be the only clause.

drop policy if exists reports_review_update on public.reports;
create policy reports_review_update on public.reports
  for update
  to authenticated
  using (public.is_reviewer() or public.is_platform_admin())
  with check (public.is_reviewer() or public.is_platform_admin());

-- A reviewer may also need to remove a report that should never have been
-- published — a duplicate, or one whose subject was merged away. Rejecting is
-- the normal path and leaves the record; this is for the rest.
drop policy if exists reports_admin_delete on public.reports;
create policy reports_admin_delete on public.reports
  for delete
  to authenticated
  using (public.is_platform_admin());

-- ============================================================================
-- 2) A reviewer decides status, not content
-- ============================================================================
-- The policy grants the row. What may change on it is a different question, and
-- leaving it open would let a reviewer edit the substance of someone's report —
-- the payment terms, the delay, the amount — and then approve their own version
-- of it. That is not review.

create or replace function public.guard_report_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_current_user_id() is null then
    return new;
  end if;

  -- The reporting company editing its own draft is not review; it may change
  -- whatever it likes until it submits.
  if new.reporter_tenant_id = public.get_current_tenant_id() and old.status = 'draft' then
    new.updated_at := now();
    return new;
  end if;

  if not (public.is_reviewer() or public.is_platform_admin()) then
    return new;   -- RLS will refuse the row anyway
  end if;

  if new.reporter_tenant_id is distinct from old.reporter_tenant_id
     or new.target_company_id is distinct from old.target_company_id
     or new.payment_commitment is distinct from old.payment_commitment
     or new.delay_days is distinct from old.delay_days
     or new.defaulted is distinct from old.defaulted
     or new.deal_value is distinct from old.deal_value
     or new.dealt_at is distinct from old.dealt_at
     or new.description is distinct from old.description
  then
    raise exception 'المراجعة تُغيّر حالة التقرير لا محتواه';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_review_guard on public.reports;
create trigger report_review_guard
  before update on public.reports
  for each row execute function public.guard_report_review();

-- ============================================================================
-- 3) What the outage left behind
-- ============================================================================
-- Reports that were credited as approved while their row never moved. If any
-- exist, the ledger and the queue disagree and a person has to reconcile them —
-- the migration will not guess which is right.

do $$
declare r record; n int := 0;
begin
  for r in
    select distinct c.report_id, c.tenant_id, c.amount, rp.status
      from public.credits_ledger c
      join public.reports rp on rp.id = c.report_id
     where c.reason = 'report_approved'
       and rp.status <> 'approved'
  loop
    n := n + 1;
    raise notice 'نقاط مُنحت لتقرير حالته % — التقرير %', r.status, r.report_id;
  end loop;

  if n = 0 then
    raise notice 'لا نقاط مُنحت لتقارير لم تُعتمد';
  else
    raise notice '%، تحتاج مطابقة يدوية', n;
  end if;
end $$;
