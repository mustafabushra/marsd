-- Somebody takes the request
-- ============================================================================
--
-- `under_review` now has its columns. These are the moves that reach it, and
-- the two existing moves rewritten to keep the clocks honest.
--
-- The rule that makes assignment mean anything: a request under review is
-- locked to the person reviewing it. A second reviewer opening it can read it
-- and cannot decide it. Without that, «assigned» is decoration — two people do
-- the same work and the second one's decision silently wins.

/**
 * Take a request, or hand it to somebody.
 *
 * Taking it yourself is the ordinary act and any reviewer may do it. Handing
 * it to somebody else is a supervisor's act, so it belongs to platform admins.
 */
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
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  v_to := coalesce(p_to_user, v_user);

  if v_to <> v_user and not coalesce(public.is_platform_admin(), false) then
    raise exception 'إسناد الطلب لموظّف آخر لمسؤول المنصة';
  end if;

  if not exists (
    select 1 from public.users u
     where u.id = v_to and u.role in ('platform_admin', 'reviewer') and u.status = 'active'
  ) then
    raise exception 'الموظّف غير موجود أو غير نشط';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;

  if r.status not in ('submitted', 'resubmitted', 'under_review') then
    raise exception 'لا يمكن إسناد طلب في حالة «%»', r.status;
  end if;

  -- Taking a request somebody else is already reviewing is how two people do
  -- the same work. A supervisor may reassign; a peer may not.
  if r.assigned_to is not null and r.assigned_to <> v_to
     and not coalesce(public.is_platform_admin(), false) then
    raise exception 'الطلب مُسنَد بالفعل إلى موظّف آخر';
  end if;

  update public.company_requests
     set status      = 'under_review',
         assigned_to = v_to,
         assigned_at = now(),
         -- The response clock stops the moment somebody picks it up, and never
         -- restarts. A request handed on later has still been responded to.
         first_response_at = coalesce(first_response_at, now()),
         updated_at  = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'assigned', r.status, 'under_review',
          (select email from public.users where id = v_to));
end;
$fn$;

/**
 * Put it back in the unclaimed queue.
 *
 * For the reviewer who is on leave, or took the wrong one. The response clock
 * is not rewound — we did respond, and pretending otherwise would let a
 * request be laundered out of its own lateness.
 */
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
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'فكّ الإسناد لمسؤول المنصة';
  end if;

  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if r.status <> 'under_review' then
    raise exception 'الطلب ليس قيد المراجعة';
  end if;

  update public.company_requests
     set status      = case when r.submitted_at is not null
                              and exists (select 1 from public.company_request_events e
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

/**
 * The company takes its own request back.
 *
 * Only before a decision, and only while the ball is theirs — a draft they
 * never sent, or a clarification they have decided not to answer. Once it is
 * in front of a reviewer, withdrawing it would let a company erase a
 * submission mid-review; they can ask, and the reviewer closes it.
 *
 * Withdrawal is final. A company that changes its mind opens a new request,
 * which is what keeps the history readable.
 */
create or replace function public.withdraw_company_request(
  p_request_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r      public.company_requests;
  v_user text := public.get_current_user_id();
begin
  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;

  -- The company's own act. Marsad closing a request on a company's behalf is a
  -- rejection, and it has its own function and its own required reason.
  if r.tenant_id is distinct from public.get_current_tenant_id() then
    raise exception 'سحب الطلب من الشركة صاحبته وحدها';
  end if;

  if r.status not in ('draft', 'clarification_needed') then
    if r.status in ('approved', 'rejected', 'withdrawn') then
      raise exception 'الطلب مُغلق بالفعل بحالة «%»', r.status;
    end if;
    raise exception 'الطلب قيد المراجعة — تواصل مع مرصد';
  end if;

  update public.company_requests
     set status          = 'withdrawn',
         withdraw_reason = nullif(btrim(p_reason), ''),
         reviewed_at     = now(),
         updated_at      = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'withdrawn', r.status, 'withdrawn', nullif(btrim(p_reason), ''));
end;
$fn$;

-- ============================================================================
-- The two existing moves, with the clocks
-- ============================================================================

/**
 * Hand it to Marsad.
 *
 * Unchanged in what it refuses. What is new: the deadlines are stamped on the
 * request at the moment it arrives, so it keeps the promise that was made to
 * it rather than whatever the settings say on the day somebody looks; and a
 * resubmission closes the pause the clarification opened.
 */
create or replace function public.submit_company_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r        public.company_requests;
  v_user   text := public.get_current_user_id();
  v_next   text;
  v_missing text;
  v_sla    record;
  v_pause  interval := '0'::interval;
begin
  select * into r from public.company_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;

  if r.tenant_id is distinct from public.get_current_tenant_id()
     and not coalesce(public.is_platform_admin(), false) then
    raise exception 'هذا الطلب ليس لك';
  end if;

  if r.status not in ('draft', 'clarification_needed') then
    raise exception 'الطلب في حالة «%» ولا يمكن إرساله', r.status;
  end if;

  -- The rule, in the database. The browser checks it too so somebody is told
  -- early; this one is what makes it true.
  if r.kind in ('registration', 'claim') then
    select string_agg(t.label, '، ')
      into v_missing
      from public.company_document_types() t
     where t.required
       and not exists (
         select 1 from public.company_documents d
          where d.company_id = r.company_id
            and d.doc_type = t.doc_type
            and d.status <> 'rejected'
       );

    if v_missing is not null then
      raise exception 'مستندات ناقصة: %', v_missing;
    end if;
  end if;

  v_next := case when r.status = 'clarification_needed' then 'resubmitted' else 'submitted' end;

  select * into v_sla from public.request_sla_target(r.kind);

  -- Time spent waiting on the company is not time Marsad took. Closing the
  -- pause here pushes the resolution deadline out by exactly as long as the
  -- ball was theirs.
  if r.paused_since is not null then
    v_pause := now() - r.paused_since;
  end if;

  update public.company_requests
     set status       = v_next,
         submitted_at = coalesce(submitted_at, now()),
         response_due_at =
           coalesce(response_due_at, now() + make_interval(hours => v_sla.response_hours)),
         resolution_due_at =
           coalesce(resolution_due_at + v_pause,
                    now() + make_interval(hours => v_sla.resolution_hours)),
         paused_total = paused_total + v_pause,
         paused_since = null,
         updated_at   = now()
   where id = p_request_id;

  insert into public.company_request_events (request_id, actor_id, event, from_status, to_status)
  values (p_request_id, v_user,
          case when v_next = 'resubmitted' then 'resubmitted' else 'submitted' end,
          r.status, v_next);

  return v_next;
end;
$fn$;

/**
 * Ask the applicant for something.
 *
 * Starts the pause: from here the company owes us, and the resolution clock
 * stops until they answer. The response clock is closed for good — asking a
 * question is a response.
 */
create or replace function public.request_company_clarification(
  p_request_id uuid,
  p_note       text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
end;
$fn$;

revoke all on function public.assign_company_request(uuid, text) from anon, public;
revoke all on function public.unassign_company_request(uuid) from anon, public;
revoke all on function public.withdraw_company_request(uuid, text) from anon, public;
grant execute on function public.assign_company_request(uuid, text) to authenticated;
grant execute on function public.unassign_company_request(uuid) to authenticated;
grant execute on function public.withdraw_company_request(uuid, text) to authenticated;
