-- A company file tells three different stories
-- ============================================================================
--
-- Disputes, the audit log, and the timeline are three questions, not three
-- views of one:
--
--   الاعتراضات    ما الذي طُعن فيه، وأين وصل الطعن؟
--   سجلّ التدقيق   من غيّر أي حقل، ومن أي قيمة إلى أي قيمة، ولماذا؟
--   الخطّ الزمني   ماذا حدث لهذه الشركة؟
--
-- The last two are the ones that get merged by mistake. An audit log is raw on
-- purpose — it exists to answer an investigation, and rewriting `pending →
-- approved` into «تم اعتماد الشركة» destroys the only thing it is for. A
-- timeline is the opposite: it is the story, and a reader should never see a
-- column name in it.
--
-- Three functions, because they are three answers.

-- ============================================================================
-- Disputes
-- ============================================================================

create or replace function public.admin_company_disputes(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb;
begin
  if not coalesce(public.has_permission('companies.view'), false) then
    raise exception 'ملفّ الشركة لإدارة مرصد';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'open',     count(*) filter (where d.status = 'open'),
      'upheld',   count(*) filter (where d.status = 'upheld'),
      'rejected', count(*) filter (where d.status = 'rejected'),
      'withdrawn',count(*) filter (where d.status = 'withdrawn'),
      'total',    count(*)),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'status', d.status,
      'status_label', case d.status
        when 'open' then 'مفتوح' when 'upheld' then 'قُبل الاعتراض'
        when 'rejected' then 'رُفض الاعتراض' when 'withdrawn' then 'سُحب'
        else d.status end,
      'reason', d.reason,
      'evidence_url', d.evidence_url,
      'resolution_note', d.resolution_note,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'resolved_at', d.resolved_at,
      'resolved_by', (select u.email::text from public.users u where u.id = d.resolved_by),
      'raised_by', (select t.name::text from public.tenants t where t.id = d.raised_by_tenant_id),
      'report_id', d.report_id,
      'report_title', (select r.title::text from public.reports r where r.id = d.report_id)
    ) order by
      -- Open first: an unresolved objection is the one somebody has to act on,
      -- and burying it under last year's resolved ones is how it waits.
      case when d.status = 'open' then 0 else 1 end, d.created_at desc
    ) filter (where d.id is not null), '[]'::jsonb)
  ) into v
    from public.disputes d
   where d.company_id = p_company_id
      or d.report_id in (select r.id from public.reports r where r.target_company_id = p_company_id);

  return coalesce(v, jsonb_build_object(
    'summary', jsonb_build_object('open', 0, 'upheld', 0, 'rejected', 0, 'withdrawn', 0, 'total', 0),
    'items', '[]'::jsonb));
end;
$fn$;

-- ============================================================================
-- The audit log, raw
-- ============================================================================
-- Field by field, old value beside new. The Arabic labels the screen shows are
-- for the action and the column name; the values themselves are returned
-- untouched, because a value that has been prettied up is a value that cannot
-- be used as evidence.

create or replace function public.admin_company_audit(
  p_company_id uuid,
  p_limit      int default 50,
  p_offset     int default 0
)
returns table (
  id          uuid,
  at          timestamptz,
  actor       text,
  actor_role  text,
  action      text,
  action_ar   text,
  changes     jsonb,
  reason      text,
  total       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('audit.view'), false) then
    raise exception 'سجلّ التدقيق يحتاج صلاحية';
  end if;

  return query
  with rows_ as (
    select l.*, count(*) over () as n
      from public.company_audit_log l
     where l.company_id = p_company_id
     order by l.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select r.id, r.created_at,
         coalesce(u.email::text, case when r.actor_id is null then 'النظام' end),
         u.role::text,
         r.action::text,
         case r.action
           when 'created'               then 'أُنشئت الشركة'
           when 'updated'               then 'تعديل بيانات'
           when 'status_changed'        then 'تغيير حالة الشركة'
           when 'review_status_changed' then 'تغيير حالة المراجعة'
           when 'approved'              then 'اعتماد'
           when 'unapproved'            then 'إلغاء اعتماد'
           else r.action::text end,
         -- One row per field that actually moved. `old_values` and
         -- `new_values` carry whatever the trigger wrote; only the keys that
         -- differ are interesting, and listing the rest is noise that hides
         -- the change somebody is looking for.
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'field', k,
             'before', r.old_values -> k,
             'after',  r.new_values -> k))
             from jsonb_object_keys(coalesce(r.new_values, '{}'::jsonb)) k
            where (r.old_values -> k) is distinct from (r.new_values -> k)
         ), '[]'::jsonb),
         r.change_reason,
         r.n
    from rows_ r
    left join public.users u on u.id = r.actor_id;
end;
$fn$;

-- ============================================================================
-- The timeline, told
-- ============================================================================
-- Every source that says something happened to this company, in one list, in
-- Arabic. No column names, no raw event keys, and no `updated_at changed` —
-- a save that touched nothing is not an event.

