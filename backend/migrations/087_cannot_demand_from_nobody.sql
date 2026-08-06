-- Migration: 087_cannot_demand_from_nobody.sql
-- Purpose: "طلب توضيح" on a company nobody owns freezes the file and tells no
--          one, because there is no one to tell.
--
-- ============================================================================
-- The state of the registry
-- ============================================================================
-- 31 approved companies. 3 are claimed by a tenant. 28 are not.
--
-- A clarification request is how Marsad asks a company for its remaining
-- documents. It creates the request, sets review_status to awaiting_documents,
-- and the screen then notifies the owning tenant — `if (t?.id)`. For 28 of 31
-- companies there is no t.id, so the notify is skipped silently, the request
-- sits open forever, and the roster reports the company as waiting on us to hear
-- back from it.
--
-- Nothing is stuck today: the one open request is against a company that is
-- owned. That is luck, not design — the path is open and says nothing.
--
-- A request that cannot be delivered is worse than a refusal, because it looks
-- like work in progress. So it is refused, and the message says what the actual
-- next step is: the company has to hold its record before it can be asked for
-- anything.
--
-- ============================================================================
-- What this does NOT fix
-- ============================================================================
-- Of those 28 unclaimed companies, 27 have no email, no phone and no website —
-- nothing to reach them by at all. They came from bulk import carrying a name
-- and a CR number. Refusing here makes that visible instead of hiding it behind
-- an open request; it does not create a way to contact them. That needs contact
-- details on the records first, and is a separate piece of work.

create or replace function public.request_clarification(
  p_company_id uuid,
  p_reason     text,
  p_details    text default null,
  p_type       text default 'information',
  p_documents  text[] default null,
  p_due_days   integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id    uuid;
  v_owner uuid;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return jsonb_build_object('ok', false, 'reason', 'طلب التوضيح لإدارة مرصد فقط');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'سبب طلب التوضيح مطلوب');
  end if;

  -- Nobody to ask, and nobody to answer.
  select t.id into v_owner from public.tenants t where t.company_id = p_company_id limit 1;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason',
      'لا أحد يملك هذا السجل — لا يصل الطلب لأحد. تُطالَب الشركة بالمستندات بعد أن تُسجّل وتستلم سجلّها.');
  end if;

  insert into public.clarification_requests
    (company_id, request_type, reason, details, documents_requested, due_at, requested_by)
  values
    (p_company_id, p_type, trim(p_reason), nullif(trim(coalesce(p_details, '')), ''),
     p_documents,
     case when p_due_days > 0 then now() + (p_due_days || ' days')::interval end,
     public.get_current_user_id())
  returning id into v_id;

  insert into public.clarification_messages (request_id, body)
  values (v_id, trim(p_reason) || coalesce(E'\n' || nullif(trim(coalesce(p_details, '')), ''), ''));

  -- The file stops here. This is the point of the whole request.
  update public.companies
     set review_status = case when p_type = 'documents'
                              then 'awaiting_documents' else 'clarification_needed' end,
         review_reason = trim(p_reason)
   where id = p_company_id;

  -- Returned so the caller does not have to look the tenant up again to notify
  -- it — and so a screen that forgets to notify is a visible omission rather
  -- than an `if` that quietly does nothing.
  return jsonb_build_object('ok', true, 'request_id', v_id, 'tenant_id', v_owner);
end $fn$;

-- ============================================================================
-- The roster says which records cannot be reached at all
-- ============================================================================
-- Unclaimed is already a filter. This is the sharper fact underneath it: not
-- merely that nobody has claimed the record, but that Marsad holds no way of
-- inviting anyone to. 27 of the 28 unclaimed companies are in that state, and
-- the panel has never shown it.
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
  status text, status_reason text, status_at timestamptz, status_by text,
  quality_issues text[]
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
    (select u.email from public.users u where u.id = co.status_by)::text,
    -- Correctness, not completeness. Exact-name duplicates only: the fuzzy pass
    -- is expensive and lives in company_duplicates, which is opened on purpose.
    (array_remove(array[
      case when co.cr_number !~ '^[0-9]{10}$' then 'cr_format' end,
      case when exists (select 1 from public.companies x
                         where x.id <> co.id and lower(trim(x.name)) = lower(trim(co.name)))
           then 'duplicate_name' end,
      case when co.approved and co.sector is null then 'no_sector' end,
      -- Not "no contact details" — "there is no way to ask this company for
      -- anything". Only meaningful while the record is unclaimed; once a tenant
      -- holds it, notifications reach them in the panel.
      case when co.approved
            and not exists (select 1 from public.tenants t where t.company_id = co.id)
            and co.official_email is null and co.phone is null and co.website is null
           then 'unreachable' end
    ], null))::text[]
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
-- Prove it refuses the undeliverable and still allows the deliverable
-- ============================================================================
create temporary table _087_before on commit drop as
  select c.id, c.review_status, c.review_reason
    from public.companies c
    join public.tenants t on t.company_id = c.id
   where c.approved limit 1;

