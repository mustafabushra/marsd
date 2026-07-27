-- Migration: 036_audit_attribution.sql
-- Purpose: make every audit row say who did it and on whose behalf.
--
-- audit_logs is the only record of who acted, and most of it is anonymous:
--
--     company_approved       8 rows,  0 with a tenant
--     added_to_watchlist    13 rows,  0 with a tenant
--     removed_from_watchlist 16 rows, 0 with a tenant
--
-- Not because the information was unavailable — the session knew exactly who
-- was calling — but because each insert is written by hand at its call site, and
-- whether tenant_id is included depends on whether whoever wrote that screen
-- remembered. Some did. Most did not.
--
-- A trail that records the action and not the actor cannot answer the question
-- it exists for: a bad company record was approved, or a false report was filed,
-- and which company put it there. On a platform whose product is other
-- companies' reputations that is the question that eventually gets asked, and
-- it will be asked about rows written long before anyone thought to ask.
--
-- The session always knows. So the database fills it in, and the call sites stop
-- having to be trusted to.
--
-- Idempotent.

-- ============================================================================
-- 1) Fill in what the session knows
-- ============================================================================

create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Never overwrite. An admin acting on a company's behalf may legitimately
  -- record that company as the subject, and the screens that already pass a
  -- tenant_id are passing the right one.
  if new.actor_id is null then
    new.actor_id := public.get_current_user_id();
  end if;

  if new.tenant_id is null then
    new.tenant_id := public.get_current_tenant_id();
  end if;

  if new.created_at is null then
    new.created_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists audit_stamp_actor on public.audit_logs;
create trigger audit_stamp_actor
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_actor();

-- ============================================================================
-- 2) Who contributed a given company, and who contributed a given report
-- ============================================================================
-- reports names its reporter in a column. companies does not name a submitter at
-- all — the only trail is the audit row written when it was filed — so tracing a
-- bad entry means joining through audit_logs, which no screen should have to
-- know how to do.

create or replace function public.company_contributor(p_company_id uuid)
returns table (tenant_id uuid, tenant_name text, user_id text, contributed_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.tenant_id, t.name::text, a.actor_id, a.created_at
    from public.audit_logs a
    left join public.tenants t on t.id = a.tenant_id
   where a.action = 'company_add_requested'
     -- entity_id is text: audit rows point at companies, users and reports
     -- alike, and only some of those have uuid keys.
     and a.entity_id = p_company_id::text
     and public.is_platform_admin()
   order by a.created_at
   limit 1
$$;

revoke all on function public.company_contributor(uuid) from public;
grant execute on function public.company_contributor(uuid) to authenticated, service_role;

-- ============================================================================
-- 3) A company's whole footprint, for tracing an error back
-- ============================================================================
-- The question is never "who filed this one report" on its own. It is "this
-- entry is wrong — what else did they submit". Answering that by hand means four
-- queries across three tables.

create or replace function public.tenant_contribution_record(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'سجل مساهمات الشركات متاح لإدارة المنصة فقط';
  end if;

  select jsonb_build_object(
    'tenant', (select jsonb_build_object('id', t.id, 'name', t.name, 'cr_number', t.cr_number, 'status', t.status)
                 from public.tenants t where t.id = p_tenant_id),

    'reports', jsonb_build_object(
      'total',    (select count(*) from public.reports where reporter_tenant_id = p_tenant_id),
      'approved', (select count(*) from public.reports where reporter_tenant_id = p_tenant_id and status = 'approved'),
      'rejected', (select count(*) from public.reports where reporter_tenant_id = p_tenant_id and status = 'rejected'),
      'pending',  (select count(*) from public.reports where reporter_tenant_id = p_tenant_id and status = 'pending_review')
    ),

    -- Reports this company filed that were later withdrawn because the subject
    -- objected and Marsad agreed. The strongest signal there is that a
    -- contributor is filing claims that do not hold.
    'reports_overturned', (
      select count(*) from public.disputes d
        join public.reports r on r.id = d.report_id
       where r.reporter_tenant_id = p_tenant_id and d.status = 'upheld'),

    'companies_added', (
      select count(*) from public.audit_logs
       where action = 'company_add_requested' and tenant_id = p_tenant_id),

    'data_requests', (
      select count(*) from public.company_data_requests where requested_by_tenant_id = p_tenant_id),

    'credits_earned', (
      select coalesce(sum(amount), 0) from public.credits_ledger
       where tenant_id = p_tenant_id and amount > 0),

    'last_activity', (
      select max(created_at) from public.audit_logs where tenant_id = p_tenant_id)
  ) into v;

  return v;
end;
$$;

revoke all on function public.tenant_contribution_record(uuid) from public;
grant execute on function public.tenant_contribution_record(uuid) to authenticated, service_role;

-- ============================================================================
-- 4) Report on the gap that already exists
-- ============================================================================
-- The trigger fixes rows written from now on. Rows already written are anonymous
-- and cannot be repaired — the session that wrote them is gone. Saying so is
-- better than leaving someone to discover it during an investigation.

do $$
declare r record;
begin
  raise notice '—— صفوف تدقيق بلا كيان (سابقة لهذا الترحيل، لا يمكن استرجاعها) ——';
  for r in
    select action, count(*) filter (where tenant_id is null) as anon, count(*) as total
      from public.audit_logs
     group by action
    having count(*) filter (where tenant_id is null) > 0
     order by 2 desc
  loop
    raise notice '  %: % من %', r.action, r.anon, r.total;
  end loop;
end $$;
