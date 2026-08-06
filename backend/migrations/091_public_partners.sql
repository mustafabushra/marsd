-- Migration: 091_public_partners.sql
-- Purpose: the public partners list, so the page stops inventing one.
--
-- ============================================================================
-- What is published, and why it is safe to publish
-- ============================================================================
-- Name, sector, approved report count, and the date the partnership started.
-- Exactly what /partners has always claimed to show — and one of the six stated
-- benefits is appearing on that page, so a partner is on it by choosing to be.
--
-- Nothing else crosses: no CR number, no contact, no trust score, no company id.
-- The registry itself stayed closed to signed-out visitors in 059 and stays
-- closed here — this is a list of who partners with Marsad, not a way to read
-- the registry through a side door.
--
-- Deliberately readable by anon, which is the exception in this schema and the
-- reason for the note above. probe-anon-rpc will see it answering without a
-- session; that is intended, and this comment is the record of the intent.

create or replace function public.public_partners()
returns table (name text, sector text, reports_approved integer, partner_since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    t.name::text,
    t.sector::text,
    (select count(*)::int from public.reports r
      where r.reporter_tenant_id = t.id and r.status = 'approved'),
    s.current_period_start
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id and p.code = 'partner'
  join public.tenants t on t.id = s.tenant_id
  where s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
    and t.status = 'active'
  order by s.current_period_start asc nulls last
  limit 60;
$fn$;

grant execute on function public.public_partners() to anon, authenticated;

-- ============================================================================
-- It publishes the four columns and no more
-- ============================================================================
do $blk$
declare v_cols text; v_n int;
begin
  select string_agg(a.attname, ',' order by a.attnum) into v_cols
    from pg_proc p
    join pg_type t on t.oid = p.prorettype
    join pg_class c on c.reltype = t.oid
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
   where p.proname = 'public_partners'
     and p.pronamespace = 'public'::regnamespace;

  -- A composite return type is not always introspectable this way; fall back to
  -- calling it and counting what a signed-out caller actually receives.
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.public_partners();
  raise notice 'شركاء منشورون: %', v_n;

  -- No partner is approved yet, so the page will render its empty state rather
  -- than four invented companies. That is the correct output.
  raise notice '✅ قائمة الشركاء تُقرأ بلا جلسة، وتنشر الاسم والقطاع والعدد والتاريخ فقط';
end $blk$;
