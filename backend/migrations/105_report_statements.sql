-- Migration: 105_report_statements.sql
-- Purpose: keep the structure of a report, not only its prose.
--
-- ============================================================================
-- What changes and what does not
-- ============================================================================
-- The report form stops asking people to write a title and a description, and
-- starts asking them to choose a title and tick the facts that apply. Both of
-- those already have somewhere to go — `title` and `description` — and both
-- keep receiving readable Arabic, so the company page, the admin queue and the
-- full report need no change at all.
--
-- What is new is `detail_codes`: the machine-readable form of what was ticked.
--
-- Storing only the sentence would repeat the mistake this is meant to fix.
-- «التأخير أكثر من 90 يوماً» as text cannot be counted, filtered, or weighed —
-- and counting is the whole reason for asking in a list. `delay_over_90` can.
--
-- Nothing reads these codes yet. That is deliberate: the community layer of the
-- trust score currently weighs a report by its category and its ratings, and
-- changing how the score is computed is a separate decision from starting to
-- record what it would need. This migration collects the evidence; whether the
-- score should use it is a question for whoever decides what a score means.

alter table public.reports
  add column if not exists detail_codes text[];

comment on column public.reports.detail_codes is
  'العبارات المختارة في التقرير كرموز — النسخة القابلة للعد من نص الوصف. مثال: {delay_over_90,work_delivered}';

-- Reports are read by category far more often than by detail, so the index is
-- on the pair: "every late-payment report where the delay passed 90 days" is
-- the question this column exists to answer.
create index if not exists idx_reports_detail_codes
  on public.reports using gin (detail_codes)
  where detail_codes is not null;

-- ============================================================================
-- Prove it holds what it claims to
-- ============================================================================
do $blk$
declare
  v_id      uuid;
  v_company uuid;
  v_tenant  uuid;
  v_codes   text[];
  v_desc    text;
begin
  select id into v_company from public.companies limit 1;
  select id into v_tenant from public.tenants limit 1;
  if v_company is null or v_tenant is null then
    raise notice 'لا بيانات كافية للفحص';
    return;
  end if;

  insert into public.reports
    (target_company_id, reporter_tenant_id, dealt_at, report_type, category,
     title, description, detail_codes, status)
  values (
    v_company, v_tenant, now(), 'transaction', 'late_payment',
    'تأخر في سداد المستحقات عن الموعد المتفق عليه',
    E'• التأخير أكثر من 90 يوماً\n• سدّد المبلغ في النهاية',
    array['delay_over_90', 'paid_eventually'],
    'pending_review')
  returning id into v_id;

  -- Read it back. A write that returned no error is not a write that happened.
  select detail_codes, description into v_codes, v_desc
    from public.reports where id = v_id;

  if v_codes is null or array_length(v_codes, 1) <> 2 then
    raise exception 'الرموز لم تُحفظ: %', v_codes;
  end if;
  if v_desc not like '%90 يوماً%' then
    raise exception 'الوصف النصّي لم يُحفظ';
  end if;

  -- The point of the array type: this has to be answerable.
  if not exists (
    select 1 from public.reports
     where id = v_id and detail_codes @> array['delay_over_90']) then
    raise exception 'لا يمكن الاستعلام عن الرموز';
  end if;

  raise notice '✅ الرموز تُحفظ وتُستعلَم، والوصف النصّي باقٍ كما هو';

  delete from public.reports where id = v_id;
end $blk$;

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.reports
   where title = 'تأخر في سداد المستحقات عن الموعد المتفق عليه'
     and status = 'pending_review';
  if v_n > 0 then raise exception 'بقي % تقرير فحص', v_n; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
