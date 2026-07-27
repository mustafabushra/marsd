-- Migration: 035_disputes.sql
-- Purpose: give a company a way to object to a report published about it.
--
-- Marsad publishes a reputation number about companies, assembled from what
-- their counterparties say. The subject of that number had no way to contest it.
-- /admin/disputes existed as a screen with invented rows and was not even
-- reachable from the navigation, so the only route a wronged company had was to
-- find someone at Marsad and ask.
--
-- This is not a feature in the ordinary sense. A platform that publishes an
-- adverse claim about a named business and offers no path to answer it is
-- exposed, and the company on the wrong end of a false report has no remedy
-- inside the product. It is the one thing on the list that ought to exist before
-- launch rather than after.
--
-- The rules that matter and are enforced here rather than described:
--   · only the company a report is about may dispute it, and only through an
--     administrator of that company
--   · only a published report can be disputed — one still under review is
--     already being examined
--   · one open dispute per report per company
--   · resolving is Marsad's alone, and upholding withdraws the report and
--     recomputes the score in the same transaction, so a withdrawn report can
--     never keep counting against the company
--
-- Idempotent.

-- ============================================================================
-- 1) The table
-- ============================================================================

create table if not exists public.disputes (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.reports(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  raised_by_tenant_id uuid not null references public.tenants(id) on delete cascade,
  raised_by_user_id   text not null,
  reason              text not null,
  evidence_url        text,
  status              varchar(20) not null default 'open'
                        check (status in ('open', 'upheld', 'rejected', 'withdrawn')),
  resolution_note     text,
  resolved_by         text,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.disputes is
  'اعتراض شركة على تقرير منشور عنها. الفصل فيه لإدارة مرصد وحدها.';

-- One open objection per report per company: a second is the same grievance,
-- and letting it through turns the queue into a way to apply pressure.
drop index if exists disputes_one_open;
create unique index disputes_one_open
  on public.disputes (report_id, raised_by_tenant_id)
  where status = 'open';

create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_report_idx on public.disputes (report_id);

-- ============================================================================
-- 2) Who may raise one, and against what
-- ============================================================================
-- RLS decides which rows; it cannot check that the report is about the company
-- raising the objection, or that the report was ever published. Both are the
-- substance of the rule, so both live in a trigger.

create or replace function public.guard_dispute_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_tenant_company uuid;
begin
  if public.get_current_user_id() is null then
    return new;   -- migrations and service role
  end if;

  select status, target_company_id into r from public.reports where id = new.report_id;
  if not found then
    raise exception 'التقرير غير موجود';
  end if;

  -- A report still in review is already being examined; disputing it would put
  -- the same claim in two queues at once.
  if r.status <> 'approved' then
    raise exception 'لا يمكن الاعتراض إلا على تقرير منشور';
  end if;

  if new.company_id is distinct from r.target_company_id then
    raise exception 'الاعتراض يجب أن يكون على الشركة المذكورة في التقرير';
  end if;

  select company_id into v_tenant_company
    from public.tenants where id = new.raised_by_tenant_id;

  -- The point of the whole feature: the objection comes from the subject of the
  -- report, not from anyone who dislikes it.
  if v_tenant_company is distinct from r.target_company_id then
    raise exception 'الاعتراض متاح للشركة المذكورة في التقرير فقط';
  end if;

  if length(coalesce(new.reason, '')) < 20 then
    raise exception 'يرجى بيان سبب الاعتراض بما لا يقل عن ٢٠ حرفاً';
  end if;

  -- Whatever the client sent for these, the record says what actually happened.
  new.raised_by_user_id := public.get_current_user_id();
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;
  return new;
end;
$$;

drop trigger if exists dispute_insert_guard on public.disputes;
create trigger dispute_insert_guard
  before insert on public.disputes
  for each row execute function public.guard_dispute_insert();

-- ============================================================================
-- 3) RLS
-- ============================================================================

alter table public.disputes enable row level security;

