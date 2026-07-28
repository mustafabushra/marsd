-- Migration: 046_notification_types.sql
-- Purpose: let the notifications the platform actually sends be stored.
--
-- notifications_type_check allows four values:
--
--     report_approved · score_changed · request_received · watchlist_alert
--
-- The application sends ten, and only one of them — report_approved — is on
-- that list. So every other notification has been refused by the constraint:
-- report rejected, information requested, company approved, company rejected,
-- claim approved, claim rejected, subscription changed, account suspended,
-- company data updated. Nine paths, all silent, because notifyTenant catches
-- its error and logs it.
--
-- This survived a probe that was written to catch exactly this class of defect.
-- probe-notifications wrote a notification and read it back and passed — with
-- report_approved, the one type that works. A test that exercises the happy
-- value proves the column accepts that value and nothing about the other nine.
--
-- Two of the four allowed values are themselves unused: score_changed and
-- watchlist_alert name events nothing emits, and request_received belongs to
-- the business-requests feature removed in 028.
--
-- The list is now what the code sends, plus the two watchlist events that are
-- designed and not yet wired — naming them here is not the same as pretending
-- they fire, and it means the day they do, nothing is refused.
--
-- Idempotent.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    -- Reports
    'report_approved',
    'report_rejected',
    'report_request_info',
    -- Companies and the registry
    'company_approved',
    'company_rejected',
    'company_data_updated',
    -- Ownership claims
    'claim_approved',
    'claim_rejected',
    -- Account and billing
    'subscription_changed',
    'tenant_status_changed',
    'credits_awarded',
    'welcome',
    -- Watchlist: designed, not yet emitted by anything
    'score_changed',
    'watchlist_alert'
  ));

-- ============================================================================
-- What the outage cost
-- ============================================================================
-- Every notification that was refused is gone — the insert never happened and
-- there is nothing to replay. This reports what the table does hold so the gap
-- is visible rather than assumed.

do $$
declare r record; n bigint;
begin
  select count(*) into n from public.notifications;
  raise notice 'إشعارات في الجدول: %', n;

  for r in select type, count(*) as c from public.notifications group by type order by 2 desc loop
    raise notice '  %: %', r.type, r.c;
  end loop;

  if n = 0 then
    raise notice 'لا إشعار واحد وصل أي عميل منذ الإطلاق';
  end if;
end $$;
