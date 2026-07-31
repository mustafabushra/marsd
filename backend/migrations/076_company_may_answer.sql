-- Migration: 076_company_may_answer.sql
-- Purpose: a company could not answer a clarification, because answering moves
--          the review status and the guard refuses that to anyone but Marsad.
--
-- ============================================================================
-- The contradiction
-- ============================================================================
-- 073 added guard_review_status, which raises "حالة المراجعة تُغيّرها إدارة مرصد
-- فقط" for any caller who is not staff. That is right for nine of the ten
-- states — a company must not mark itself approved, or clear its own suspension.
--
-- But answer_clarification, which the company calls, ends with:
--
--   update companies set review_status = 'clarification_received'
--
-- and it is SECURITY DEFINER, which changes whose privileges run the statement,
-- not who get_current_user_id() reports. So the guard saw a company and refused.
-- The workflow shipped with its own exit blocked: Marsad could stop a file, the
-- company was told to respond, and responding was impossible.
--
-- ============================================================================
-- The one transition a company owns
-- ============================================================================
-- Answering is the company's act, and clarification_received is the only state
-- that act produces. It is also harmless to grant: the file does not become
-- approved, it becomes "an answer arrived, somebody read it". Every other
-- transition stays Marsad's.
--
-- Narrow by transition, not by function. A guard that trusts a function name
-- trusts whatever that function later becomes.

create or replace function public.guard_review_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_from text := coalesce(old.review_status, 'approved');
  v_to   text := coalesce(new.review_status, 'approved');
  v_is_staff boolean := coalesce(public.is_platform_admin() or public.is_reviewer(), false);
  v_owns boolean;
begin
  if v_from = v_to then
    return new;
  end if;

  -- Does the caller's tenant own this company?
  select new.id = (select company_id from public.tenants
                    where id = public.get_current_tenant_id())
    into v_owns;

  -- The company answering a question it was asked. Only from the two states
  -- that mean a question is outstanding, and only to the state that means one
  -- was answered — it cannot approve itself or lift its own suspension.
  if not v_is_staff
     and public.get_current_user_id() is not null
     and not (coalesce(v_owns, false)
              and v_from in ('clarification_needed', 'awaiting_documents')
              and v_to = 'clarification_received') then
    raise exception 'حالة المراجعة تُغيّرها إدارة مرصد فقط';
  end if;

  if v_to <> 'approved' and coalesce(trim(new.review_reason), '') = '' then
    raise exception 'الحالة «%» تحتاج سبباً يُعرض على الشركة', v_to;
  end if;

  if v_from = 'clarification_needed'
     and v_to not in ('clarification_received', 'suspended_incomplete', 'frozen') then
    raise exception
      'الطلب موقوف بانتظار توضيح الشركة — لا يُعتمد ولا يُرفض حتى تُستلم الإجابة';
  end if;

  if v_from = 'awaiting_documents'
     and v_to not in ('clarification_received', 'suspended_incomplete', 'frozen') then
    raise exception 'الطلب بانتظار مستندات — لا ينتقل حتى تصل';
  end if;

  new.review_status_at := now();
  new.review_status_by := coalesce(public.get_current_user_id(), new.review_status_by);
  if v_to = 'approved' then
    new.review_reason := null;
  end if;
  return new;
end $fn$;

-- ============================================================================
-- Prove it by answering as the company, then prove the rest still refuses
-- ============================================================================
do $blk$
declare
  v_co uuid; v_tenant uuid; v_member text; v_req uuid; v jsonb;
  v_status text; v_ok boolean;
begin
  select id into v_co from public.companies where review_status = 'clarification_needed' limit 1;
  if v_co is null then
    select company_id into v_co from public.tenants where company_id is not null limit 1;
    update public.companies
       set review_status = 'clarification_needed', review_reason = 'probe'
     where id = v_co;
  end if;

  select t.id, (select id from public.users u where u.tenant_id = t.id and u.status='active' limit 1)
    into v_tenant, v_member
    from public.tenants t where t.company_id = v_co limit 1;

  if v_member is null then
    raise notice 'لا مستخدم لهذه الشركة — تعذّر الإثبات';
    return;
  end if;

  insert into public.clarification_requests (company_id, reason, requested_by)
  values (v_co, 'probe', null) returning id into v_req;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);

  v := public.answer_clarification(v_req, 'هذا ردّ الاختبار');
  if not (v ->> 'ok')::boolean then
    raise exception 'الشركة ما زالت لا تستطيع الردّ: %', v ->> 'reason';
  end if;

  select review_status into v_status from public.companies where id = v_co;
  if v_status <> 'clarification_received' then
    raise exception 'الحالة بعد الردّ % لا clarification_received', v_status;
  end if;

  -- And it still cannot approve itself.
  v_ok := false;
  begin
    update public.companies set review_status = 'approved' where id = v_co;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'الشركة اعتمدت نفسها';
  end if;

  perform set_config('request.jwt.claims', '', true);
  delete from public.clarification_requests where id = v_req;
  update public.companies set review_status = 'approved', review_reason = null where id = v_co;

  raise notice '✅ الشركة تردّ · ولا تعتمد نفسها';
end $blk$;
