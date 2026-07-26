-- Migration: 028_drop_business_requests.sql
-- Purpose: remove طلبات الأعمال from the platform. The client does not want it.
--
-- This undoes 027 and the original feature with it. The table has never held a
-- row — nothing in the product could create one — so there is nothing to keep,
-- and 027's guards and helper functions guard nothing.
--
-- Dropping rather than leaving it dormant: an unreachable table with RLS
-- policies, a trigger and two SECURITY DEFINER functions is surface that has to
-- be reasoned about in every future audit, in exchange for a feature nobody
-- asked to keep. 027 stays in the history as the record of what was here.
--
-- Idempotent.

-- ============================================================================
-- 1) Stop replicating it
-- ============================================================================
-- Dropping the table would remove it from the publication anyway; doing it first
-- keeps the order explicit rather than incidental.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'business_requests'
  ) then
    alter publication supabase_realtime drop table public.business_requests;
  end if;
end $$;

-- ============================================================================
-- 2) The helpers from 027
-- ============================================================================
-- list_business_requests joined tenant names for the caller's own rows;
-- tenant_id_for_company was the one bridge from the public companies table to
-- the private tenants table. Neither has another caller — the bridge in
-- particular should not outlive the single feature that justified it.

drop function if exists public.list_business_requests();
drop function if exists public.tenant_id_for_company(uuid);
drop function if exists public.guard_business_request_answer() cascade;

-- ============================================================================
-- 3) The table
-- ============================================================================
-- Guarded: if a row ever appears, this refuses to run rather than deleting data
-- nobody knew was there.

do $$
declare n bigint;
begin
  if to_regclass('public.business_requests') is null then
    raise notice 'business_requests: غير موجود أصلاً';
    return;
  end if;

  execute 'select count(*) from public.business_requests' into n;
  if n > 0 then
    raise exception 'الجدول يحتوي % صفاً — أوقفت الحذف', n;
  end if;

  drop table public.business_requests;
  raise notice 'business_requests: حُذف (كان فارغاً)';
end $$;
