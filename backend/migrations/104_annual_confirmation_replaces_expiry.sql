-- Migration: 104_annual_confirmation_replaces_expiry.sql
-- Purpose: the Saudi commercial registration no longer expires, and the trust
--          score was still watching a date that will never be filled again.
--
-- ============================================================================
-- What changed in the registry, and what it broke here
-- ============================================================================
-- The new commercial registration law removed the expiry date from the
-- certificate. A registration is no longer renewed; instead the merchant
-- confirms its data every twelve months. Miss that confirmation by ninety days
-- and the registration is suspended; leave it a year after suspension and it
-- can be struck off.
--
-- The official trust layer still asks one question about currency:
--
--     if cr_expiry_date < current_date then  −30
--
-- On a registration issued under the new law `cr_expiry_date` is null, so that
-- line never fires. Every company added from now on would score as though its
-- registration were perfectly current — including one that stopped confirming
-- two years ago and is sitting suspended. The signal did not get weaker; it
-- disappeared, silently, while the number on the screen stayed the same.
--
-- ============================================================================
-- What replaces it
-- ============================================================================
-- `annual_confirmation_date` is a deadline, not a receipt: it is the date the
-- next confirmation is due. So the question is how far past it we are, and the
-- law already supplies the thresholds — 90 days to suspension, a further year
-- to being struck off. Three bands rather than one, because "eleven days late"
-- and "two years gone" are not the same fact about a business.
--
-- The expiry rule stays. Thirty-one companies already carry an expiry date from
-- the old certificates, and deleting the rule would quietly raise their scores
-- for no reason anyone could point at. Old data keeps its old meaning.

update public.system_settings
   set value = jsonb_set(
         value,
         '{layers,official}',
         (value -> 'layers' -> 'official')
           || jsonb_build_object(
                -- Past due, still inside the ninety-day grace. A lapse, not a
                -- failure — the registration is valid and the clock is running.
                'confirmation_overdue_penalty', 12,
                -- Past ninety days. The registry suspends at this point, so the
                -- registration is very likely not in good standing.
                'confirmation_suspended_penalty', 35,
                -- Past the year that follows suspension: eligible to be struck
                -- off. Weighted like a struck-off registration because that is
                -- what it is heading for.
                'confirmation_lapsed_penalty', 60,
                'confirmation_grace_days', 90
              ),
         true)
 where key = 'trust_score_rules';

-- ============================================================================
-- The official layer, with the currency question restored
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
  v_grace int;
  v_overdue int;
begin
  select value -> 'layers' -> 'official' into r
    from public.system_settings where key = 'trust_score_rules';

  select cr_status, verified, unified_number, national_address,
         cr_expiry_date, annual_confirmation_date
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

  -- Old certificates. Kept for the records that carry one.
  if c.cr_expiry_date is not null and c.cr_expiry_date < current_date then
    v := v - coalesce((r ->> 'expired_cr_penalty')::numeric, 30);
  end if;

  -- New certificates. A confirmation date in the future is a registration in
  -- good standing and costs nothing; only a missed deadline is a signal.
  if c.annual_confirmation_date is not null
     and c.annual_confirmation_date < current_date then
    v_grace   := coalesce((r ->> 'confirmation_grace_days')::int, 90);
    v_overdue := current_date - c.annual_confirmation_date;

    if v_overdue > v_grace + 365 then
      v := v - coalesce((r ->> 'confirmation_lapsed_penalty')::numeric, 60);
    elsif v_overdue > v_grace then
      v := v - coalesce((r ->> 'confirmation_suspended_penalty')::numeric, 35);
    else
      v := v - coalesce((r ->> 'confirmation_overdue_penalty')::numeric, 12);
    end if;
  end if;

  return greatest(0, least(100, v));
end $fn$;

-- ============================================================================
-- Prove the bands actually differ
-- ============================================================================
-- Written as a real company scored four times, because the thing being checked
-- is what the function returns, not what the SQL looks like.
do $blk$
declare
  v_id    uuid;
  v_none  numeric;
  v_late  numeric;
  v_susp  numeric;
  v_gone  numeric;
begin
  insert into public.companies (name, cr_number, cr_status, source, approved)
  values ('فحص التأكيد السنوي', 'CHECK-ANNUAL-CONF', 'active', 'community', false)
  returning id into v_id;

  -- Due next year: nothing owed.
  update public.companies set annual_confirmation_date = current_date + 200 where id = v_id;
  v_none := public.trust_layer_official(v_id);

  -- Thirty days late: inside the grace period.
  update public.companies set annual_confirmation_date = current_date - 30 where id = v_id;
  v_late := public.trust_layer_official(v_id);

  -- Six months late: past ninety days, so suspended.
  update public.companies set annual_confirmation_date = current_date - 180 where id = v_id;
  v_susp := public.trust_layer_official(v_id);

  -- Two years late: eligible to be struck off.
  update public.companies set annual_confirmation_date = current_date - 730 where id = v_id;
  v_gone := public.trust_layer_official(v_id);

  if not (v_none > v_late and v_late > v_susp and v_susp > v_gone) then
    raise exception 'النطاقات لا تتدرّج: مؤكَّد=% متأخر=% موقوف=% منتهٍ=%',
      v_none, v_late, v_susp, v_gone;
  end if;

  -- A future date must cost exactly nothing, or every healthy company loses
  -- points for being healthy.
  update public.companies set annual_confirmation_date = null where id = v_id;
  if public.trust_layer_official(v_id) <> v_none then
    raise exception 'تاريخ مستقبلي كلّف نقاطاً';
  end if;

  raise notice '✅ التدرّج يعمل: % ← % ← % ← %', v_none, v_late, v_susp, v_gone;

  delete from public.companies where id = v_id;
end $blk$;

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.companies where cr_number = 'CHECK-ANNUAL-CONF';
  if v_n > 0 then raise exception 'بقي صف فحص'; end if;

  -- And the old rule is still there for the records that need it.
  if (select value -> 'layers' -> 'official' ->> 'expired_cr_penalty'
        from public.system_settings where key = 'trust_score_rules') is null then
    raise exception 'حُذفت قاعدة انتهاء السجل القديمة';
  end if;

  raise notice '✅ لم يبقَ أثر، والقاعدة القديمة سليمة';
end $blk$;
