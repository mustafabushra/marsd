-- Migration: 055_analytics_missing_counts.sql
-- Purpose: two counts the report analytics card displays and 054 did not return.
--
-- The card labels the median review time with "N تقريراً مُعتمداً" and the average
-- delay with "N تقريراً فيه تأخير". Both were derived from the report array the
-- screen used to hold. Removing the array left two references to bindings that
-- no longer exist — which the Vite build does not catch, because it does no
-- scope analysis on identifiers inside JSX, so it would have thrown on render.
--
-- The counts belong beside the figures they qualify: an average over a
-- population is misleading without the size of that population.

create or replace function public.report_analytics(p_days integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := case when p_days > 0
                              then now() - (p_days || ' days')::interval
                              else '-infinity'::timestamptz end;
  v jsonb;
begin
  if not public.is_platform_admin() and not public.is_reviewer() then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'total',        count(*),
    'pending',      count(*) filter (where status = 'pending_review'),
    'approved',     count(*) filter (where status = 'approved'),
    'rejected',     count(*) filter (where status = 'rejected'),
    'request_info', count(*) filter (where status = 'request_info'),
    'defaults',     count(*) filter (where defaulted),
    'reviewed',     count(*) filter (where approved_at is not null),
    'with_delay',   count(*) filter (where delay_days > 0),
    'avg_delay',    coalesce(round(avg(delay_days) filter (where delay_days > 0)), 0),
    'total_value',  coalesce(sum(deal_value), 0),
    'median_review_hours', coalesce(round(
      percentile_cont(0.5) within group (
        order by extract(epoch from (approved_at - created_at)) / 3600
      ) filter (where approved_at is not null)), 0)
  ) into v
  from public.reports
  where created_at >= v_since;

  return v
    || jsonb_build_object('by_category', coalesce((
         select jsonb_object_agg(category, n) from (
           select category, count(*) n from public.reports
            where category is not null and created_at >= v_since
            group by category) x), '{}'::jsonb))
    || jsonb_build_object('by_commitment', coalesce((
         select jsonb_object_agg(payment_commitment, n) from (
           select payment_commitment, count(*) n from public.reports
            where payment_commitment is not null and created_at >= v_since
            group by payment_commitment) x), '{}'::jsonb))
    || jsonb_build_object('monthly', coalesce((
         select jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m) from (
           select to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n
             from public.reports
            where created_at >= greatest(v_since, date_trunc('month', now()) - interval '11 months')
            group by 1) y), '[]'::jsonb))
    || jsonb_build_object('top_companies', coalesce((
         select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)
                          order by n desc) from (
           select c.id, c.name, count(*) n
             from public.reports r join public.companies c on c.id = r.target_company_id
            where r.created_at >= v_since
            group by c.id, c.name order by n desc limit 10) z), '[]'::jsonb))
    || jsonb_build_object('top_reporters', coalesce((
         select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)
                          order by n desc) from (
           select t.id, t.name, count(*) n
             from public.reports r join public.tenants t on t.id = r.reporter_tenant_id
            where r.created_at >= v_since
            group by t.id, t.name order by n desc limit 10) z), '[]'::jsonb));
end $$;

grant execute on function public.report_analytics(integer) to authenticated;

do $$
declare v_admin text; v_doc jsonb; v_real int;
begin
  select id into v_admin from public.users where role='platform_admin' and status='active' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_doc := public.report_analytics(0);
  select count(*) into v_real from public.reports where approved_at is not null;
  if (v_doc->>'reviewed')::int <> v_real then
    raise exception 'reviewed: الدالة % والجدول %', v_doc->>'reviewed', v_real;
  end if;
  select count(*) into v_real from public.reports where delay_days > 0;
  if (v_doc->>'with_delay')::int <> v_real then
    raise exception 'with_delay: الدالة % والجدول %', v_doc->>'with_delay', v_real;
  end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ العدّادان مطابقان للجدول';
end $$;
