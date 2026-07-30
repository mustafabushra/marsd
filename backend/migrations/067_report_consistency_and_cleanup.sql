-- Migration: 067_report_consistency_and_cleanup.sql
-- Purpose: a report cannot say "لم يُسدَّد" in its category and "سُدِّد كاملاً" in
--          its payment field. Eight do, and they are inflating trust scores now.
--
-- ============================================================================
-- The fault
-- ============================================================================
-- On /trust-report/801289cb the page shows, at the same time:
--
--   نسبة السداد الكامل   100%
--   حالات عدم السداد     0
--   أسباب التقارير       عدم سداد 50%   ← three reports
--   المؤشر               92 · مخاطر منخفضة
--
-- Three reports are categorised no_payment and every one of them carries
-- payment_commitment = 'full' with defaulted = false.
--
-- This is not a display bug. compute_trust_score reads payment_commitment and
-- defaulted and ignores category entirely, so three reports describing
-- non-payment produce a perfect payment record and a community layer of 95. The
-- score is invertible by data the platform never checked.
--
-- The form allows both selections and objects to neither. Eight reports platform
-- wide are in this state.
--
-- ============================================================================
-- 1) Make the two fields agree
-- ============================================================================
-- The category is what the reporter says happened; payment_commitment is the
-- outcome. They are different questions, and most combinations are legitimate —
-- a quality complaint on an invoice that was paid in full is a real report. Only
-- the direct contradictions are refused: a category that asserts non-payment
-- beside a payment field that asserts payment.

alter table public.reports
  drop constraint if exists reports_category_payment_consistent;

alter table public.reports
  add constraint reports_category_payment_consistent check (
    not (
      category in ('no_payment', 'fraud')
      and payment_commitment = 'full'
      and coalesce(defaulted, false) = false
    )
  ) not valid;   -- not valid: existing rows are corrected below, in this same
                 -- transaction, and validated after.

-- ============================================================================
-- 2) Correct the rows that are already wrong
-- ============================================================================
-- The category is the reporter's account of the event and the richer statement;
-- payment_commitment was left at its form default. A report that says the money
-- never arrived is a default, so the outcome fields are brought into line with
-- what the reporter chose to call it — not the reverse, which would silently
-- rewrite eight people's testimony.

-- prevent_duplicate_reports_trigger fires on UPDATE as well as INSERT, so
-- correcting a field on an existing report is refused as a duplicate submission
-- of that report. That is a fault in its own right — the rule is about filing a
-- second report, not about editing one — and it is disabled for this correction
-- only, then restored. Fixing the trigger's own scope is left to its own change
-- rather than smuggled into this one.
alter table public.reports disable trigger prevent_duplicate_reports_trigger;

do $blk$
declare v_n int;
begin
  update public.reports
     set payment_commitment = 'default',
         defaulted = true
   where category in ('no_payment', 'fraud')
     and payment_commitment = 'full'
     and coalesce(defaulted, false) = false;
  get diagnostics v_n = row_count;
  raise notice 'تقارير صُحّحت من «سُدِّد كاملاً» إلى «لم يُسدَّد»: %', v_n;
end $blk$;

alter table public.reports enable trigger prevent_duplicate_reports_trigger;

alter table public.reports validate constraint reports_category_payment_consistent;

-- ============================================================================
-- 3) Junk in the sector list
-- ============================================================================
-- The source-mix section renders the reporters' own sectors, and one of them is
-- "تقيم" — a test value sitting among twenty real sectors. The section exists to
-- demonstrate that the evidence comes from independent sources, and a nonsense
-- label there makes it read as broken.
-- guard_company_profile_edit protects identity and verification columns from
-- edits made through a company's own dashboard. It fires here too, because a
-- trigger cannot tell a migration from a tenant. Disabled for these two
-- corrections and restored immediately after — the guard is right, its blind
-- spot is that maintenance looks like tampering.
alter table public.companies disable trigger company_profile_guard_trigger;

update public.companies
   set sector = null
 where sector is not null
   and (length(trim(sector)) < 4 or sector in ('تقيم', 'test', 'Test', 'تجربة', '-', '—'));

-- ============================================================================
-- 4) Verification must record who and when
-- ============================================================================
-- شركة الرياض carries verified = true with verified_at and verification_source
-- both null. The badge says "موثّقة من مرصد" and cannot say by whom or when,
-- which is the first question any audit asks. A claim with no provenance is not
-- a verification.
create or replace function public.guard_company_verification()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if coalesce(new.verified, false) and not coalesce(old.verified, false) then
    if new.verified_at is null then new.verified_at := now(); end if;
    if new.verification_source is null then
      new.verification_source := coalesce(public.get_current_user_role(), 'platform_admin');
    end if;
  end if;
  -- Un-verifying clears the provenance rather than leaving a stale date beside
  -- a badge that is no longer shown.
  if not coalesce(new.verified, false) and coalesce(old.verified, false) then
    new.verified_at := null;
    new.verification_source := null;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_guard_company_verification on public.companies;
