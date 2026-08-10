-- Each function asks for what it needs
-- ============================================================================
--
-- The permission table exists but nothing reads it yet beyond the two old
-- predicates, so the five new roles are shapes with no effect: `compliance`
-- holds `documents.verify` and still cannot verify a document, because
-- `review_document` asks «are you an admin or a reviewer» — a question about
-- names wearing a permission's clothes.
--
-- These are the functions where the mapping is unambiguous. Each now asks for
-- the one thing it actually requires.
--
-- Nothing narrows for anyone who has access today: `platform_admin` holds every
-- permission, and `reviewer` holds `work.decide`, `documents.verify` and
-- `reports.review` — which is exactly what it could do before.

-- ============================================================================
-- Documents
-- ============================================================================

create or replace function public.review_document(
  p_document_id uuid,
  p_approve     boolean,
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.company_documents;
begin
  if not coalesce(public.has_permission('documents.verify'), false) then
    raise exception 'تدقيق المستندات يحتاج صلاحية «تدقيق المستندات»';
  end if;

  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب الرفض مطلوب — الشركة يجب أن تعرف ما الخطأ';
  end if;

  select * into v_row from public.company_documents where id = p_document_id for update;
  if v_row.id is null then
    raise exception 'المستند غير موجود';
  end if;

  -- An approved document supersedes the previous accepted one of its type, so
  -- the checklist reads one current file per type rather than a pile.
  if p_approve then
    update public.company_documents
       set status = 'superseded', superseded_at = now()
     where company_id = v_row.company_id
       and doc_type = v_row.doc_type
       and id <> p_document_id
       and status = 'verified';
  end if;

  update public.company_documents
     set status = case when p_approve then 'verified' else 'rejected' end,
         rejection_reason = case when p_approve then null else p_reason end,
         verified_by = public.get_current_user_id(),
         verified_at = now()
   where id = p_document_id
  returning * into v_row;

  -- The request's own timeline. A registration that took three days because a
  -- document came back twice cannot be explained by a decision entry alone.
  if v_row.request_id is not null then
    insert into public.company_request_events
      (request_id, actor_id, event, note)
    values (v_row.request_id, public.get_current_user_id(),
            case when p_approve then 'document_verified' else 'document_rejected' end,
            coalesce((select dt.label from public.company_document_types() dt
                       where dt.doc_type = v_row.doc_type), v_row.doc_type)
            || coalesce(' — ' || nullif(btrim(p_reason), ''), ''));
  end if;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'company_id', v_row.company_id);
end;
$fn$;

-- ============================================================================
-- Requests
-- ============================================================================
-- `work.decide` for the decisions, `work.assign_others` for handing work to
-- somebody else — which is what separates a reviewer from the person running
-- the queue.

create or replace function public.assign_company_request(
  p_request_id uuid,
  p_to_user    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r      public.company_requests;
  v_user text := public.get_current_user_id();
  v_to   text;
begin
  if not coalesce(public.has_permission('work.assign_self')
                  or public.has_permission('work.assign_others'), false) then
    raise exception 'استلام الطلبات يحتاج صلاحية';
  end if;

  v_to := coalesce(p_to_user, v_user);

  if v_to <> v_user and not coalesce(public.has_permission('work.assign_others'), false) then
    raise exception 'إسناد الطلب لموظّف آخر يحتاج صلاحية «إسناد لموظّف آخر»';
  end if;

  if not exists (
    select 1 from public.users u
     join public.role_permissions rp on rp.role = u.role and rp.permission_key = 'work.decide'
     where u.id = v_to and u.status = 'active'
  ) then
    raise exception 'الموظّف غير موجود أو لا يملك صلاحية البتّ';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;

  if r.status not in ('submitted', 'resubmitted', 'under_review') then
    raise exception 'لا يمكن إسناد طلب في حالة «%»', r.status;
  end if;

  if r.assigned_to is not null and r.assigned_to <> v_to
     and not coalesce(public.has_permission('work.assign_others'), false) then
    raise exception 'الطلب مُسنَد بالفعل إلى موظّف آخر';
  end if;

  update public.company_requests
     set status      = 'under_review',
         assigned_to = v_to,
         assigned_at = now(),
         first_response_at = coalesce(first_response_at, now()),
         updated_at  = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'assigned', r.status, 'under_review',
          (select email from public.users where id = v_to));
