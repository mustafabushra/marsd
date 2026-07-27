-- Migration: 041_contribution_levers.sql
-- Purpose: close a hole 040 opened, and add the second lever.
--
-- 040 put reporting_suspended on tenants and stopped there. The RLS policy on
-- tenants lets a company administrator update their own tenant row — which is
-- correct for a company's name and contact details, and catastrophic for a
-- column that says whether Marsad has suspended them. A company could lift its
-- own suspension with one request.
--
-- This is the same lesson as the company profile in 026: RLS grants or refuses a
-- row, never a column. A row a company may legitimately edit will contain
-- columns it may not, and the only place that distinction can live is a trigger.
-- probe-contributor-control found it on its first run, which is the argument for
-- writing the probe before the button.
--
-- The second lever is the other half of the same problem. Reports damage a
-- competitor; junk company registrations farm Give-to-Get credits. Both are
-- abuses of contribution and both need stopping without closing an account, and
-- they are separate because a company doing one is usually not doing the other.
--
-- Idempotent.

-- ============================================================================
-- 1) Protect the columns Marsad owns
-- ============================================================================

alter table public.tenants
  add column if not exists company_add_suspended boolean not null default false,
  add column if not exists company_add_suspended_reason text,
  add column if not exists company_add_suspended_at timestamptz,
  add column if not exists company_add_suspended_by text;

comment on column public.tenants.company_add_suspended is
  'يمنع إضافة شركات جديدة للسجل — لمعالجة إغراق السجل بمدخلات وهمية';

create or replace function public.guard_tenant_admin_columns()
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

  -- Everything below is Marsad's word about this company. A company editing its
  -- own name is ordinary; a company editing whether it has been suspended is the
  -- suspension not existing.
  if new.reporting_suspended        is distinct from old.reporting_suspended
     or new.reporting_suspended_reason is distinct from old.reporting_suspended_reason
     or new.reporting_suspended_at  is distinct from old.reporting_suspended_at
     or new.reporting_suspended_by  is distinct from old.reporting_suspended_by
     or new.company_add_suspended   is distinct from old.company_add_suspended
     or new.company_add_suspended_reason is distinct from old.company_add_suspended_reason
     or new.company_add_suspended_at is distinct from old.company_add_suspended_at
     or new.company_add_suspended_by is distinct from old.company_add_suspended_by
     or new.status                  is distinct from old.status
     or new.company_id              is distinct from old.company_id
  then
    raise exception 'هذه الحقول من صلاحيات إدارة مرصد وحدها';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tenant_admin_columns_guard on public.tenants;
create trigger tenant_admin_columns_guard
  before update on public.tenants
  for each row execute function public.guard_tenant_admin_columns();

-- ============================================================================
-- 2) The second lever
-- ============================================================================

create or replace function public.guard_company_add_suspended()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant    uuid := public.get_current_tenant_id();
  v_suspended boolean;
  v_reason    text;
begin
  if public.get_current_user_id() is null or public.is_platform_admin() or v_tenant is null then
    return new;
  end if;

  select company_add_suspended, company_add_suspended_reason
    into v_suspended, v_reason
    from public.tenants where id = v_tenant;

  if coalesce(v_suspended, false) then
    raise exception 'أُوقفت إضافة الشركات من حسابك: %',
      coalesce(v_reason, 'راجع إدارة مرصد')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- companies carries no submitter column, so the check is on the caller's own
-- tenant rather than on anything in the row.
drop trigger if exists companies_add_suspended_guard on public.companies;
create trigger companies_add_suspended_guard
  before insert on public.companies
  for each row execute function public.guard_company_add_suspended();

-- ============================================================================
-- 3) Signals for the registration side
-- ============================================================================
-- A company flooding the registry to farm credits leaves a different trace from
-- one filing malicious reports: entries that are never approved, entries too
-- thin to be useful, and too many at once.