create or replace function public.admin_company_timeline(
  p_company_id uuid,
  p_limit      int default 60
)
returns table (
  at      timestamptz,
  kind    text,
  icon    text,
  title   text,
  detail  text,
  actor   text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('companies.view'), false) then
    raise exception 'ملفّ الشركة لإدارة مرصد';
  end if;

  return query
  select * from (

    -- The company itself
    select c.created_at, 'company'::text, '🏢'::text,
           'أُنشئ ملفّ الشركة'::text,
           case c.source when 'official' then 'من سجلّ وزارة التجارة'
                         else 'أُدخلت في مرصد' end::text,
           null::text
      from public.companies c where c.id = p_company_id

    union all

    -- Requests, through their own vocabulary
    select e.created_at, 'request',
           case e.event when 'approved' then '✅' when 'rejected' then '❌'
                        when 'clarification_requested' then '❓'
                        when 'assigned' then '👤' else '📄' end,
           coalesce(t.ar, e.event)::text,
           case r.kind when 'registration' then 'طلب تسجيل'
                       when 'claim' then 'طلب ملكية'
                       when 'data_update' then 'طلب تصحيح بيانات'
                       when 'document_review' then 'طلب مراجعة مستندات'
                       else r.kind end
             || coalesce(' — ' || nullif(btrim(e.note), ''), ''),
           (select u.email::text from public.users u where u.id = e.actor_id)
      from public.company_request_events e
      join public.company_requests r on r.id = e.request_id
      left join public.request_event_types() t on t.event = e.event
     where r.company_id = p_company_id

    union all

    -- Documents
    select d.created_at, 'document', '📎',
           'رُفع مستند',
           coalesce((select dt.label from public.company_document_types() dt
                      where dt.doc_type = d.doc_type), d.doc_type),
           (select tn.name::text from public.tenants tn where tn.id = d.uploaded_by_tenant_id)
      from public.company_documents d where d.company_id = p_company_id

    union all

    select d.verified_at, 'document',
           case d.status when 'verified' then '✅' else '❌' end,
           case d.status when 'verified' then 'دُقّق مستند' else 'رُفض مستند' end,
           coalesce((select dt.label from public.company_document_types() dt
                      where dt.doc_type = d.doc_type), d.doc_type)
             || coalesce(' — ' || nullif(btrim(d.rejection_reason), ''), ''),
           (select u.email::text from public.users u where u.id = d.verified_by)
      from public.company_documents d
     where d.company_id = p_company_id and d.verified_at is not null

    union all

    -- Reports about it
    select rp.created_at, 'report', '📣', 'قُدّم تقرير عن الشركة',
           coalesce(rp.title::text, '') , null::text
      from public.reports rp where rp.target_company_id = p_company_id

    union all

    select rp.approved_at, 'report', '📣', 'اعتُمد تقرير عن الشركة',
           coalesce(rp.title::text, ''), null::text
      from public.reports rp
     where rp.target_company_id = p_company_id and rp.approved_at is not null

    union all

    -- Objections
    select ds.created_at, 'dispute', '⚖', 'رُفع اعتراض',
           coalesce(ds.reason, ''),
           (select tn.name::text from public.tenants tn where tn.id = ds.raised_by_tenant_id)
      from public.disputes ds
     where ds.company_id = p_company_id
        or ds.report_id in (select r2.id from public.reports r2 where r2.target_company_id = p_company_id)

    union all

    select ds.resolved_at, 'dispute',
           case ds.status when 'upheld' then '✅' else '❌' end,
           case ds.status when 'upheld' then 'قُبل الاعتراض' else 'رُفض الاعتراض' end,
           coalesce(ds.resolution_note, ''),
           (select u.email::text from public.users u where u.id = ds.resolved_by)
      from public.disputes ds
     where (ds.company_id = p_company_id
        or ds.report_id in (select r3.id from public.reports r3 where r3.target_company_id = p_company_id))
       and ds.resolved_at is not null

    union all

    -- What the Ministry started saying
    select c.official_status_at, 'official', '🏛',
           'تغيّرت الحالة الرسمية لدى الوزارة',
           'إلى: ' || c.official_status || coalesce(' — ' || c.official_status_note, ''),
           coalesce(c.official_status_source, 'وزارة التجارة')
      from public.companies c
     where c.id = p_company_id
       and coalesce(c.official_status, 'none') <> 'none'
       and c.official_status_at is not null

    union all

    -- Status moves, from the audit log but told rather than dumped. An
    -- `updated` row is deliberately not here: a save that changed a phone
    -- number is not something that happened to a company.
    select l.created_at, 'status', '🔁', 'تغيّرت حالة الشركة',
           coalesce(l.old_values ->> 'status', '—') || ' ← '
             || coalesce(l.new_values ->> 'status', '—')
             || coalesce(' · ' || nullif(btrim(l.change_reason), ''), ''),
           (select u.email::text from public.users u where u.id = l.actor_id)
      from public.company_audit_log l
     where l.company_id = p_company_id and l.action = 'status_changed'

  -- Named explicitly: a UNION takes its column names from the first branch, so
  -- the derived table was `created_at`, not `at`, and `order by t.at` found
  -- nothing. The function applied cleanly and failed on the first call.
  ) t(at, kind, icon, title, detail, actor)
   where t.at is not null
   order by t.at desc
   limit least(greatest(coalesce(p_limit, 60), 1), 300);
end;
$fn$;

revoke all on function public.admin_company_disputes(uuid) from anon, public;
revoke all on function public.admin_company_audit(uuid, int, int) from anon, public;
revoke all on function public.admin_company_timeline(uuid, int) from anon, public;
grant execute on function public.admin_company_disputes(uuid) to authenticated;
grant execute on function public.admin_company_audit(uuid, int, int) to authenticated;
grant execute on function public.admin_company_timeline(uuid, int) to authenticated;