end;
$fn$;

create or replace function public.unassign_company_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r      public.company_requests;
  v_user text := public.get_current_user_id();
begin
  if not coalesce(public.has_permission('work.assign_others'), false) then
    raise exception 'فكّ الإسناد يحتاج صلاحية «إسناد لموظّف آخر»';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'under_review' then raise exception 'الطلب ليس قيد المراجعة'; end if;

  update public.company_requests
     set status      = case when exists (select 1 from public.company_request_events e
                                          where e.request_id = r.id and e.event = 'resubmitted')
                            then 'resubmitted' else 'submitted' end,
         assigned_to = null,
         assigned_at = null,
         updated_at  = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'unassigned', 'under_review', 'submitted',
          (select email from public.users where id = r.assigned_to));
end;
$fn$;

-- ============================================================================
-- Disputes
-- ============================================================================

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'resolve_dispute' limit 1;
  if v_def is null then
    raise notice 'resolve_dispute غير موجودة — لا شيء لربطه';
    return;
  end if;

  -- Only the authority line moves; the body is whatever it already was.
  v_def := replace(v_def,
    'if not public.is_platform_admin() and public.get_current_user_id() is not null then',
    'if not coalesce(public.has_permission(''disputes.resolve''), false)'
    || ' and public.get_current_user_id() is not null then');

  execute v_def;
end;
$$;

-- ============================================================================
-- The registry
-- ============================================================================
-- `data_operator` exists so somebody can run an import without holding the
-- master key to the platform.

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select oid, proname from pg_proc
     where proname in ('import_job_start', 'import_job_validate', 'import_job_reject_row',
                       'import_job_finish_load', 'import_job_verify',
                       'import_job_publish', 'import_job_rollback', 'import_job_cancel',
                       'reclaim_abandoned_registration', 'expire_abandoned_registrations')
       and pronamespace = 'public'::regnamespace
  loop
    v_def := pg_get_functiondef(r.oid);

    if r.proname in ('import_job_publish') then
      v_def := replace(v_def,
        'if not coalesce(public.is_platform_admin(), false) then',
        'if not coalesce(public.has_permission(''data.publish''), false) then');
    elsif r.proname in ('import_job_rollback') then
      v_def := replace(v_def,
        'if not coalesce(public.is_platform_admin(), false) then',
        'if not coalesce(public.has_permission(''data.rollback''), false) then');
    elsif r.proname like 'import_job_%' then
      v_def := replace(v_def,
        'if not coalesce(public.is_platform_admin(), false) then',
        'if not coalesce(public.has_permission(''data.import''), false) then');
    end if;

    execute v_def;
  end loop;
end;
$$;

-- ============================================================================
-- Proof
-- ============================================================================
-- Every role that could do a thing before must still be able to, and no role
-- may have gained the master key.

do $$
declare
  v int;
begin
  select count(*) into v from public.role_permissions
   where role = 'reviewer'
     and permission_key in ('work.decide', 'documents.verify', 'work.assign_self');
  if v <> 3 then
    raise exception 'المراجع فقد صلاحية كان يملكها — إجهاض';
  end if;

  if exists (select 1 from public.role_permissions
              where role <> 'platform_admin' and permission_key = 'platform.admin') then
    raise exception 'المفتاح الرئيسي تسرّب — إجهاض';
  end if;

  if exists (select 1 from public.role_permissions
              where role in ('support', 'finance')
                and permission_key in ('work.decide', 'documents.verify', 'data.publish')) then
    raise exception 'دور للقراءة مُنح صلاحية قرار — إجهاض';
  end if;
end;
$$;
