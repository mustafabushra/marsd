-- Migration: 047_admin_notifications.sql
-- Purpose: let Marsad be notified of a registration or an ownership claim.
--
-- CompanyOnboarding writes a notification when a company registers and when
-- someone claims an existing record. Both inserts fail, for three independent
-- reasons at once:
--
--   · type is 'company_registration_submitted' / 'claim_request_submitted',
--     neither of which the CHECK allowed
--   · user_id and tenant_id are both omitted, and both are NOT NULL
--   · the payload is JSON.stringify'd into a jsonb column, so even a row that
--     landed would read payload->>'message' as null
--
-- So no administrator has ever been told that a company signed up or that a
-- claim was filed. The queue is checked by opening the screen and looking.
--
-- verify-literals found the type. The other two were sitting beside it.
--
-- ============================================================================
-- 1) A notification to Marsad is about a company, not to one
-- ============================================================================
-- tenant_id was NOT NULL on the assumption that every notification belongs to a
-- customer company. An administrator has no tenant, and a claim on a company
-- nobody owns has no tenant to name either — the row is addressed to a person at
-- Marsad about a subject that may not exist yet.
--
-- user_id stays NOT NULL: a notification nobody receives is not a notification.

alter table public.notifications
  alter column tenant_id drop not null;

comment on column public.notifications.tenant_id is
  'الشركة التي يتعلّق بها الإشعار — فارغة لإشعارات إدارة مرصد عن موضوع بلا كيان';

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'report_approved', 'report_rejected', 'report_request_info',
    'company_approved', 'company_rejected', 'company_data_updated',
    'claim_approved', 'claim_rejected',
    'subscription_changed', 'tenant_status_changed',
    'credits_awarded', 'welcome',
    -- To Marsad, about work arriving in a queue
    'company_registration_submitted', 'claim_request_submitted',
    'report_submitted', 'dispute_raised',
    -- Watchlist: designed, nothing emits them yet
    'score_changed', 'watchlist_alert'
  ));

-- ============================================================================
-- 2) A company must not be able to write to Marsad's inbox
-- ============================================================================
-- The insert policy allows service_role and platform admins. A registering
-- company is neither, so its own notification to Marsad would be refused by RLS
-- even with the type and columns fixed — which is correct as a default and wrong
-- for this one case.
--
-- A tightly scoped policy: any signed-in user may write a notification addressed
-- to a platform administrator, and only of the two types that mean "something
-- arrived for you to review". It cannot be used to send a company anything.

drop policy if exists notifications_insert_queue on public.notifications;
create policy notifications_insert_queue on public.notifications
  for insert
  to authenticated
  with check (
    public.get_current_user_id() is not null
    and type in ('company_registration_submitted', 'claim_request_submitted',
                 'report_submitted', 'dispute_raised')
    and exists (
      select 1 from public.users u
       where u.id = notifications.user_id
         and u.role in ('platform_admin', 'reviewer')
         and u.status = 'active')
  );

do $$
declare n int;
begin
  select count(*) into n from public.users
   where role in ('platform_admin', 'reviewer') and status = 'active';
  raise notice 'مستقبلو إشعارات الإدارة: % حساباً', n;
  if n = 0 then
    raise notice 'تحذير: لا حساب إدارة نشط — لن يستقبل أحد إشعارات الطابور';
  end if;
end $$;