create trigger trg_guard_company_verification
  before update on public.companies
  for each row execute function public.guard_company_verification();

-- Backfill what is already verified, marked as such rather than dated falsely.
update public.companies
   set verification_source = 'موثّقة قبل تسجيل المصدر'
 where verified and verification_source is null;

alter table public.companies enable trigger company_profile_guard_trigger;

-- ============================================================================
-- 5) A sector average of one company is not an average
-- ============================================================================
-- The same objection already applied to percentile rank, which is withheld below
-- 100 rated companies. The sector comparison was left showing "متوسط المقاولات
-- 55 · من 1 شركة" — a comparison against a single company, labelled as a sector.
create or replace function public.company_score_context(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sector     text;
  v_score      int;
  v_sector_avg numeric;
  v_sector_n   int;
  v_categories jsonb;
  v_n          int;
  v_reporters  int;
  v_disputes   jsonb;
  c_min_peers  constant int := 5;
begin
  if public.get_current_user_id() is null then
    return '{}'::jsonb;
  end if;

  select co.sector, ts.score into v_sector, v_score
    from public.companies co
    left join public.trust_scores ts on ts.company_id = co.id
   where co.id = p_company_id;
  if not found then return '{}'::jsonb; end if;

  select round(avg(ts.score)), count(*)
    into v_sector_avg, v_sector_n
    from public.trust_scores ts
    join public.companies co on co.id = ts.company_id
   where co.sector is not distinct from v_sector
     and ts.tier <> 'none' and ts.company_id <> p_company_id;

  -- Below the floor the average is returned as null with its count, so the
  -- screen can explain the absence instead of printing a misleading number.
  if coalesce(v_sector_n, 0) < c_min_peers then
    v_sector_avg := null;
  end if;

  select count(*), count(distinct reporter_tenant_id)
    into v_n, v_reporters
    from public.reports
   where target_company_id = p_company_id and status = 'approved';

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', n, 'pct', pct)
                            order by n desc), '[]'::jsonb)
    into v_categories
    from (
      select category, count(*) n,
             round(count(*) * 100.0 / nullif(sum(count(*)) over (), 0)) pct
        from public.reports
       where target_company_id = p_company_id
         and status = 'approved' and category is not null
       group by category) x;

  select jsonb_build_object(
           'total',    count(*),
           'upheld',   count(*) filter (where status = 'upheld'),
           'rejected', count(*) filter (where status = 'rejected'),
           'open',     count(*) filter (where status = 'open'))
    into v_disputes
    from public.disputes where company_id = p_company_id;

  return jsonb_build_object(
    'sector',            v_sector,
    'sector_avg',        v_sector_avg,
    'sector_count',      coalesce(v_sector_n, 0),
    'sector_min_peers',  c_min_peers,
    'vs_sector',         case when v_sector_avg is null or v_score is null
                              then null else v_score - v_sector_avg end,
    'categories',        v_categories,
    'approved_reports',  v_n,
    'distinct_reporters', v_reporters,
    'disputes',          v_disputes);
end $fn$;

revoke all on function public.company_score_context(uuid) from public, anon;
grant execute on function public.company_score_context(uuid) to authenticated;

-- ============================================================================
-- 6) Recompute — the corrected reports change real scores
-- ============================================================================
do $blk$
declare r record; v_n int := 0;
begin
  for r in select id from public.companies loop
    perform public.compute_trust_score(r.id);
    v_n := v_n + 1;
  end loop;
  raise notice 'أُعيد احتساب % شركة بعد التصحيح', v_n;
end $blk$;

-- ============================================================================
-- 7) Verify
-- ============================================================================
do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.reports
   where category in ('no_payment', 'fraud')
     and payment_commitment = 'full' and coalesce(defaulted, false) = false;
  if v_n > 0 then
    raise exception 'ما زال % تقريراً يقول «عدم سداد» و«سُدِّد كاملاً»', v_n;
  end if;

  select count(*) into v_n from public.companies where verified and verification_source is null;
  if v_n > 0 then
    raise exception '% شركة موثّقة بلا مصدر توثيق', v_n;
  end if;

  select count(*) into v_n from public.companies where sector = 'تقيم';
  if v_n > 0 then raise exception 'قيمة القطاع المغلوطة ما زالت موجودة'; end if;

  raise notice '✅ لا تناقض بين التصنيف والسداد · التوثيق مؤرَّخ · القطاعات نظيفة';
end $blk$;
