-- Migration: 170_the_model_stops_travelling_with_the_score.sql
--
-- نموذج الثقة كان يُنسَخ مع كل درجة إلى جدول يقرؤه كل مستخدم مسجَّل.
--
-- system_settings.trust_score_rules محميّ صحيحاً: SELECT عليه مقصور على
-- is_platform_admin(). لكن compute_trust_score كانت تكتب القواعد كاملةً في
-- trust_scores.breakdown.rules_applied، وسياسة ذلك الجدول USING (true) لكل
-- authenticated — لأن التقرير العلني يحتاج قراءة الدرجة.
--
-- فالقفل على الأول يفكّه النسخُ في الثاني. قِيس بانتحال صفة company_admin:
-- قرأ درجات شركتين أخريين ومعهما الأوزان والعقوبات والعتبات والـclamp —
-- bankruptcy_penalty و struck_off_penalty و verified_bonus و document_bonus.
-- أي أن الشركة تعرف تماماً كيف ترفع درجتها، وهي في منصّة رقابية دعوة صريحة
-- للتلاعب. ويكشف معها سلوك المنافسين: on_time و defaults و avg_delay_days.
--
-- التغيير سطر واحد: 'rules_applied' يخرج من jsonb_build_object. وكل ما عداه
-- يبقى — layers هي المنتَج نفسه ويقرؤها TrustReport، و approved_reports و
-- on_time و defaults و avg_delay_days و tier تصف الشركة لا النموذج.
--
-- والصفوف المخزَّنة تُنظَّف بعده: تعطيل الكتابة لا يمحو ما كُتب.

CREATE OR REPLACE FUNCTION public.compute_trust_score(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'computed_at',      now()))
  on conflict (company_id) do update
    set score = excluded.score, risk_band = excluded.risk_band, tier = excluded.tier,
        approved_reports = excluded.approved_reports, breakdown = excluded.breakdown,
        computed_at = now();
end $function$;

-- ما كُتب قبل هذه المهاجرة.
--
-- بلا إعادة احتساب: القيم نفسها صحيحة، والمكشوف هو المفتاح لا الدرجة. وعامل
-- الطرح على jsonb يحذف المفتاح إن وُجد ولا يشتكي إن لم يوجد.
update public.trust_scores
   set breakdown = breakdown - 'rules_applied'
 where breakdown ? 'rules_applied';

-- تحقّق: لا صفّ يحمل المفتاح، و layers سليمة، والدالة لا تعيد كتابته.
do $blk$
declare
  v_leak   int;
  v_layers int;
  v_co     uuid;
begin
  select count(*) into v_leak from public.trust_scores where breakdown ? 'rules_applied';
  if v_leak > 0 then
    raise exception 'بقي % صفّاً يحمل rules_applied', v_leak;
  end if;
  raise notice '✅ لا صفّ مخزَّن يحمل rules_applied';

  select count(*) into v_layers from public.trust_scores where breakdown ? 'layers';
  raise notice '   و % صفّاً يحتفظ بـ layers', v_layers;

  -- إعادة احتساب واحدة تثبت أن الدالة نفسها لم تعد تكتبه.
  select company_id into v_co from public.trust_scores limit 1;
  if v_co is not null then
    perform public.compute_trust_score(v_co);
    if exists (select 1 from public.trust_scores
                where company_id = v_co and breakdown ? 'rules_applied') then
      raise exception 'الدالة أعادت كتابة rules_applied بعد الاحتساب';
    end if;
    raise notice '✅ الاحتساب بعد التعديل لا يكتبه';
  end if;
end $blk$;

-- ---------------------------------------------------------------------------
-- العتبتان وحدهما، لمن يسأل عن تصنيف شركته
-- ---------------------------------------------------------------------------
-- «تقارير عن شركتك» تقول للشركة غير المصنَّفة أين هي بالضبط: «وصلك ١ من ٢».
-- كانت تقرأ العتبة من breakdown.rules_applied، وقد زال.
--
-- والعتبتان ليستا كبقية النموذج. عدد التقارير المعتمدة اللازم للتصنيف معلومة
-- عن الشركة نفسها لا عن كيفية التسجيل، ولا تُستغلّ: التقارير يعتمدها مرصد،
-- فلا تستطيع شركة تصنيعها. أما ما يُستغلّ — الأوزان والمكافآت والعقوبات —
-- فيبقى محجوباً.
--
-- دالة تُرجع مفتاحين اثنين، لا الكائن كلّه: توسيعها لاحقاً قرار يُتَّخذ عمداً
-- لا أثر جانبي لـ«أرجع القواعد».
create or replace function public.trust_rating_thresholds()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'preliminary_min_reports',
      coalesce((value -> 'thresholds' ->> 'preliminary_min_reports')::int, 2),
    'full_min_reports',
      coalesce((value -> 'thresholds' ->> 'full_min_reports')::int, 5))
    from public.system_settings
   where key = 'trust_score_rules';
$fn$;

revoke all on function public.trust_rating_thresholds() from anon, public;
grant execute on function public.trust_rating_thresholds() to authenticated;

do $blk$
declare v jsonb;
begin
  v := public.trust_rating_thresholds();
  if v is null or not (v ? 'preliminary_min_reports') then
    raise exception 'العتبات لم تُقرأ';
  end if;
  if v ? 'weights' or v ? 'layers' or v ? 'clamp' or v ? 'bands' then
    raise exception 'الدالة تُسرّب أكثر من العتبتين';
  end if;
  raise notice '✅ العتبتان فقط: %', v;
end $blk$;
