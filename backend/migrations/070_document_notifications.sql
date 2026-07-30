-- Migration: 070_document_notifications.sql
-- Purpose: a document a company sends must reach a person, not a table.
--
-- ============================================================================
-- The same omission as 047, repeated
-- ============================================================================
-- 068 built the documents system and 069 built the screen that asks companies to
-- use it — and nothing tells Marsad that anything arrived. The pending queue is
-- discovered by opening /admin/documents and looking, which is exactly the
-- failure 047 fixed for company registrations and ownership claims.
--
-- It fails the same way in both directions. A company uploads its commercial
-- registration and hears nothing; a reviewer verifies it and the company is not
-- told either, so the one action that raises its official layer by twenty points
-- happens invisibly. A company that is not told its paperwork was accepted has no
-- reason to send the next document.
--
-- notifications_type_check refuses every type this needs, and the queue policy
-- lists the four types a signed-in user may address to a platform admin —
-- document_submitted is not among them, so even a correctly shaped insert would
-- be filtered out by RLS and return nothing.

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
    'report_submitted', 'dispute_raised', 'document_submitted',
    -- To the company, about a decision on its own paperwork
    'document_verified', 'document_rejected',
    -- Marsad recording something the company cannot write about itself
    'official_status_recorded',
    -- Watchlist: designed, nothing emits them yet
    'score_changed', 'watchlist_alert'
  ));

-- A signed-in user may put a document in Marsad's queue, and nothing else new.
-- The policy stays an explicit list rather than a pattern: a rule that admits
-- anything ending in _submitted admits the next thing someone names that way.
drop policy if exists notifications_insert_queue on public.notifications;
create policy notifications_insert_queue on public.notifications
  for insert
  to authenticated
  with check (
    public.get_current_user_id() is not null
    and type in ('company_registration_submitted', 'claim_request_submitted',
                 'report_submitted', 'dispute_raised', 'document_submitted')
    and exists (
      select 1 from public.users u
       where u.id = notifications.user_id
         and u.role in ('platform_admin', 'reviewer')
         and u.status = 'active')
  );

-- ============================================================================
-- Verify every new type actually lands
-- ============================================================================
-- 046 was written because eleven of twelve types were being refused while a
-- probe that wrote the one allowed type reported success. So each new type is
-- inserted here and read back, then removed.
do $blk$
declare
  v_admin  text;
  v_tenant uuid;
  t        text;
  v_n      int;
begin
  select id into v_admin from public.users
   where role = 'platform_admin' and status = 'active' limit 1;
  select id into v_tenant from public.tenants limit 1;
  if v_admin is null then
    raise exception 'لا حساب إدارة نشط — تعذّر إثبات وصول الإشعارات';
  end if;

  foreach t in array array['document_submitted', 'document_verified',
                           'document_rejected', 'official_status_recorded']
  loop
    insert into public.notifications (user_id, tenant_id, type, payload)
    values (v_admin, v_tenant, t, jsonb_build_object('title', 'probe'));

    select count(*) into v_n from public.notifications
     where type = t and payload ->> 'title' = 'probe';
    if v_n = 0 then
      raise exception 'النوع % لم يصل الجدول', t;
    end if;
  end loop;

  delete from public.notifications where payload ->> 'title' = 'probe';
  raise notice '✅ أنواع إشعارات المستندات الأربعة تُكتب وتُقرأ';
end $blk$;
