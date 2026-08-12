-- Asking to join a company
-- ============================================================================
--
-- Membership only ever went one way. A company admin could invite somebody —
-- pending_invites, and the /users screen that writes it. Nobody could ask.
--
-- So an employee whose company was already on Marsad had three options and all
-- three were wrong: register the company again (refused, correctly, by the
-- unique index on the registration number), file an ownership claim (which is
-- a claim to *own* the company, reviewed by Marsad, and answers a different
-- question), or ask a colleague to invite them and wait.
--
-- Worse, until migration 162 there was a fourth: attach yourself directly. That
-- hole is closed, and closing it makes this gap load-bearing — the guard now
-- tells people to submit a request, so one has to exist.
--
-- ============================================================================
-- Who decides
-- ============================================================================
-- The company's own admin, not Marsad. An ownership claim asks «is this company
-- yours», which only Marsad can judge from documents. Joining asks «does this
-- person work here», which only the company knows. Sending it to Marsad would
-- be asking a stranger to vouch for somebody's colleague.
--
-- Marsad staff can see them, because a company with no reachable admin is a
-- support case and they have to be able to look.

create table if not exists public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      text not null,
  message      text,
  status       text not null default 'pending',
  decided_at   timestamptz,
  decided_by   text,
  decision_note text,
  created_at   timestamptz not null default now(),

  constraint join_requests_status_ck
    check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

-- One live request per person per company. Asking twice is the same ask, and a
-- queue with the same name three times is a queue somebody stops reading.
create unique index if not exists join_requests_one_open
  on public.join_requests (tenant_id, user_id)
  where status = 'pending';

create index if not exists join_requests_tenant_idx
  on public.join_requests (tenant_id, status, created_at desc);
create index if not exists join_requests_user_idx
  on public.join_requests (user_id, created_at desc);

alter table public.join_requests enable row level security;

-- The asker sees their own; the company's members see requests to their company;
-- Marsad sees all.
drop policy if exists join_requests_read on public.join_requests;
create policy join_requests_read on public.join_requests
  for select to authenticated
  using (
    user_id = public.get_current_user_id()
    or tenant_id = public.get_current_tenant_id()
    or coalesce(public.has_permission('platform.admin'), false)
  );

-- Written through the functions below, which stamp the asker and check the
-- state. No direct insert or update is granted: a client that sets its own
-- user_id can ask on somebody else's behalf, and one that sets its own status
-- can approve itself.
grant select on public.join_requests to authenticated;

-- ============================================================================
-- Asking
-- ============================================================================

create or replace function public.request_to_join_company(
  p_tenant_id uuid,
  p_message   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me   text := public.get_current_user_id();
  v_mine uuid;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select u.tenant_id into v_mine from public.users u where u.id = v_me;
  if v_mine is not null then
    if v_mine = p_tenant_id then
      raise exception 'أنت عضو في هذه الشركة بالفعل';
    end if;
    raise exception 'حسابك مرتبط بشركة أخرى';
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'الشركة غير موجودة';
  end if;

  -- A company with nobody in it has nobody to answer, and that is a
  -- registration or a claim rather than a join.
  if not exists (select 1 from public.users u where u.tenant_id = p_tenant_id) then
    raise exception 'لا يوجد مسؤول لهذه الشركة بعد — قدّم طلب ملكية بدلاً من الانضمام';
  end if;

  insert into public.join_requests (tenant_id, user_id, message)
  values (p_tenant_id, v_me, nullif(btrim(coalesce(p_message, '')), ''))
  on conflict (tenant_id, user_id) where status = 'pending'
  -- Keeping the first message: asking again without one must not erase what
  -- was already said.
  do update set message = coalesce(excluded.message, public.join_requests.message)
  returning id into v_id;

  insert into public.notifications (user_id, tenant_id, type, payload)
  select u.id, p_tenant_id, 'join_requested',
         jsonb_build_object('title', 'طلب انضمام جديد',
                            'message', 'طلب أحدهم الانضمام إلى شركتك في مرصد.',
                            'request_id', v_id)
    from public.users u
   where u.tenant_id = p_tenant_id and u.role = 'company_admin' and u.status = 'active';

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_me, 'join_requested', 'join_request', v_id::text,
          jsonb_build_object('tenant_id', p_tenant_id));

  return v_id;
end;
$fn$;

-- ============================================================================
-- Deciding
-- ============================================================================

