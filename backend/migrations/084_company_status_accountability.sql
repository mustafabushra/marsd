-- Migration: 084_company_status_accountability.sql
-- Purpose: suspending a company is the harshest action in the panel and the
--          only one that records nothing.
--
-- ============================================================================
-- What suspension does today
-- ============================================================================
-- One click sets companies.status = 'suspended'. The company disappears from
-- search, and it is notified that its record was suspended — with no reason,
-- because none was ever asked for. Nothing stores who did it or when.
--
-- Every comparable state on the platform already requires a reason and is
-- enforced in the database, not in the screen: review_status since 073,
-- clarification requests since 070, document rejection since 065. Suspension is
-- the outlier, and it is the one with the largest effect on a business.
--
-- So: three columns, and a trigger that will not let the status change without
-- them. Enforced in the database because the screen is not the only way in.

alter table public.companies
  add column if not exists status_reason text,
  add column if not exists status_at     timestamptz,
  add column if not exists status_by     text;

comment on column public.companies.status_reason is
  'لماذا عُلِّق سجل الشركة — إلزامي عند التعليق، ويُعرض للشركة';

-- All 31 rows are 'active' today, so the constraint is safe to add as-is. The
-- three values are the ones the panel already renders.
do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_status_check') then
    alter table public.companies
      add constraint companies_status_check
      check (status is null or status in ('active', 'suspended', 'pending'));
  end if;
end $blk$;

-- ============================================================================
-- The status cannot move without a reason and a name attached
-- ============================================================================
create or replace function public.guard_company_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- guard_company_profile_edit already refuses a status change from anyone but
  -- an admin. Repeated here because that guard is about the company panel, and
  -- this one is about the column no matter who writes to it.
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'تغيير حالة الشركة من صلاحيات إدارة مرصد';
  end if;

  if new.status = 'suspended' and coalesce(trim(new.status_reason), '') = '' then
    raise exception 'التعليق يحتاج سبباً — يُعرض للشركة';
  end if;

  -- Reactivating clears the reason: leaving it would show an active company a
  -- suspension notice. The history stays in company_audit_log.
  if new.status <> 'suspended' then
    new.status_reason := null;
  end if;

  new.status_at := now();
  new.status_by := public.get_current_user_id();
  return new;
end $fn$;

drop trigger if exists trg_guard_company_status on public.companies;
create trigger trg_guard_company_status
  before update on public.companies
  for each row execute function public.guard_company_status();

-- ============================================================================
-- company_roster carries the account state too
-- ============================================================================
-- إدارة الشركات reads this same function rather than running its own thinner
-- query on companies. Two screens asking two different questions of one source
-- cannot disagree about the answer; two queries eventually do.
--
-- Adding columns to a returns-table needs DROP first. 081 did that and handed
-- the function back to anon, because Supabase's default privileges grant EXECUTE
-- on anything new in public — so the revoke below is not optional.
drop function if exists public.company_roster();

create function public.company_roster()
returns table (
  company_id uuid, name text, cr_number text, sector text, city text,
  source text, approved boolean, verified boolean,
  review_status text, review_reason text, review_at timestamptz, review_by text,
  official_status text, completeness integer,
  docs_verified integer, docs_pending integer,
  open_clarifications integer, reports_about integer, trust_score integer,
  registrar text, claimed_by text,
  last_action text, last_action_at timestamptz, last_action_by text,
  created_at timestamptz,
  status text, status_reason text, status_at timestamptz, status_by text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    co.id,
    co.name::text,
    co.cr_number::text,
    co.sector::text,
    co.city::text,
    co.source::text,
    co.approved,
    coalesce(co.verified, false),
    coalesce(co.review_status, 'approved')::text,
    co.review_reason,
    co.review_status_at,
    (select u.email from public.users u where u.id = co.review_status_by)::text,
    coalesce(co.official_status, 'none')::text,
    -- The same eight fields the platform layer of the trust score counts, so the
    -- number here and the number in the report cannot disagree.
    (round((
        (co.sector is not null)::int + (co.city is not null)::int
      + (co.main_activity is not null)::int + (co.entity_type is not null)::int
      + (co.phone is not null)::int + (co.official_email is not null)::int
      + (co.website is not null)::int
      + (coalesce(co.founding_date::text, co.founded_year::text) is not null)::int
    ) * 100.0 / 8))::int,
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'verified'),
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'pending'),
    (select count(*)::int from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open'),
    (select count(*)::int from public.reports r
      where r.target_company_id = co.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = co.id),
    -- Who put this company in the registry. companies carries no submitter, so
    -- it is the audit entry written when it was filed — the same derivation the
    -- approval queue and the credit award both use.
    (select t.name from public.audit_logs al
       join public.tenants t on t.id = al.tenant_id
      where al.action = 'company_add_requested' and al.entity_id = co.id::text
      order by al.created_at asc limit 1)::text,
    -- And who owns it now, if anyone claimed it.
    (select t.name from public.tenants t where t.company_id = co.id limit 1)::text,
    (select l.action from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    (select l.created_at from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1),
    (select u.email from public.company_audit_log l
       left join public.users u on u.id = l.actor_id
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    co.created_at,
    coalesce(co.status, 'active')::text,
    co.status_reason,
    co.status_at,
    (select u.email from public.users u where u.id = co.status_by)::text
  from public.companies co
  where coalesce(public.is_platform_admin() or public.is_reviewer(), false)
  order by
    -- What needs attention first: open questions, then pending documents, then
    -- anything not yet approved, then the rest by age.
    (select count(*) from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open') desc,
    (select count(*) from public.company_documents d
      where d.company_id = co.id and d.status = 'pending') desc,
    (co.review_status = 'approved'),
    co.created_at desc;
$fn$;

grant execute on function public.company_roster() to authenticated;
revoke all on function public.company_roster() from public, anon;

-- ============================================================================
-- Prove it: the reason is required, the stamp is automatic, anon is out
-- ============================================================================
do $blk$
declare
  v_admin text; v_co uuid; v_n int; v_raised boolean; v_row record;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_co from public.companies where coalesce(status,'active') = 'active' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 1) Suspending with no reason must fail.
  v_raised := false;
  begin
    update public.companies set status = 'suspended' where id = v_co;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'قُبل التعليق بلا سبب';
  end if;

  -- 2) With a reason it goes through, and stamps itself.
  update public.companies
     set status = 'suspended', status_reason = 'فحص المهاجرة 084'
   where id = v_co;

  select status, status_reason, status_at, status_by into v_row
    from public.companies where id = v_co;
  if v_row.status <> 'suspended' or v_row.status_at is null or v_row.status_by is null then
    raise exception 'التعليق لم يُختم بمن ومتى';
  end if;

  -- 3) Reactivating clears the reason so an active company shows no notice.
  update public.companies set status = 'active' where id = v_co;
  select status_reason into v_row from public.companies where id = v_co;
  if v_row.status_reason is not null then
    raise exception 'سبب التعليق بقي بعد إعادة التفعيل';
  end if;

  -- 4) The roster still answers, and now carries the account state.
  select count(*) into v_n from public.company_roster();
  if v_n = 0 then
    raise exception 'company_roster فارغة بعد إعادة بنائها';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.company_roster();
  if v_n > 0 then
    raise exception 'company_roster تُجيب بلا جلسة';
  end if;

  raise notice '✅ التعليق يحتاج سبباً ويُختم · والسجلّ يحمل الحالة';
end $blk$;
