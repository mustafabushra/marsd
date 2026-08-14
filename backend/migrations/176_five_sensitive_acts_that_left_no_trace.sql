-- Migration: 176_five_sensitive_acts_that_left_no_trace.sql
--
-- خمس عمليات حسّاسة تُغيّر سجلّاً علنياً ولا تكتب في سجلّ التدقيق.
--
-- قِيست بفحص نصّ كل دالة بحثاً عن كتابة في audit_logs: ستّ عشرة دالة تكتب،
-- وهذه الخمس لا تكتب.
--
--   decide_company_request        قبول أو رفض تسجيل شركة في المرصد
--   resolve_dispute               الفصل في اعتراض — وقبولُه يسحب تقريراً
--                                  منشوراً ويُعيد احتساب مؤشر الثقة
--   recompute_all_trust_scores    إعادة احتساب درجات المنصّة كلّها
--   assign_company_request        استلام طلب أو إسناده
--   request_company_clarification إيقاف مهلة الطلب بانتظار الشركة
--
-- وأخطرها resolve_dispute: أثرها هو أثر withdraw_report نفسه — تقرير يسقط
-- ومؤشر يُعاد حسابه — وتلك مُدقَّقة وهذه ليست. أي أن سحب تقرير مباشرةً
-- يُوثَّق، وسحبَه عبر قبول اعتراض لا يُوثَّق.
--
-- ============================================================================
-- ما لا تغيّره
-- ============================================================================
-- منطق العمل. التعريفات أدناه مستخرَجة من القاعدة الحيّة كما هي، ولم يُضَف
-- إليها إلا قيدُ التدقيق قبل نهاية كل دالة — أو قبل return حيث تُرجع قيمة،
-- ليكون داخل المعاملة التي أحدثت الأثر.
--
-- ولا تُسجَّل أسرار ولا نصوص حسّاسة: نصّ ملاحظة التوضيح يبقى في
-- company_request_events وهنا طولُه فقط، لأن audit_logs أوسع قراءةً.
--
-- والحماية قائمة كما هي: لا سياسة DELETE ولا UPDATE على audit_logs، والقراءة
-- مقصورة على المستأجر صاحب الصفّ أو مسؤول المنصّة.