create or replace function public.decide_join_request(
  p_request_id uuid,
  p_approve    boolean,
  p_role       text default 'company_member',
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r      public.join_requests;
  v_me   text := public.get_current_user_id();
  v_role text := public.get_current_user_role();
  v_ten  uuid := public.get_current_tenant_id();
begin
  select * into r from public.join_requests where id = p_request_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then
    raise exception 'الطلب في حالة «%» ولا يقبل قراراً جديداً', r.status;
  end if;

  -- The company's own admin. Marsad may act too, because a company whose admin
  -- has left is a support case somebody has to be able to unblock.
  if not (
    (v_role = 'company_admin' and v_ten = r.tenant_id)
    or coalesce(public.has_permission('platform.admin'), false)
  ) then
    raise exception 'قرار طلب الانضمام لمسؤول الشركة';
  end if;

  if p_role not in ('company_admin', 'company_member') then
    raise exception 'دور غير معروف';
  end if;

  if not p_approve then
    update public.join_requests
       set status = 'rejected', decided_at = now(), decided_by = v_me,
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_request_id;

    insert into public.notifications (user_id, tenant_id, type, payload)
    values (r.user_id, r.tenant_id, 'join_rejected',
            jsonb_build_object('title', 'لم يُقبل طلب الانضمام',
                               'message', coalesce(nullif(btrim(p_note), ''),
                                                   'تواصل مع مسؤول الشركة.')));

    insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
    values (v_me, 'join_rejected', 'join_request', p_request_id::text,
            jsonb_build_object('tenant_id', r.tenant_id, 'user_id', r.user_id));

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- Approving is what actually creates the membership. It is done here, inside
  -- the same statement as the decision, so a person cannot end up attached with
  -- the request still open — the shape that let the old claim flow run twice.
  if exists (select 1 from public.users u
              where u.id = r.user_id and u.tenant_id is not null) then
    raise exception 'أصبح هذا الحساب مرتبطاً بشركة أخرى منذ تقديم الطلب';
  end if;

  update public.users
     set tenant_id = r.tenant_id, role = p_role, status = 'active'
   where id = r.user_id;

  update public.join_requests
     set status = 'approved', decided_at = now(), decided_by = v_me
   where id = p_request_id;

  insert into public.notifications (user_id, tenant_id, type, payload)
  values (r.user_id, r.tenant_id, 'join_approved',
          jsonb_build_object('title', 'قُبل طلب الانضمام',
                             'message', 'أصبحت عضواً في الشركة على مرصد.'));

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_me, 'join_approved', 'join_request', p_request_id::text,
          jsonb_build_object('tenant_id', r.tenant_id, 'user_id', r.user_id, 'role', p_role));

  return jsonb_build_object('ok', true, 'status', 'approved', 'role', p_role);
end;
$fn$;

-- ============================================================================
-- What a company's admin has to answer
-- ============================================================================

create or replace function public.company_join_requests()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
    from (
      select j.id, j.status, j.message, j.created_at, j.decided_at, j.decision_note,
             j.user_id, u.email as user_email,
             btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as user_name
        from public.join_requests j
        left join public.users u on u.id = j.user_id
       where j.tenant_id = public.get_current_tenant_id()
         and public.get_current_tenant_id() is not null
    ) x;
$fn$;

revoke all on function public.request_to_join_company(uuid, text) from anon, public;
revoke all on function public.decide_join_request(uuid, boolean, text, text) from anon, public;
revoke all on function public.company_join_requests() from anon, public;
grant execute on function public.request_to_join_company(uuid, text) to authenticated;
grant execute on function public.decide_join_request(uuid, boolean, text, text) to authenticated;
grant execute on function public.company_join_requests() to authenticated;

-- The two notification types this introduces.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'report_approved', 'report_rejected', 'report_request_info',
    'company_approved', 'company_rejected', 'company_data_updated',
    'claim_approved', 'claim_rejected', 'subscription_changed',
    'tenant_status_changed', 'credits_awarded', 'welcome',
    'company_registration_submitted', 'claim_request_submitted',
    'report_submitted', 'dispute_raised', 'document_submitted',
    'document_verified', 'document_rejected', 'official_status_recorded',
    'clarification_requested', 'clarification_answered',
    'review_status_changed', 'score_changed', 'watchlist_alert',
    'company_verified', 'company_verification_withdrawn',
    'join_requested', 'join_approved', 'join_rejected'
  ));
