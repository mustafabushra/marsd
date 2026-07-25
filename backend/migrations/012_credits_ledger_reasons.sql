-- Migration: 012_credits_ledger_reasons.sql
-- Purpose: let the credits ledger record the things that actually earn credits.
--
-- Give-to-Get has never awarded or deducted a single point. The only write to
-- the ledger is in AddReport, and it passes reason 'report_submitted', which the
-- CHECK constraint does not allow. The insert's error was never read, so every
-- submission failed silently: three reports exist, the ledger holds nothing, and
-- "رصيدي من النقاط" could never have shown anything but zero.
--
-- The constraint was right to reject it — the vocabulary was simply too narrow
-- to describe the contributions the product is built around. This widens it to
-- the actions in system_settings.give_to_get_rules, so a balance can be audited
-- line by line rather than collapsing every grant into 'admin_adjustment'.
--
-- Idempotent.

-- ============================================================================
-- 1) A vocabulary that covers earning and spending
-- ============================================================================

alter table public.credits_ledger drop constraint if exists credits_ledger_reason_check;

alter table public.credits_ledger add constraint credits_ledger_reason_check
  check (reason in (
    -- earning: keys match system_settings.give_to_get_rules.earn
    'company_added',
    'company_completed',
    'documents_uploaded',
    'report_approved',
    -- spending: keys match .spend
    'search_unlock',
    'view_unlock',
    -- operator
    'admin_adjustment',
    'refund'
  ));

-- ============================================================================
-- 2) Who performed the action
-- ============================================================================
-- The credit belongs to the tenant: the company subscribes, the company pays,
-- and an employee who leaves must not take a balance with them. This column is
-- not a claim on the points — it answers a different question, the one that
-- matters when a report turns out to be false and someone has to be asked about
-- it. Nullable, because rows written before this existed have no answer, and
-- because an operator adjustment has no employee behind it.

alter table public.credits_ledger add column if not exists user_id text;

create index if not exists idx_credits_ledger_user on public.credits_ledger(user_id) where user_id is not null;

-- ============================================================================
-- 3) A report may only be paid for once
-- ============================================================================
-- Approval is an admin action and admin actions get repeated: a double click, a
-- reopened review, a status corrected and set back. Without this, each repeat
-- mints another twenty points. The database refuses rather than trusting every
-- caller to check first.

create unique index if not exists idx_credits_one_award_per_report
  on public.credits_ledger(report_id, reason)
  where report_id is not null and reason = 'report_approved';

comment on column public.credits_ledger.user_id is 'Employee who performed the action. Attribution for audit; the credit itself belongs to the tenant.';
comment on constraint credits_ledger_reason_check on public.credits_ledger is 'Earning keys mirror system_settings.give_to_get_rules; changing one without the other silently breaks awarding.';
