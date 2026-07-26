-- Migration: 031_trust_score_rules.sql
-- Purpose: make the trust score depend on what the reports say, and put the
-- model in the operator's hands.
--
-- compute_trust_score counted approved reports and nothing else:
--
--     if count >= 5 then score := least(50 + count * 8, 100)
--
-- Payment behaviour was never read. A company with six reports all saying
-- "لم يُسدَّد" and a company with six reports all saying "تم السداد" both scored
-- 98 — the same number, from the same formula, for opposite conduct. The score
-- is the product; a trust rating that cannot tell a defaulter from a payer is
-- not a rating of anything.
--
-- Nobody saw it because the demo data was written by a better formula.
-- seed-demo-data.mjs computed its own scores from on-time ratio, defaults and
-- average delay, then wrote them straight into trust_scores — so the screens
-- showed 95 for the company that pays and 20 for the one that does not, and the
-- function that would actually run in production never ran at all. Two models,
-- the good one visible and the broken one live.
--
-- The seed's model is the right one. This makes it the product's, and makes
-- every constant in it a setting rather than a literal, because each is a
-- business decision that will be argued about and changed and should not need a
-- migration each time.
--
-- Idempotent.

-- ============================================================================
-- 1) The model, as data
-- ============================================================================

insert into public.system_settings (key, value, description)
values (
  'trust_score_rules',
  jsonb_build_object(
    'thresholds', jsonb_build_object(
      'preliminary_min_reports', 2,   -- below this there is no score at all
      'full_min_reports',        5    -- at or above this the score is not "preliminary"
    ),
    'weights', jsonb_build_object(
      'base',                 50,     -- a company with an average record
      'on_time',              45,     -- full marks for paying every time
      'default',              40,     -- deducted in full if every deal defaulted
      'delay_penalty_cap',    20,     -- the most that lateness alone can cost
      'delay_days_per_point',  5      -- one point per this many days of average delay
    ),
    'clamp', jsonb_build_object('floor', 5, 'ceiling', 98),
    'bands', jsonb_build_object('low_min', 70, 'medium_min', 40)
  ),
  'معادلة درجة الثقة — تُقرأ عند كل احتساب، وتعديلها من لوحة الإدارة يسري بلا نشر'
)
on conflict (key) do update set
  description = excluded.description,
  updated_at = now();

-- ============================================================================
-- 2) The function, reading it
-- ============================================================================
-- coalesce at every step: a settings row edited into a shape this does not
-- expect must not stop scores being computed. The fallbacks are the seeded
-- values, so a malformed edit degrades to the intended model rather than to zero.

create or replace function public.compute_trust_score(p_company_id uuid)
returns void
language plpgsql
as $$
declare
  v_rules       jsonb;
  v_n           int;
  v_on_time     int;
  v_defaults    int;
  v_avg_delay   numeric;
  v_score       int;
  v_tier        varchar;
  v_risk_band   varchar;

  v_prelim_min  int;  v_full_min   int;
  v_base        numeric;  v_w_on_time numeric;  v_w_default numeric;
  v_delay_cap   numeric;  v_delay_div numeric;
  v_floor       int;  v_ceiling    int;
  v_low_min     int;  v_med_min    int;
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

  select count(*),
         count(*) filter (where payment_commitment = 'full'),
         count(*) filter (where defaulted),
         coalesce(avg(delay_days), 0)
    into v_n, v_on_time, v_defaults, v_avg_delay
    from public.reports
   where target_company_id = p_company_id and status = 'approved';

  if v_n < v_prelim_min then
    -- Not enough evidence to say anything. Zero here is not "bad", it is the
    -- absence of a rating, and the interface shows it as "بيانات غير كافية".
    v_score := 0;
    v_tier  := 'none';
  else
    v_score := greatest(v_floor, least(v_ceiling, round(
        v_base
      + (v_on_time::numeric  / v_n) * v_w_on_time
      - (v_defaults::numeric / v_n) * v_w_default
      - least(v_delay_cap, coalesce(v_avg_delay / v_delay_div, 0))
    )::int));
    v_tier := case when v_n >= v_full_min then 'full' else 'preliminary' end;
  end if;

  -- 'none', not 'unknown': the CHECK on this column allows low / medium / high /
  -- none, and inventing a fourth value here would fail every unrated company.
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
      'rules_applied',    coalesce(v_rules, '{}'::jsonb),
      'computed_at',      now()
    )
  )
  on conflict (company_id) do update set
    score            = excluded.score,
    risk_band        = excluded.risk_band,
    tier             = excluded.tier,
    approved_reports = excluded.approved_reports,
    breakdown        = excluded.breakdown,
    computed_at      = now();
end;
$$;

-- ============================================================================
-- 3) Recomputing after a rule change
-- ============================================================================
-- Editing the model without this leaves every existing score reflecting the old
-- one, so the panel would change what future scores mean while silently
-- disagreeing with every score already on screen.

create or replace function public.recompute_all_trust_scores()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  n integer := 0;
begin
  if public.get_current_user_id() is not null and not public.is_platform_admin() then
    raise exception 'إعادة احتساب الدرجات متاحة لإدارة المنصة فقط';
  end if;

  for r in select distinct target_company_id as id from public.reports where status = 'approved' loop
    perform public.compute_trust_score(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.recompute_all_trust_scores() from public;
grant execute on function public.recompute_all_trust_scores() to authenticated, service_role;

-- ============================================================================
-- 4) Apply it, and check the property that was broken
-- ============================================================================
-- Every score on the platform was produced either by the count-only function or
-- written directly by the seed. Both are wrong; recompute all of them.

do $$
declare
  n           int;
  worst_score int;
  best_score  int;
  worst_name  text;
  best_name   text;
begin
  select public.recompute_all_trust_scores() into n;

  -- The company whose reports say it never paid, and the one whose reports say
  -- it always did — among those with enough reports to be rated at all.
  select c.name, ts.score into worst_name, worst_score
    from public.trust_scores ts
    join public.companies c on c.id = ts.company_id
   where ts.tier <> 'none'
   order by ts.score asc limit 1;

  select c.name, ts.score into best_name, best_score
    from public.trust_scores ts
    join public.companies c on c.id = ts.company_id
   where ts.tier <> 'none'
   order by ts.score desc limit 1;

  raise notice 'أُعيد احتساب % شركة', n;
  raise notice 'الأدنى: % = %', worst_name, worst_score;
  raise notice 'الأعلى: % = %', best_name, best_score;

  if worst_score is not null and best_score is not null and worst_score >= best_score then
    raise exception 'الدرجات ما زالت لا تميّز السلوك (% مقابل %)', worst_score, best_score;
  end if;
end $$;
