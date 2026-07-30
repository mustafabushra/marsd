-- Migration: 065_trust_score_history.sql
-- Purpose: keep the trust score's past, so a report can show direction and not
--          only position.
--
-- ============================================================================
-- Why
-- ============================================================================
-- trust_scores has a unique index on company_id: one row per company, and every
-- recomputation overwrites the last. The platform has therefore never known what
-- any company's score was yesterday.
--
-- That is the most useful line a credit report has. A company climbing to 92 is
-- a different counterparty from one falling to it, and today they render
-- identically — same number, same green pill, no way to tell them apart. The
-- direction often matters more than the level: 65 rising is a business fixing
-- itself, 92 falling is one that has started to slip and has not been caught yet.
--
-- ============================================================================
-- What gets recorded
-- ============================================================================
-- Only movements. compute_trust_score runs on every approval, every dispute
-- resolution, and every rules change, and most of those leave the number where
-- it was — recording all of them would bury three real changes under three
-- hundred identical rows and make the chart unreadable.
--
-- The layer breakdown travels with each point, so a drop can be attributed:
-- a fall driven by the official layer is an expired registration, one driven by
-- the community layer is behaviour.

create table if not exists public.trust_score_history (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  score            integer not null,
  risk_band        varchar(20),
  tier             varchar(20),
  approved_reports integer,
  layers           jsonb,
  recorded_at      timestamptz not null default now()
);

comment on table public.trust_score_history is
  'تاريخ مؤشر الثقة — نقطة عند كل تغيّر فعلي في الرقم، لعرض الاتجاه لا الموضع فقط';

create index if not exists idx_tsh_company_time
  on public.trust_score_history (company_id, recorded_at desc);

alter table public.trust_score_history enable row level security;

-- The history says no more than the current score does, and the registry it
-- belongs to already requires an account.
drop policy if exists tsh_select on public.trust_score_history;
create policy tsh_select on public.trust_score_history
  for select to authenticated using (true);

-- Written by the trigger only. No policy for insert, update or delete: a company
-- that could edit its own score history could edit its own past.

-- ============================================================================
-- The trigger
-- ============================================================================
create or replace function public.record_trust_score_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- A recomputation that lands on the same number is not a movement.
  if tg_op = 'UPDATE' and new.score is not distinct from old.score then
    return new;
  end if;

  insert into public.trust_score_history
    (company_id, score, risk_band, tier, approved_reports, layers)
  values
    (new.company_id, new.score, new.risk_band, new.tier, new.approved_reports,
     new.breakdown -> 'layers');

  return new;
end $fn$;

drop trigger if exists trg_record_trust_score_change on public.trust_scores;
create trigger trg_record_trust_score_change
  after insert or update on public.trust_scores
  for each row execute function public.record_trust_score_change();

-- ============================================================================
-- The first point
-- ============================================================================
-- Without a seed the chart is empty until a score happens to move, which for a
-- settled company could be months. Each company's current score becomes its
-- first recorded point, stamped when it was computed rather than now — dating it
-- today would claim a measurement that was not taken today.
insert into public.trust_score_history
  (company_id, score, risk_band, tier, approved_reports, layers, recorded_at)
select ts.company_id, ts.score, ts.risk_band, ts.tier, ts.approved_reports,
       ts.breakdown -> 'layers', coalesce(ts.computed_at, now())
  from public.trust_scores ts
 where not exists (
   select 1 from public.trust_score_history h where h.company_id = ts.company_id);

-- ============================================================================
-- Reading it
-- ============================================================================
create or replace function public.company_score_history(
  p_company_id uuid,
  p_limit      integer default 24
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if public.get_current_user_id() is null then
    return '[]'::jsonb;
  end if;

  -- Oldest first, so the caller plots it left to right without re-sorting; the
  -- limit takes the most recent, which is why the ordering is reversed twice.
  select coalesce(jsonb_agg(x order by x.recorded_at), '[]'::jsonb) into v
    from (
      select score, risk_band, tier, approved_reports, layers, recorded_at
        from public.trust_score_history
       where company_id = p_company_id
       order by recorded_at desc
       limit greatest(1, least(p_limit, 100))) x;

  return v;
end $fn$;

revoke all on function public.company_score_history(uuid, integer) from public, anon;
grant execute on function public.company_score_history(uuid, integer) to authenticated;

-- ============================================================================
-- Verify by moving a score and reading the history back
-- ============================================================================
do $blk$
declare
  v_admin  text;
  v_co     uuid;
  v_before int;
  v_after  int;
  v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select company_id into v_co from public.trust_scores where tier <> 'none' limit 1;

  select count(*) into v_before from public.trust_score_history where company_id = v_co;
  if v_before = 0 then
    raise exception 'التعبئة الأولى لم تكتب أي نقطة';
  end if;

  -- Move it, and confirm a point was recorded; then move it back.
  update public.trust_scores set score = score - 7 where company_id = v_co;
  select count(*) into v_after from public.trust_score_history where company_id = v_co;
  if v_after <> v_before + 1 then
    raise exception 'تغيّر المؤشر ولم تُسجَّل نقطة (% ← %)', v_before, v_after;
  end if;

  -- And an unchanged recomputation must add nothing.
  update public.trust_scores set risk_band = risk_band where company_id = v_co;
  select count(*) into v_after from public.trust_score_history where company_id = v_co;
  if v_after <> v_before + 1 then
    raise exception 'سُجّلت نقطة بلا تغيّر في الرقم';
  end if;

  -- Undo the probe entirely.
  delete from public.trust_score_history
   where company_id = v_co
     and id not in (select id from public.trust_score_history
                     where company_id = v_co order by recorded_at asc limit v_before);
  perform public.compute_trust_score(v_co);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v := public.company_score_history(v_co, 24);
  if jsonb_array_length(v) = 0 then
    raise exception 'الدالة لا تُرجع تاريخاً لمستخدم مسجَّل';
  end if;

  perform set_config('request.jwt.claims', '', true);
  if public.company_score_history(v_co, 24) <> '[]'::jsonb then
    raise exception 'التاريخ يُقرأ بلا جلسة';
  end if;

  raise notice '✅ التاريخ يُسجَّل عند التغيّر فقط · % نقطة · مغلق أمام المجهول',
    jsonb_array_length(v);
end $blk$;