do $blk$
declare
  v_admin text; v_owned uuid; v_orphan uuid; v_res jsonb; v_before text; v_n int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_owned from _087_before;
  select c.id into v_orphan from public.companies c
   where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
   limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 1) A company nobody owns cannot be asked.
  select review_status into v_before from public.companies where id = v_orphan;
  v_res := public.request_clarification(v_orphan, 'مستندات ناقصة', null, 'documents', null, 14);
  if (v_res->>'ok')::boolean then
    raise exception 'قُبل طلب توضيح لسجل بلا مالك';
  end if;

  -- and refusing means refusing: the file must not have been frozen anyway.
  select count(*) into v_n from public.companies
   where id = v_orphan and review_status is distinct from v_before;
  if v_n <> 0 then raise exception 'جُمّد الملف رغم رفض الطلب'; end if;
  select count(*) into v_n from public.clarification_requests where company_id = v_orphan;
  if v_n <> 0 then raise exception 'أُنشئ طلب رغم الرفض'; end if;

  -- 2) A company that is owned still works, and now says who to notify.
  v_res := public.request_clarification(v_owned, 'فحص المهاجرة 087', null, 'documents', null, 7);
  if not (v_res->>'ok')::boolean then
    raise exception 'رُفض طلب مشروع: %', v_res->>'reason';
  end if;
  if v_res->>'tenant_id' is null then
    raise exception 'الطلب لا يعيد الجهة التي تُبلَّغ';
  end if;

  -- 3) The roster names the records that cannot be reached at all.
  select count(*) into v_n from public.company_roster()
   where 'unreachable' = any (quality_issues);
  raise notice '% سجل لا سبيل للوصول إليه', v_n;

  raise notice '✅ لا يُطالَب من لا يمكن إبلاغه';
end $blk$;

-- Undo the one real request the check above created.
--
-- The state has to be put back with trg_guard_review_status held off for this
-- statement: the guard refuses to let a file leave awaiting_documents until the
-- documents arrive, which is exactly right for the workflow and exactly wrong
-- for undoing a state this migration invented thirty lines ago. It is re-enabled
-- immediately, inside the same transaction, so it is never off for real traffic.
delete from public.clarification_messages
 where request_id in (select id from public.clarification_requests
                       where reason = 'فحص المهاجرة 087');
delete from public.clarification_requests where reason = 'فحص المهاجرة 087';

alter table public.companies disable trigger trg_guard_review_status;
update public.companies c
   set review_status = b.review_status, review_reason = b.review_reason
  from _087_before b
 where c.id = b.id;
alter table public.companies enable trigger trg_guard_review_status;

do $blk$
declare v_bad int; v_off int;
begin
  select count(*) into v_bad from public.companies c join _087_before b on b.id = c.id
   where c.review_status is distinct from b.review_status
      or c.review_reason is distinct from b.review_reason;
  if v_bad > 0 then raise exception 'لم تُستعد حالة المراجعة بعد الفحص'; end if;

  -- And the guard is back on, which matters more than the restore.
  select count(*) into v_off from pg_trigger
   where tgrelid = 'public.companies'::regclass
     and tgname = 'trg_guard_review_status' and tgenabled = 'D';
  if v_off > 0 then raise exception 'حارس حالة المراجعة بقي معطّلاً'; end if;

  raise notice '✅ أُعيدت الحالة والحارس يعمل';
end $blk$;
