-- Migration: 062_three_layer_trust_score.sql
-- Purpose: build the three-layer trust score the platform has been describing
--          publicly — official data 30%, community 50%, platform analysis 20%.
--
-- ============================================================================
-- Why
-- ============================================================================
-- /faq has told every visitor: "مؤشر الثقة يُحسب من 3 طبقات: البيانات الرسمية
-- (30%)، بيانات المجتمع (50%)، وتحليل المنصة (20%). هذا يضمن تقييماً متوازناً
-- يصعب التلاعب به."
--
-- None of it existed. compute_trust_score read one table — approved reports —
-- and used three fields from it. Official registry data contributed nothing:
-- not cr_status, not the verification badge, not the expiry date. There was no
-- platform layer at all. The score was 100% community, published as 50%, under
-- a sentence promising it was hard to manipulate.
--
-- This builds what was promised. The community layer is the existing formula
-- unchanged, because it works and it is documented.
--
-- ============================================================================
-- The decision that shapes the official layer
-- ============================================================================
-- Of 27 companies, 27 have an active CR, 3 are verified, 7 carry a unified
-- number, 3 a national address, 1 an expiry date. If the official layer scored
-- completeness, almost every company would be marked down for facts Marsad has
-- not collected yet — a registry gap presented to customers as a risk signal.
--
-- So absence of information is not bad information. The layer starts from the
-- fact that an active commercial registration exists, adds for what is
-- confirmed, and subtracts only for what is confirmed wrong: a suspended
-- registration, an expired one. A company nobody has verified sits at neutral,
-- not at the bottom.

-- ============================================================================
-- 1) The model, as data
-- ============================================================================
update public.system_settings
   set value = value
     || jsonb_build_object('layers', jsonb_build_object(
          'official',  jsonb_build_object(
            'weight', 30,
            'base', 70,                    -- an active CR is itself a positive fact
            'verified_bonus', 20,          -- confirmed by Marsad
            'unified_number_bonus', 5,
            'national_address_bonus', 5,
            'inactive_cr_penalty', 50,     -- suspended or cancelled
            'expired_cr_penalty', 30),
          'community', jsonb_build_object(
            'weight', 50),                 -- the existing formula, untouched
          'platform',  jsonb_build_object(
            'weight', 20,
            'base', 60,
            'reporter_diversity_bonus', 25,-- distinct reporters ÷ reports
            'recency_bonus', 15,           -- share filed in the last 12 months
            'profile_completeness_bonus', 10)))
 where key = 'trust_score_rules';