-- ==========================================================================
-- decide_company_request
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.decide_company_request(p_request_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- تدقيق أمني.
  --
  -- company_request_events سجلّ نطاق: يقول ماذا جرى للطلب. وهذا يقول من فعل
  -- ذلك وبأي صفة — وهو ما يُسأل عنه بعد شهر، لا حالةُ الطلب.
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_user, public.get_current_user_role(),
          case when p_approve then 'company_request_approved'
                              else 'company_request_rejected' end,
          'company_request', p_request_id::text,
          jsonb_build_object(
            'kind', r.kind,
            'company_id', r.company_id,
            'from_status', r.status,
            'outcome', case when p_approve then 'approved' else 'rejected' end,
            'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$function$
;

-- ==========================================================================
-- resolve_dispute
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_dispute_id uuid, p_upheld boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record;
begin
  if not coalesce(public.has_permission('disputes.resolve'), false) and public.get_current_user_id() is not null then
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

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (public.get_current_user_id(), public.get_current_user_role(),
          case when p_upheld then 'dispute_upheld' else 'dispute_rejected' end,
          'dispute', p_dispute_id::text,
          jsonb_build_object(
            'report_id', d.report_id,
            'company_id', d.company_id,
            'raised_by_tenant_id', d.raised_by_tenant_id,
            'outcome', case when p_upheld then 'upheld' else 'rejected' end,
            -- الأثر الجانبي مذكور صراحةً: قبولُ الاعتراض يسحب تقريراً منشوراً
            -- ويعيد احتساب المؤشر، وقارئ السجلّ لا يعرف ذلك من اسم الفعل وحده.
            'report_withdrawn', p_upheld,
            'trust_score_recomputed', p_upheld,
            'note', nullif(btrim(coalesce(p_note, '')), '')));

  return jsonb_build_object(
    'dispute_id', d.id,
    'report_id', d.report_id,
    'company_id', d.company_id,
    'raised_by_tenant_id', d.raised_by_tenant_id,
    'upheld', p_upheld
  );
end;
$function$
;

-- ==========================================================================
-- recompute_all_trust_scores
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.recompute_all_trust_scores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company record;
  v_n integer := 0;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'إعادة احتساب مؤشرات الثقة متاحة لإدارة مرصد فقط'
      using errcode = '42501';
  end if;

  for v_company in select id from public.companies loop
    perform public.compute_trust_score(v_company.id);
    v_n := v_n + 1;
  end loop;

  -- قيد واحد للدفعة كلّها، لا قيد لكل شركة.
  --
  -- إعادة الاحتساب تمرّ على كل شركة؛ قيدٌ لكل واحدة يعني آلاف الصفوف عن فعل
  -- واحد، ويغرق السجلّ الذي يُقرأ للتحقيق. العدد يكفي.
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (public.get_current_user_id(), public.get_current_user_role(),
          'trust_scores_recomputed_all', 'trust_scores', null,
          jsonb_build_object('companies_affected', v_n, 'scope', 'all'));

  return v_n;
end $function$
;

-- ==========================================================================
-- assign_company_request
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.assign_company_request(p_request_id uuid, p_to_user text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_user, public.get_current_user_role(),
          'company_request_assigned', 'company_request', p_request_id::text,
          jsonb_build_object(
            'kind', r.kind,
            'company_id', r.company_id,
            'from_status', r.status,
            'assigned_to', v_to,
            -- الإسناد للنفس والإسناد للغير فعلان مختلفان في المساءلة.
            'self_assigned', (v_to = v_user)));
end;
$function$
;

-- ==========================================================================
-- request_company_clarification
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.request_company_clarification(p_request_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.company_requests;
  v_user text := public.get_current_user_id();
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'اكتب ما المطلوب من الشركة';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if r.status not in ('submitted', 'under_review', 'resubmitted') then
    raise exception 'الطلب في حالة «%»', r.status;
  end if;

  -- A request under review belongs to whoever is reviewing it.
  if r.assigned_to is not null and r.assigned_to <> v_user
     and not coalesce(public.is_platform_admin(), false) then
    raise exception 'الطلب مُسنَد إلى موظّف آخر';
  end if;

  update public.company_requests
     set status      = 'clarification_needed',
         assigned_to = coalesce(assigned_to, v_user),
         assigned_at = coalesce(assigned_at, now()),
         first_response_at = coalesce(first_response_at, now()),
         paused_since = now(),
         updated_at  = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'clarification_requested', r.status, 'clarification_needed', p_note);

  -- الملاحظة نفسها لا تُسجَّل هنا: نصّها في company_request_events، وتكرارها
  -- يضاعف بياناً قد يحوي تفاصيل شركة في جدول أوسع قراءةً.
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_user, public.get_current_user_role(),
          'company_clarification_requested', 'company_request', p_request_id::text,
          jsonb_build_object(
            'kind', r.kind,
            'company_id', r.company_id,
            'from_status', r.status,
            'note_length', char_length(btrim(coalesce(p_note, '')))));
end;
$function$
;

-- تحقّق: كل واحدة تكتب في audit_logs الآن، والحماية لم تتغيّر.
do $blk$
declare
  v_missing text[] := '{}';
  n text;
begin
  foreach n in array array['decide_company_request','resolve_dispute',
                           'recompute_all_trust_scores','assign_company_request',
                           'request_company_clarification'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = n
         and pg_get_functiondef(p.oid) ~ 'insert into public.audit_logs')
    then v_missing := v_missing || n; end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'لا تكتب في السجلّ: %', array_to_string(v_missing, ', ');
  end if;
  raise notice '✅ الخمس تكتب في audit_logs';

  if exists (select 1 from pg_policies
              where tablename = 'audit_logs' and cmd in ('DELETE','UPDATE')) then
    raise exception 'ظهرت سياسة حذف أو تعديل على audit_logs';
  end if;
  raise notice '✅ لا سياسة حذف ولا تعديل على audit_logs';
end $blk$;

