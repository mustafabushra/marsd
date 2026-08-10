-- «Approved» means somebody looked
-- ============================================================================
--
-- `decide_company_request` checked nothing. Four documents arriving is not four
-- documents being read, and a request could be approved with every one of them
-- still `pending` — or with one rejected after submission, because the only
-- check ran at submit time and nothing re-ran it at the decision.
--
-- Five conditions now, in the same transaction as the write, under the same
-- `for update` lock. Checking then writing in two statements is a race: a
-- document can be rejected in between, and the approval would carry a check
-- that was true a moment ago.
--
-- The readiness function is separate so the screen can show the reviewer the
-- same five answers *before* the button — but the screen showing them is
-- courtesy. This is the rule.

/**
 * Can this request be approved, and if not, exactly what is missing.
 *
 * Returns every check rather than the first failure. A reviewer who fixes one
 * thing and is then told about the next one learns to distrust the screen.
 */
create or replace function public.company_request_readiness(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r          public.company_requests;
  co         public.companies;
  v_required int;
  v_present  int;
  v_verified int;
  v_bad      text;
  v_missing  text;
  v_fields   text;
  v_clarif   boolean;
  v_docs_apply boolean;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  select * into r from public.company_requests where id = p_request_id;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  select * into co from public.companies where id = r.company_id;

  -- Document conditions belong to the kinds that carry documents. A data
  -- correction on a company already in Marsad is not asked to re-prove its
  -- existence.
  v_docs_apply := r.kind in ('registration', 'claim');

  select count(*)::int into v_required
    from public.company_document_types() t where t.required;

  select count(distinct d.doc_type)::int into v_present
    from public.company_documents d
   where d.company_id = r.company_id
     and d.superseded_at is null
     and d.doc_type in (select t.doc_type from public.company_document_types() t where t.required);

  select count(distinct d.doc_type)::int into v_verified
    from public.company_documents d
   where d.company_id = r.company_id
     and d.superseded_at is null
     and d.status = 'verified'
     and d.doc_type in (select t.doc_type from public.company_document_types() t where t.required);

  select string_agg(t.label, '، ') into v_missing
    from public.company_document_types() t
   where t.required
     and not exists (select 1 from public.company_documents d
                      where d.company_id = r.company_id and d.doc_type = t.doc_type
                        and d.superseded_at is null);

  select string_agg(distinct t.label, '، ') into v_bad
    from public.company_documents d
    join public.company_document_types() t on t.doc_type = d.doc_type
   where d.company_id = r.company_id
     and d.superseded_at is null
     and t.required
     and d.status in ('rejected', 'reupload_required');

  -- Both mechanisms count. The legacy table still holds an open row, and a
  -- question nobody answered is a question nobody answered whichever table it
  -- was asked in.
  v_clarif := r.status = 'clarification_needed'
    or exists (select 1 from public.clarification_requests c
                where c.company_id = r.company_id and c.status = 'open');

  select string_agg(lbl, '، ') into v_fields from (
    select 'الاسم'          as lbl where coalesce(btrim(co.name), '') = ''
    union all select 'رقم السجل التجاري'  where coalesce(btrim(co.cr_number), '') = ''
    union all select 'المدينة'            where coalesce(btrim(co.city), '') = ''
    union all select 'القطاع'             where coalesce(btrim(co.sector), '') = ''
    union all select 'البريد الرسمي'      where coalesce(btrim(co.official_email), '') = ''
  ) f;

  return jsonb_build_object(
    'request_id', r.id,
    'kind', r.kind,
    'status', r.status,
    'documents_apply', v_docs_apply,
    'documents_required', v_required,
    'documents_present',  v_present,
    'documents_verified', v_verified,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'documents_present', 'ok', (not v_docs_apply) or v_missing is null,
        'label', format('%s/%s مستندات مطلوبة سُلّمت', v_present, v_required), 'detail', v_missing),
      jsonb_build_object('key', 'documents_verified', 'ok', (not v_docs_apply) or v_verified >= v_required,
        'label', format('%s/%s مستندات دُقّقت', v_verified, v_required),
        'detail', case when v_docs_apply and v_verified < v_required then 'بانتظار التدقيق' end),
      jsonb_build_object('key', 'documents_clean', 'ok', v_bad is null,
        'label', 'لا مستند مطلوب مرفوض', 'detail', v_bad),
      jsonb_build_object('key', 'no_clarification', 'ok', not v_clarif,
        'label', 'لا توضيحات معلّقة', 'detail', case when v_clarif then 'توضيح مفتوح' end),
      jsonb_build_object('key', 'core_fields', 'ok', v_fields is null,
        'label', 'البيانات الأساسية مكتملة', 'detail', v_fields)
    ),
    'ready', ((not v_docs_apply) or (v_missing is null and v_verified >= v_required))
             and v_bad is null and not v_clarif and v_fields is null
  );