-- ============================================================================
-- 2) The official layer
-- ============================================================================
create or replace function public.trust_layer_official(p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r jsonb;
  c record;
  v numeric;
begin
  select value -> 'layers' -> 'official' into r
    from public.system_settings where key = 'trust_score_rules';

  select cr_status, verified, unified_number, national_address, cr_expiry_date
    into c from public.companies where id = p_company_id;
  if not found then return null; end if;

  v := coalesce((r ->> 'base')::numeric, 70);

  if c.verified then
    v := v + coalesce((r ->> 'verified_bonus')::numeric, 20);
  end if;
  if c.unified_number is not null then
    v := v + coalesce((r ->> 'unified_number_bonus')::numeric, 5);
  end if;
  if c.national_address is not null then
    v := v + coalesce((r ->> 'national_address_bonus')::numeric, 5);
  end if;

  -- Only a registration that is known to be bad costs anything.
  if c.cr_status is not null and c.cr_status <> 'active' then
    v := v - coalesce((r ->> 'inactive_cr_penalty')::numeric, 50);
  end if;
  if c.cr_expiry_date is not null and c.cr_expiry_date < current_date then
    v := v - coalesce((r ->> 'expired_cr_penalty')::numeric, 30);
  end if;

  return greatest(0, least(100, v));
end $fn$;

-- ============================================================================
-- 3) The platform layer
-- ============================================================================
-- What Marsad itself can observe that is neither an official record nor an
-- opinion: how many different companies the evidence comes from, how recent it
-- is, and how complete the record is.
--
-- Reporter diversity is the one that answers the FAQ's own claim. Six reports
-- from one company is one company's view repeated; six from six is a pattern.
-- This is the layer that actually makes the score harder to manipulate.
create or replace function public.trust_layer_platform(p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r jsonb;
  v numeric;
  v_n int;
  v_distinct int;
  v_recent int;
  v_fields int;
  v_filled int;
  c record;
begin
  select value -> 'layers' -> 'platform' into r
    from public.system_settings where key = 'trust_score_rules';

  v := coalesce((r ->> 'base')::numeric, 60);

  select count(*), count(distinct reporter_tenant_id),
         count(*) filter (where created_at >= now() - interval '12 months')
    into v_n, v_distinct, v_recent
    from public.reports
   where target_company_id = p_company_id and status = 'approved';

  if v_n > 0 then
    v := v + (v_distinct::numeric / v_n) * coalesce((r ->> 'reporter_diversity_bonus')::numeric, 25);
    v := v + (v_recent::numeric   / v_n) * coalesce((r ->> 'recency_bonus')::numeric, 15);
  end if;

  -- How much of the record Marsad holds. Counted over fields a real company
  -- would have, not over every column in the table.
  select * into c from public.companies where id = p_company_id;
  v_fields := 8;
  v_filled :=
      (c.sector is not null)::int + (c.city is not null)::int
    + (c.main_activity is not null)::int + (c.entity_type is not null)::int
    + (c.phone is not null)::int + (c.official_email is not null)::int
    + (c.website is not null)::int
    + (coalesce(c.founding_date::text, c.founded_year::text) is not null)::int;

  v := v + (v_filled::numeric / v_fields)
         * coalesce((r ->> 'profile_completeness_bonus')::numeric, 10);

  return greatest(0, least(100, v));
end $fn$;

-- ============================================================================
-- 4) The score, from the three layers
-- ============================================================================
create or replace function public.compute_trust_score(p_company_id uuid)
returns void
language plpgsql
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
    -- Still no rating. The community layer is half the model, and official
    -- paperwork alone says nothing about whether a company pays — publishing a
    -- number built from the other two layers would be the manipulable score the
    -- FAQ promises this is not.
    v_score     := 0;
    v_tier      := 'none';
    v_community := null;
  else
    -- Unchanged. This is the formula that has been running and documented.
    v_community := greatest(v_floor, least(v_ceiling,
        v_base
      + (v_on_time::numeric  / v_n) * v_w_on_time
      - (v_defaults::numeric / v_n) * v_w_default
      - least(v_delay_cap, coalesce(v_avg_delay / v_delay_div, 0))));

    v_score := greatest(v_floor, least(100, round(
      (v_official * w_off + v_community * w_com + v_platform * w_plat) / w_sum
    )::int));

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
      -- Every layer, its weight and its contribution, so the trust report can
      -- show the reader the same arithmetic instead of a bare number.
      'layers', jsonb_build_object(
        'official',  jsonb_build_object('score', round(v_official),  'weight', w_off),
        'community', jsonb_build_object('score', round(v_community), 'weight', w_com),
        'platform',  jsonb_build_object('score', round(v_platform),  'weight', w_plat)),
      'rules_applied',    v_rules,
      'computed_at',      now())
  )
  -- computed_at, not updated_at: this table records when the score was worked
  -- out, and has no separate row-modified column.
  on conflict (company_id) do update
    set score = excluded.score, risk_band = excluded.risk_band, tier = excluded.tier,
        approved_reports = excluded.approved_reports, breakdown = excluded.breakdown,
        computed_at = now();
end $fn$;

-- ============================================================================
-- 5) Recompute, and show what moved
-- ============================================================================
do $blk$
declare
  r record;
  v_moved int := 0;
begin
  create temp table _before on commit drop as
    select company_id, score from public.trust_scores;

  for r in select id from public.companies loop
    perform public.compute_trust_score(r.id);
  end loop;

  for r in
    select co.name, b.score as was, ts.score as now,
           ts.breakdown -> 'layers' as layers
      from _before b
      join public.trust_scores ts on ts.company_id = b.company_id
      join public.companies co on co.id = b.company_id
     where b.score is distinct from ts.score
     order by abs(ts.score - b.score) desc
     limit 5
  loop
    v_moved := v_moved + 1;
    raise notice '% : % ← % · رسمية % · مجتمع % · منصّة %',
      r.name, r.now, r.was,
      r.layers -> 'official'  ->> 'score',
      r.layers -> 'community' ->> 'score',
      r.layers -> 'platform'  ->> 'score';
  end loop;

  raise notice 'شركات تغيّر مؤشرها (أعلى 5 معروضة): %', v_moved;
end $blk$;

-- ============================================================================
-- 6) Verify the arithmetic, not just that it ran
-- ============================================================================
do $blk$
declare
  r record;
  v_expected int;
begin
  select ts.score, ts.breakdown -> 'layers' as l into r
    from public.trust_scores ts
   where ts.tier <> 'none'
   limit 1;

  if r.score is null then
    raise notice 'لا شركة مصنّفة بعد — تعذّر التحقّق الحسابي';
    return;
  end if;

  v_expected := round((
      (r.l -> 'official'  ->> 'score')::numeric * (r.l -> 'official'  ->> 'weight')::numeric
    + (r.l -> 'community' ->> 'score')::numeric * (r.l -> 'community' ->> 'weight')::numeric
    + (r.l -> 'platform'  ->> 'score')::numeric * (r.l -> 'platform'  ->> 'weight')::numeric
  ) / 100);

  -- Rounding of each stored layer makes ±1 legitimate; more than that is a bug.
  if abs(r.score - v_expected) > 1 then
    raise exception 'المؤشر % لا يطابق مجموع الطبقات %', r.score, v_expected;
  end if;

  raise notice '✅ الطبقات الثلاث تُجمَع كما تُعرض — % ≈ %', r.score, v_expected;
end $blk$;
