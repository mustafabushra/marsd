-- Migration: 074_company_roster.sql
-- Purpose: one row per company, carrying everything an administrator needs to
--          decide whether to chase it — in a single call.
--
-- The admin panel lists companies in several places and none of them answers the
-- question that is actually asked every day: which companies have given us their
-- data, and which are waiting on what. Answering it meant opening a company,
-- then its documents, then its audit log, and holding the result in your head
-- while you did the same for the next one.
--
-- Everything here is already stored. What was missing was one place to read it.

create or replace function public.company_roster()
returns table (
  company_id        uuid,
  name              text,
  cr_number         text,
  sector            text,
  city              text,
  source            text,
  approved          boolean,
  verified          boolean,
  review_status     text,
  review_reason     text,
  review_at         timestamptz,
  review_by         text,
  official_status   text,
  completeness      integer,
  docs_verified     integer,
  docs_pending      integer,
  open_clarifications integer,
  reports_about     integer,
  trust_score       integer,
  registrar         text,
  claimed_by        text,
  last_action       text,
  last_action_at    timestamptz,
  last_action_by    text,
  created_at        timestamptz
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
    co.created_at
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

do $blk$
declare v_admin text; v_n int; v_real int;
begin
  select id into v_admin from public.users where role='platform_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  select count(*) into v_n from public.company_roster();
  select count(*) into v_real from public.companies;
  if v_n <> v_real then
    raise exception 'السجلّ أعاد % والجدول فيه %', v_n, v_real;
  end if;

  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.company_roster();
  if v_n > 0 then raise exception 'السجلّ يُقرأ بلا جلسة'; end if;

  raise notice '✅ سجلّ الشركات: % شركة · مغلق أمام المجهول', v_real;
end $blk$;