create or replace function public.registrar_risk(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_added      int;
  v_approved   int;
  v_rejected   int;
  v_thin       int;
  v_max_burst  int;
  v_flags      text[] := '{}';
  v_ids        uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'سجل المُسجِّل متاح لإدارة المنصة فقط';
  end if;

  select coalesce(array_agg(a.entity_id::uuid), '{}'), count(*)
    into v_ids, v_added
    from public.audit_logs a
   where a.action = 'company_add_requested' and a.tenant_id = p_tenant_id;

  select count(*) filter (where co.approved),
         count(*) filter (where not co.approved),
         -- Thin: fewer than half the identity fields a verified record needs.
         count(*) filter (where (
           (co.cr_number is not null)::int + (co.unified_number is not null)::int +
           (co.sector is not null)::int + (co.main_activity is not null)::int +
           (co.city is not null)::int + (co.official_email is not null)::int +
           (co.phone is not null)::int + (co.entity_type is not null)::int
         ) < 4)
    into v_approved, v_rejected, v_thin
    from public.companies co
   where co.id = any(v_ids);

  select coalesce(max(c), 0) into v_max_burst
    from (
      select count(*) as c from public.audit_logs a
       where a.action = 'company_add_requested' and a.tenant_id = p_tenant_id
       group by date_trunc('week', a.created_at)
    ) w;

  if v_added >= 3 and v_thin::numeric / nullif(v_added, 0) >= 0.5 then
    v_flags := v_flags || format('%s من %s شركة أضافتها ناقصة البيانات', v_thin, v_added);
  end if;
  if v_added >= 3 and v_rejected::numeric / nullif(v_added, 0) >= 0.5 then
    v_flags := v_flags || format('%s من %s لم تُعتمد', v_rejected, v_added);
  end if;
  if v_max_burst >= 10 then
    v_flags := v_flags || format('%s شركة في أسبوع واحد', v_max_burst);
  end if;

  return jsonb_build_object(
    'companies_added', v_added,
    'approved', v_approved,
    'not_approved', v_rejected,
    'thin_records', v_thin,
    'max_in_a_week', v_max_burst,
    'flags', to_jsonb(v_flags),
    'flag_count', coalesce(array_length(v_flags, 1), 0)
  );
end;
$$;

revoke all on function public.registrar_risk(uuid) from public;
grant execute on function public.registrar_risk(uuid) to authenticated, service_role;

-- ============================================================================
-- 4) Carry both levers in the overview
-- ============================================================================

-- The shape changes, and `create or replace` cannot change a return type.
-- Dropping first is safe here: nothing depends on it but the screen shipping in
-- the same commit.
drop function if exists public.contributors_overview();

create function public.contributors_overview()
returns table (
  tenant_id uuid, tenant_name text, cr_number text, sector text,
  reports_total integer, reports_approved integer, reports_rejected integer,
  reports_overturned integer, reject_rate integer,
  companies_added integer, companies_not_approved integer,
  reporting_suspended boolean, company_add_suspended boolean,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    t.id, t.name::text, t.cr_number::text, co.sector::text,
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id and r.status = 'approved'),
    (select count(*)::int from public.reports r where r.reporter_tenant_id = t.id and r.status = 'rejected'),
    (select count(*)::int from public.disputes d
       join public.reports r on r.id = d.report_id
      where r.reporter_tenant_id = t.id and d.status = 'upheld'),
    (select case when count(*) > 0
                 then round(count(*) filter (where r.status = 'rejected')::numeric / count(*) * 100)::int
                 else 0 end
       from public.reports r where r.reporter_tenant_id = t.id),
    (select count(*)::int from public.audit_logs a
      where a.action = 'company_add_requested' and a.tenant_id = t.id),
    (select count(*)::int from public.audit_logs a
       join public.companies c2 on c2.id::text = a.entity_id
      where a.action = 'company_add_requested' and a.tenant_id = t.id and not c2.approved),
    t.reporting_suspended,
    t.company_add_suspended,
    greatest(
      (select max(r.created_at) from public.reports r where r.reporter_tenant_id = t.id),
      (select max(a.created_at) from public.audit_logs a where a.tenant_id = t.id)
    )
  from public.tenants t
  left join public.companies co on co.id = t.company_id
  where public.is_platform_admin()
  order by
    (t.reporting_suspended or t.company_add_suspended) desc,
    (select count(*) from public.reports r where r.reporter_tenant_id = t.id) desc
$$;

revoke all on function public.contributors_overview() from public;
grant execute on function public.contributors_overview() to authenticated, service_role;

do $$
begin
  raise notice 'الأعمدة محميّة، ولإدارة مرصد مِقبضان: التقارير وتسجيل الشركات';
end $$;