end;
$fn$;

/**
 * Decide it.
 *
 * Approval now has to earn itself. Rejection does not — a reason and the
 * authority are enough, because refusing an incomplete application is exactly
 * what rejection is for.
 */
create or replace function public.decide_company_request(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r       public.company_requests;
  co      public.companies;
  v_user  text := public.get_current_user_id();
  v_ready jsonb;
  v_chk   jsonb;
  v_fail  text;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب الرفض مطلوب';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if r.status in ('approved', 'rejected', 'withdrawn') then
    raise exception 'الطلب مُغلق بالفعل بحالة «%»', r.status;
  end if;
  if r.status = 'draft' then
    raise exception 'الطلب لم يُرسل بعد';
  end if;

  -- Whoever is reviewing it owns it.
  if r.assigned_to is not null and r.assigned_to <> v_user
     and not coalesce(public.is_platform_admin(), false) then
    raise exception 'الطلب مُسنَد إلى موظّف آخر';
  end if;

  -- ===== The five conditions =====
  if p_approve then
    v_ready := public.company_request_readiness(p_request_id);

    if not (v_ready ->> 'ready')::boolean then
      for v_chk in select * from jsonb_array_elements(v_ready -> 'checks') loop
        if not (v_chk ->> 'ok')::boolean then
          v_fail := coalesce(v_fail || ' · ', '')
                 || (v_chk ->> 'label')
                 || coalesce(': ' || (v_chk ->> 'detail'), '');
        end if;
      end loop;
      raise exception 'لا يمكن القبول — %', v_fail;
    end if;
  end if;

  update public.company_requests
     set status          = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at     = now(),
         reviewed_by     = v_user,
         decision_reason = p_reason,
         paused_since    = null,
         updated_at      = now()
   where id = p_request_id;

  if r.kind in ('registration', 'claim') then
    if p_approve then
      update public.companies
         set approved = true, status = 'active',
             -- Kept in step while it is still being read. It is on its way out,
             -- and a column on its way out that disagrees with the truth is
             -- how the last reader gets a wrong answer.
             review_status = 'approved'
       where id = r.company_id;
    else
      -- The reason is not written to `status_reason`: `guard_company_status`
      -- nulls that column for any status other than 'suspended', because it is
      -- the suspension notice shown to the company. Writing it here would look
      -- like it was stored and it would not be. The reason lives on the request
      -- as `decision_reason`, and on the company as `review_reason`.
      update public.companies
         set approved = false, status = 'rejected',
             review_status = 'rejected', review_reason = p_reason
       where id = r.company_id;
    end if;
  end if;

  -- The legacy row for the same registration. Two tables described one
  -- registration and only one of them was ever closed, so every real
  -- registration read `pending` in the old table forever.
  if r.kind = 'registration' then
    update public.registration_requests
       set status = case when p_approve then 'approved' else 'rejected' end,
           reviewed_at = now(),
           reviewed_by = v_user
     where company_id = r.company_id and status = 'pending';
  end if;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user,
          case when p_approve then 'approved' else 'rejected' end,
          r.status,
          case when p_approve then 'approved' else 'rejected' end,
          p_reason);
end;
$fn$;

revoke all on function public.company_request_readiness(uuid) from anon, public;
grant execute on function public.company_request_readiness(uuid) to authenticated;
