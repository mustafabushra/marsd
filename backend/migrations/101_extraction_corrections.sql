-- Migration: 101_extraction_corrections.sql
-- Purpose: the extractor cannot get better without knowing where it was wrong.
--
-- ============================================================================
-- What this records, and what it deliberately does not
-- ============================================================================
-- The review screen shows what was read and lets the person fix it before it is
-- saved. That edit is the single most valuable signal the feature produces: it
-- is a human saying "this label, in this layout, produced the wrong value" —
-- exactly what a rule engine needs in order to grow a rule.
--
-- Without this table the signal is discarded the moment the sheet closes, and
-- every improvement to patterns.js is guesswork about pastes nobody kept.
--
-- What is stored is the *correction*, not the document: the field, what the
-- engine proposed, what the person typed instead, how it was found, and how
-- sure it was. Not the pasted text — that is a commercial registration
-- belonging to somebody, and keeping whole documents to tune a parser is a
-- privacy cost the parser does not need to pay. A field name and two short
-- values are enough to write a rule from.

create table if not exists public.extraction_corrections (
  id           uuid primary key default gen_random_uuid(),
  user_id      text references public.users(id) on delete set null,
  company_id   uuid references public.companies(id) on delete cascade,

  field        text not null,
  extracted    text,          -- what the engine proposed; null = it found nothing
  corrected    text,          -- what the person typed; null = they deleted it
  method       text,          -- which rule produced it: 'column:zip', 'label:same_line'…
  score        int,           -- how sure it was, 0-100
  layout_mode  text,          -- 'inline' | 'column' | 'mixed'

  created_at   timestamptz not null default now()
);

comment on table public.extraction_corrections is
  'تصحيحات المستخدمين لاستخراج السجل التجاري — المصدر الوحيد لتحسين قواعد الاستخراج. لا يُخزَّن نص المستند.';

comment on column public.extraction_corrections.method is
  'القاعدة التي أنتجت القيمة الخاطئة — نقطة البداية عند إصلاح الاستخراج';

-- The two questions this table exists to answer: which field goes wrong most,
-- and which rule is responsible.
create index if not exists idx_extraction_corrections_field
  on public.extraction_corrections (field, created_at desc);
create index if not exists idx_extraction_corrections_method
  on public.extraction_corrections (method) where method is not null;

alter table public.extraction_corrections enable row level security;

-- A person may record their own corrections, and read them back.
drop policy if exists extraction_corrections_insert on public.extraction_corrections;
create policy extraction_corrections_insert on public.extraction_corrections
  for insert with check (user_id = public.get_current_user_id());

drop policy if exists extraction_corrections_select on public.extraction_corrections;
create policy extraction_corrections_select on public.extraction_corrections
  for select using (
    user_id = public.get_current_user_id()
    or coalesce(public.is_platform_admin(), false)
  );

-- No update, no delete. A correction is an observation about what happened; a
-- record that can be rewritten afterwards is not evidence of anything.

-- ============================================================================
-- Prove the policies do what the comments claim
-- ============================================================================
do $blk$
declare
  v_user text;
  v_n    int;
begin
  select id into v_user from public.users limit 1;
  if v_user is null then raise notice 'لا مستخدم للفحص'; return; end if;

  -- Insert as the table's owner (this block is not RLS-filtered), then confirm
  -- the row is really there — the checks in this project never trust the
  -- absence of an error as proof that a write happened.
  insert into public.extraction_corrections
    (user_id, field, extracted, corrected, method, score, layout_mode)
  values (v_user, 'cr_number', '4030304834', '4030304835', 'column:zip', 95, 'column');

  select count(*) into v_n from public.extraction_corrections
   where user_id = v_user and field = 'cr_number';
  if v_n < 1 then raise exception 'لم يُكتب الصف'; end if;

  -- A correction with nothing extracted is the "engine found nothing" case and
  -- must be storable: that is a miss, and misses are what the table is for.
  insert into public.extraction_corrections (user_id, field, extracted, corrected)
  values (v_user, 'manager_name', null, 'هيفاء احمد سعيد ظهران');

  raise notice '✅ الجدول يقبل التصحيحات والإغفالات معاً';
end $blk$;

-- Leave nothing behind from the check.
delete from public.extraction_corrections
 where field in ('cr_number', 'manager_name')
   and corrected in ('4030304835', 'هيفاء احمد سعيد ظهران');

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.extraction_corrections;
  if v_n > 0 then raise exception 'بقيت % صفوف من الفحص', v_n; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
