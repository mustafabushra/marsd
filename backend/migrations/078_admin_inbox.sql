-- Migration: 078_admin_inbox.sql
-- Purpose: one list of everything waiting on Marsad, ordered by how long it has
--          been waiting.
--
-- The dashboard shows totals — 26 companies, 12 pending reports — and answering
-- "what do I do today" means opening six screens and holding the answer in your
-- head. Every one of those counts is already on the dashboard; none of them is
-- something you can act on from there.
--
-- Nothing new is measured. It is the same queues, in one place, with the age of
-- the oldest item in each — because a queue nobody times is a queue that grows
-- without anyone noticing.

create or replace function public.admin_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(to_jsonb(x) order by x.overdue desc, x.oldest_days desc nulls last)
    into v
  from (
    select 'reports' as kind,
           'تقارير تنتظر المراجعة' as label,
           '/admin/reports' as href,
           count(*)::int as n,
           extract(day from now() - min(coalesce(submitted_at, created_at)))::int as oldest_days,
           false as overdue
      from public.reports
     where status in ('pending_review', 'request_info')
    having count(*) > 0

    union all
    -- A week is the line for documents: a company that uploaded its registration
    -- and heard nothing for a week stops uploading.
    select 'documents', 'مستندات تنتظر التوثيق', '/admin/documents',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           coalesce(extract(day from now() - min(created_at)) > 7, false)
      from public.company_documents
     where status = 'pending'
    having count(*) > 0

    union all
    -- The most urgent thing on the platform: the company answered, and its file
    -- is stopped until Marsad reads the answer.
    select 'answered', 'توضيحات وصلت وتنتظر قراءتك', '/admin/roster',
           count(*)::int,
           extract(day from now() - min(responded_at))::int,
           true
      from public.clarification_requests
     where status = 'answered'
    having count(*) > 0

    union all
    -- Past its deadline with no answer. Not Marsad's work, but Marsad's
    -- decision: chase, extend, or suspend.
    select 'overdue', 'طلبات توضيح فات موعدها', '/admin/roster',
           count(*)::int,
           extract(day from now() - min(due_at))::int,
           true
      from public.clarification_requests
     where status = 'open' and due_at is not null and due_at < now()
    having count(*) > 0

    union all
    select 'companies', 'شركات تنتظر الاعتماد', '/admin/requests',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           false
      from public.companies
     where not approved
    having count(*) > 0

    union all
    select 'data_requests', 'طلبات بيانات على شركات', '/admin/requests',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           false
      from public.company_data_requests
     where status = 'pending'
    having count(*) > 0

    union all
    select 'claims', 'مطالبات ملكية', '/admin/claim-requests',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           false
      from public.claim_requests
     where status = 'pending'
    having count(*) > 0

    union all
    select 'disputes', 'اعتراضات مفتوحة', '/admin/disputes',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           coalesce(extract(day from now() - min(created_at)) > 14, false)
      from public.disputes
     where status = 'open'
    having count(*) > 0

    union all
    select 'plan_changes', 'طلبات ترقية باقة', '/admin/subscriptions',
           count(*)::int,
           extract(day from now() - min(created_at))::int,
           false
      from public.plan_change_requests
     where status = 'pending'
    having count(*) > 0
  ) x;

  return coalesce(v, '[]'::jsonb);
end $fn$;

grant execute on function public.admin_inbox() to authenticated;
revoke all on function public.admin_inbox() from public, anon;

-- ============================================================================
-- What changed that deserves a look
-- ============================================================================
-- Separate from the inbox on purpose. The inbox is work assigned to Marsad; this
-- is the platform reporting on itself. Mixing them would make a falling score
-- look like a task somebody forgot to do.
create or replace function public.admin_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(to_jsonb(x) order by x.severity desc, x.at desc) into v
  from (
    -- Sharp falls. The history table exists now, so this is a fact rather than
    -- an impression: 15 points inside 30 days is a company whose behaviour
    -- changed, not noise.
    select 'score_drop' as kind, 2 as severity,
           co.name as subject,
           format('هبط مؤشرها %s نقطة', prev.score - cur.score) as detail,
           cur.recorded_at as at,
           '/trust-report/' || co.id as href
      from public.trust_score_history cur
      join lateral (
        select h.score from public.trust_score_history h
         where h.company_id = cur.company_id
           and h.recorded_at < cur.recorded_at
         order by h.recorded_at desc limit 1) prev on true
      join public.companies co on co.id = cur.company_id
     where cur.recorded_at > now() - interval '30 days'
       and prev.score - cur.score >= 15

    union all
    -- A contributor whose reports keep being rejected is the clearest signal the
    -- platform has that something is wrong with what it is being sent.
    select 'reject_rate', 2, t.tenant_name,
           format('%s%% من تقاريره مرفوضة (%s تقرير)', t.reject_rate, t.reports_total),
           now(), '/admin/roster'
      from public.contributors_overview() t
     where t.reports_total >= 3 and t.reject_rate >= 50

    union all
    -- Flagged companies, surfaced so they are not forgotten between the day the
    -- status is recorded and the day someone opens the list.
    select 'official_status', 3, co.name,
           'حالة رسمية مسجّلة: ' || co.official_status,
           co.official_status_at, '/trust-report/' || co.id
      from public.companies co
     where coalesce(co.official_status, 'none') <> 'none'
       and co.official_status_at > now() - interval '30 days'
  ) x;

  return coalesce(v, '[]'::jsonb);
end $fn$;

grant execute on function public.admin_alerts() to authenticated;
revoke all on function public.admin_alerts() from public, anon;

do $blk$
declare v_admin text; v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  v := public.admin_inbox();
  raise notice 'صندوق الوارد: % بند', jsonb_array_length(v);
  v := public.admin_alerts();
  raise notice 'التنبيهات: % بند', jsonb_array_length(v);

  perform set_config('request.jwt.claims', '', true);
  if public.admin_inbox() <> '[]'::jsonb then
    raise exception 'صندوق الوارد يُقرأ بلا جلسة';
  end if;
  raise notice '✅ يعمل للإدارة · مغلق أمام غيرها';
end $blk$;
