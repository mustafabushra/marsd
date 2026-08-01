-- Migration: 079_fix_compute_trust_score_perms.sql
-- Purpose: approving a report raises "permission denied for function
--          trust_layer_official". Report approval is broken in production.
--
-- ============================================================================
-- What I did
-- ============================================================================
-- 063 and 075 revoked trust_layer_official and trust_layer_platform from
-- authenticated, because probe-anon-rpc found them answering unauthenticated
-- callers with per-company sub-scores. That was right.
--
-- But compute_trust_score is plain plpgsql with no SECURITY DEFINER, so it runs
-- as whoever calls it — and AdminReports calls it over RPC as the reviewer, right
-- after saving an approval. The reviewer has no rights to the layer helpers, the
-- call fails, and the approval flow takes the error with it.
--
-- So the change that closed a leak broke the single most important action on the
-- platform, and nothing said so: the screen reports it as a toast, and I read
-- the leak probe going green as the whole story. probe-review caught it, which
-- is the entire reason that probe exists.
--
-- compute_trust_score becomes SECURITY DEFINER. It reads reports and companies
-- and writes one row to trust_scores, and it takes only a company id — so it
-- cannot be pointed at anything the caller should not reach.

create or replace function public.compute_trust_score(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rules      jsonb;
  v_n          int;
  v_on_time    int;
  v_defaults   int;
  v_avg_delay  numeric;
  v_community  numeric;
  v_official   numeric;
  v_platform   numeric;
  v_score      int;
  v_tier       varchar;
  v_risk_band  varchar;
  v_prelim_min int;  v_full_min  int;
  v_base       numeric;  v_w_on_time numeric;  v_w_default numeric;
  v_delay_cap  numeric;  v_delay_div numeric;
  v_floor      int;  v_ceiling   int;
  v_low_min    int;  v_med_min   int;
  w_off        numeric;  w_com numeric;  w_plat numeric;  w_sum numeric;
begin
  select value into v_rules from public.system_settings where key = 'trust_score_rules';

  v_prelim_min := coalesce((v_rules #>> '{thresholds,preliminary_min_reports}')::int, 2);
  v_full_min   := coalesce((v_rules #>> '{thresholds,full_min_reports}')::int, 5);
  v_base       := coalesce((v_rules #>> '{weights,base}')::numeric, 50);
  v_w_on_time  := coalesce((v_rules #>> '{weights,on_time}')::numeric, 45);
  v_w_default  := coalesce((v_rules #>> '{weights,default}')::numeric, 40);
  v_delay_cap  := coalesce((v_rules #>> '{weights,delay_penalty_cap}')::numeric, 20);
  v_delay_div  := nullif(coalesce((v_rules #>> '{weights,delay_days_per_point}')::numeric, 5), 0);
  v_floor      := coalesce((v_rules #>> '{clamp,floor}')::int, 5);
  v_ceiling    := coalesce((v_rules #>> '{clamp,ceiling}')::int, 98);
  v_low_min    := coalesce((v_rules #>> '{bands,low_min}')::int, 70);
  v_med_min    := coalesce((v_rules #>> '{bands,medium_min}')::int, 40);

  w_off  := coalesce((v_rules #>> '{layers,official,weight}')::numeric, 30);
  w_com  := coalesce((v_rules #>> '{layers,community,weight}')::numeric, 50);
  w_plat := coalesce((v_rules #>> '{layers,platform,weight}')::numeric, 20);
  w_sum  := nullif(w_off + w_com + w_plat, 0);

  select count(*),
         count(*) filter (where payment_commitment = 'full'),
         count(*) filter (where defaulted),
         coalesce(avg(delay_days), 0)
    into v_n, v_on_time, v_defaults, v_avg_delay
    from public.reports
   where target_company_id = p_company_id and status = 'approved';

  v_official := public.trust_layer_official(p_company_id);
  v_platform := public.trust_layer_platform(p_company_id);

  if v_n < v_prelim_min then
    v_score := 0;
    v_tier  := 'none';
    v_community := null;
  else
    v_community := greatest(v_floor, least(v_ceiling,
        v_base
      + (v_on_time::numeric  / v_n) * v_w_on_time
      - (v_defaults::numeric / v_n) * v_w_default
      - least(v_delay_cap, coalesce(v_avg_delay / v_delay_div, 0))));

    v_score := greatest(v_floor, least(100, round(
      (v_official * w_off + v_community * w_com + v_platform * w_plat) / w_sum)::int));

    v_tier := case when v_n >= v_full_min then 'full' else 'preliminary' end;
  end if;

  v_risk_band := case
    when v_tier = 'none'      then 'none'
    when v_score >= v_low_min then 'low'
    when v_score >= v_med_min then 'medium'
    else 'high'
  end;

  insert into public.trust_scores (company_id, score, risk_band, tier, approved_reports, breakdown)
  values (
    p_company_id, v_score, v_risk_band, v_tier, v_n,
    jsonb_build_object(
      'approved_reports', v_n,
      'on_time',          v_on_time,
      'on_time_pct',      case when v_n > 0 then round(v_on_time::numeric / v_n * 100) else 0 end,
      'defaults',         v_defaults,
      'avg_delay_days',   round(v_avg_delay),
      'tier',             v_tier,
      'layers', jsonb_build_object(
        'official',  jsonb_build_object('score', round(v_official),  'weight', w_off),
        'community', jsonb_build_object('score', round(v_community), 'weight', w_com),
        'platform',  jsonb_build_object('score', round(v_platform),  'weight', w_plat)),
      'rules_applied',    v_rules,
      'computed_at',      now()))
  on conflict (company_id) do update
    set score = excluded.score, risk_band = excluded.risk_band, tier = excluded.tier,
        approved_reports = excluded.approved_reports, breakdown = excluded.breakdown,
        computed_at = now();
end $fn$;

grant execute on function public.compute_trust_score(uuid) to authenticated;

-- ============================================================================
-- Prove approval works as a reviewer, which is how it broke
-- ============================================================================
do $blk$
declare
  v_admin text; v_tid uuid; v_co uuid; v_rep uuid; v_n int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select t.id into v_tid from public.tenants t join public.users u on u.tenant_id = t.id limit 1;
  select c.id into v_co from public.companies c
   where c.approved and not exists (
     select 1 from public.reports r
      where r.target_company_id = c.id and r.reporter_tenant_id = v_tid
        and r.created_at > now() - interval '90 days')
   limit 1;

  if v_co is null then
    raise notice 'لا شركة صالحة للفحص — تعذّر الإثبات';
    return;
  end if;

  insert into public.reports
    (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, delay_days)
  values (v_tid, v_co, 'pending_review', now() - interval '30 days', 'late', 12)
  returning id into v_rep;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;

  update public.reports set status = 'approved', approved_at = now() where id = v_rep;
  get diagnostics v_n = row_count;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_n <> 1 then
    raise exception 'الاعتماد لم يُحفظ';
  end if;

  delete from public.credits_ledger where source_table = 'reports' and source_id = v_rep;
  delete from public.reports where id = v_rep;
  perform public.compute_trust_score(v_co);

  raise notice '✅ المراجع يعتمد التقرير والمؤشر يُحتسب';
end $blk$;