-- Both sides can see it. The company that filed the report is entitled to know
-- its claim is being challenged — a process that resolves without telling the
-- other party is not a process.
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated
  using (
    raised_by_tenant_id = public.get_current_tenant_id()
    or public.is_platform_admin()
    or exists (
      select 1 from public.reports r
       where r.id = disputes.report_id
         and r.reporter_tenant_id = public.get_current_tenant_id())
  );

drop policy if exists disputes_insert on public.disputes;
create policy disputes_insert on public.disputes
  for insert to authenticated
  with check (
    raised_by_tenant_id = public.get_current_tenant_id()
    and public.is_tenant_admin()
  );

-- Resolution is Marsad's. A company withdrawing its own open objection is the
-- one exception, and only to 'withdrawn' — enforced below, since a policy
-- cannot see which value is being written.
drop policy if exists disputes_update on public.disputes;
create policy disputes_update on public.disputes
  for update to authenticated
  using (
    public.is_platform_admin()
    or (raised_by_tenant_id = public.get_current_tenant_id() and public.is_tenant_admin() and status = 'open')
  )
  with check (
    public.is_platform_admin()
    or (raised_by_tenant_id = public.get_current_tenant_id() and public.is_tenant_admin())
  );

create or replace function public.guard_dispute_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_current_user_id() is null or public.is_platform_admin() then
    new.updated_at := now();
    return new;
  end if;

  -- Everything a company may do to its own objection: withdraw it.
  if new.status is distinct from old.status and new.status <> 'withdrawn' then
    raise exception 'الفصل في الاعتراض لإدارة مرصد وحدها';
  end if;
  if new.report_id is distinct from old.report_id
     or new.company_id is distinct from old.company_id
     or new.reason is distinct from old.reason then
    raise exception 'لا يمكن تعديل محتوى الاعتراض بعد تقديمه';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dispute_update_guard on public.disputes;
create trigger dispute_update_guard
  before update on public.disputes
  for each row execute function public.guard_dispute_update();

-- ============================================================================
-- 4) Resolving one
-- ============================================================================
-- Upholding must withdraw the report and recompute the score together. Doing it
-- in three client calls leaves a window where the objection is upheld and the
-- report still counts against the company — which is the exact harm the
-- objection was about.

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_upheld boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d record;
begin
  if not public.is_platform_admin() and public.get_current_user_id() is not null then
    raise exception 'الفصل في الاعتراض لإدارة مرصد وحدها';
  end if;

  select * into d from public.disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'الاعتراض غير موجود';
  end if;
  if d.status <> 'open' then
    raise exception 'سبق الفصل في هذا الاعتراض';
  end if;

  update public.disputes
     set status = case when p_upheld then 'upheld' else 'rejected' end,
         resolution_note = p_note,
         resolved_by = public.get_current_user_id(),
         resolved_at = now(),
         updated_at = now()
   where id = p_dispute_id;

  if p_upheld then
    -- The report comes down. 'rejected' rather than a new status: every screen
    -- and every count on the platform already understands that one, and a value
    -- nothing reads is a report that keeps appearing where it should not.
    update public.reports
       set status = 'rejected',
           rejected_at = now(),
           rejection_reason = coalesce(p_note, 'سُحب بعد قبول اعتراض الشركة'),
           updated_at = now()
     where id = d.report_id;

    -- In the same transaction: a withdrawn report must stop counting the moment
    -- it is withdrawn.
    perform public.compute_trust_score(d.company_id);
  end if;

  return jsonb_build_object(
    'dispute_id', d.id,
    'report_id', d.report_id,
    'company_id', d.company_id,
    'raised_by_tenant_id', d.raised_by_tenant_id,
    'upheld', p_upheld
  );
end;
$$;

revoke all on function public.resolve_dispute(uuid, boolean, text) from public;
grant execute on function public.resolve_dispute(uuid, boolean, text) to authenticated, service_role;

-- ============================================================================
-- 5) Realtime
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'disputes') then
    alter publication supabase_realtime add table public.disputes;
  end if;
end $$;
alter table public.disputes replica identity full;

do $$
begin
  raise notice 'disputes: جاهز — الاعتراض للشركة المذكورة، والفصل لمرصد';
end $$;
