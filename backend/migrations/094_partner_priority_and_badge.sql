-- Migration: 094_partner_priority_and_badge.sql
-- Purpose: the last two promises on /partners — priority in review, and the
--          badge — neither of which existed.
--
-- ============================================================================
-- The badge, and what it must not be mistaken for
-- ============================================================================
-- Marsad sells one number about a company. Putting "شريك مرصد" beside that
-- number risks reading as an endorsement — as though partnership bought a better
-- score. It does not, and cannot: the three layers of the score read the
-- company's own data, the reports filed about it, and its documents. Partnership
-- lives on the tenant's subscription and is not an input to any of them.
--
-- That is worth being explicit about rather than assuming the reader knows, so
-- the badge carries the disclaimer with it — the label is returned from here,
-- next to the flag, so the wording cannot drift from screen to screen.
--
-- A company is badged when the tenant that owns its record holds a running
-- partnership. Not the reporters about it — the company itself.

create or replace function public.company_partner_status(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select jsonb_build_object(
       'is_partner', true,
       'since', s.current_period_start,
       'label', 'شريك مرصد المعتمد',
       'note',  'شراكة في بناء السجل — لا تؤثر على مؤشر الثقة')
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id and p.code = 'partner'
       join public.tenants t on t.id = s.tenant_id
      where t.company_id = p_company_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
        and t.status = 'active'
      limit 1),
    jsonb_build_object('is_partner', false));
$fn$;

grant execute on function public.company_partner_status(uuid) to authenticated;
revoke all on function public.company_partner_status(uuid) from public, anon;

-- ============================================================================
-- Priority in review
-- ============================================================================
-- The review queue already loads contributors_overview to show each reporter's
-- record beside the approve button. Adding the flag there means the queue can
-- order by it without a second call and without a second definition of what a
-- partner is.
--
-- Priority is an ordering, not a shortcut: a partner's report is looked at
-- sooner and judged by exactly the same rules. Nothing here touches approval.
drop function if exists public.contributors_overview();

create function public.contributors_overview()
returns table (
  tenant_id uuid, tenant_name text, cr_number text, sector text,
  reports_total integer, reports_approved integer, reports_rejected integer,
  reports_overturned integer, reject_rate integer,
  companies_added integer, companies_not_approved integer,
  reporting_suspended boolean, company_add_suspended boolean,
  last_activity timestamptz,
  is_partner boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
    ),
    exists (
      select 1 from public.subscriptions s
        join public.plans p on p.id = s.plan_id and p.code = 'partner'
       where s.tenant_id = t.id and s.status = 'active'
         and (s.current_period_end is null or s.current_period_end > now()))
  from public.tenants t
  left join public.companies co on co.id = t.company_id
  where public.is_platform_admin()
  order by
    (t.reporting_suspended or t.company_add_suspended) desc,
    (select count(*) from public.reports r where r.reporter_tenant_id = t.id) desc;
$fn$;

grant execute on function public.contributors_overview() to authenticated;
revoke all on function public.contributors_overview() from public, anon;

-- ============================================================================
-- Prove both, and prove the badge is not an input to the score
-- ============================================================================
create temporary table _094_before on commit drop as
  select s.* from public.subscriptions s
   where s.tenant_id = (select u.tenant_id from public.users u
                         where u.role = 'company_admin' and u.tenant_id is not null limit 1);

do $blk$
declare
  v_admin text; v_tenant uuid; v_co uuid; v_badge jsonb;
  v_before int; v_after int; v_partner boolean;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select tenant_id into v_tenant from _094_before limit 1;
  if v_tenant is null then raise notice 'لا كيان للفحص'; return; end if;

  select company_id into v_co from public.tenants where id = v_tenant;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- Before: no badge, and the score as the current rules compute it.
  --
  -- Computed first on purpose. Reading trust_scores directly gave NULL for a
  -- company that has never been scored, and the comparison below then measured
  -- "no row became a row" rather than anything about partnership — which is how
  -- this check failed on its first run while the code under test was correct.
  -- Both sides must be produced the same way for the difference to mean what it
  -- claims.
  if v_co is not null then
    v_badge := public.company_partner_status(v_co);
    if (v_badge->>'is_partner')::boolean then
      raise exception 'الشارة ظاهرة قبل الشراكة';
    end if;
    perform public.compute_trust_score(v_co);
    select score into v_before from public.trust_scores where company_id = v_co;
  end if;

  perform public.grant_partnership(v_tenant, 'فحص المهاجرة 094', 12);

  -- The queue sees the partner.
  select is_partner into v_partner from public.contributors_overview() where tenant_id = v_tenant;
  if not coalesce(v_partner, false) then
    raise exception 'طابور المراجعة لا يرى الشريك';
  end if;

  if v_co is not null then
    v_badge := public.company_partner_status(v_co);
    if not (v_badge->>'is_partner')::boolean then
      raise exception 'الشارة لم تظهر بعد الشراكة';
    end if;
    if coalesce(v_badge->>'note', '') = '' then
      raise exception 'الشارة بلا توضيح أنها لا تؤثر على المؤشر';
    end if;

    -- The point of the disclaimer: recomputing the score with the partnership
    -- in place must produce the same number.
    perform public.compute_trust_score(v_co);
    select score into v_after from public.trust_scores where company_id = v_co;
    if v_after is distinct from v_before then
      raise exception 'الشراكة غيّرت مؤشر الثقة من % إلى % — الشارة تصبح كذباً', v_before, v_after;
    end if;
  end if;

  perform public.revoke_partnership(v_tenant, 'فحص المهاجرة 094');

  if v_co is not null then
    v_badge := public.company_partner_status(v_co);
    if (v_badge->>'is_partner')::boolean then
      raise exception 'الشارة بقيت بعد سحب الشراكة';
    end if;
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ الأولوية والشارة تعملان، والمؤشر لم يتحرّك';
end $blk$;

update public.subscriptions s
   set plan_id = b.plan_id, status = b.status,
       current_period_start = b.current_period_start,
       current_period_end = b.current_period_end,
       updated_at = now()
  from _094_before b
 where s.tenant_id = b.tenant_id;

delete from public.partner_applications where decision_reason like '%فحص المهاجرة 094%';

do $blk$
declare v_bad int;
begin
  select count(*) into v_bad from public.partner_applications;
  if v_bad > 0 then raise exception 'بقيت سجلات من الفحص'; end if;
  select count(*) into v_bad from public.subscriptions s
    join _094_before b on b.tenant_id = s.tenant_id
   where s.plan_id is distinct from b.plan_id or s.status is distinct from b.status;
  if v_bad > 0 then raise exception 'لم يُستعد الاشتراك'; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
