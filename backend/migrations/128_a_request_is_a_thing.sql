-- A request is a thing
-- ============================================================================
--
-- «Where did this request get to» has no answer in Marsad today, because a
-- request is not anything. What exists instead:
--
--   companies.status          active | pending | suspended | terminated
--   companies.approved        true | false
--   companies.review_status   under_review | awaiting_verification |
--                             clarification_needed | awaiting_documents |
--                             clarification_received | …
--   companies.official_status none | insolvency | bankruptcy | liquidation | …
--   registration_requests     pending | approved | rejected | expired
--   claim_requests            pending | approved | rejected | expired
--   company_data_requests     …
--   company_documents         pending | verified | rejected | reupload_required
--
-- Four columns on one row and four tables beside it, none of which knows about
-- the others. The data shows what that costs: every company reads
-- `review_status = 'approved'` while three registration requests sit `pending`.
-- The two columns describe the same companies and disagree, because nothing
-- writes the second.
--
-- ============================================================================
-- One row per thing somebody is waiting on
-- ============================================================================
-- A request has a kind, a state, an owner, and a history. Registration, a claim
-- on an existing company, a data correction, a document review — all of them are
-- the same shape, and treating them as four unrelated tables is why none of them
-- has a queue anybody watches.
--
-- Documents attach to the request rather than forming a queue of their own,
-- which is the whole point: a reviewer opens one thing and finds the company,
-- what the applicant entered, and every file they sent, together.
--
-- Nothing is migrated away yet. This is the spine; the existing tables keep
-- working until each screen moves onto it deliberately.

create table if not exists public.company_requests (
  id            uuid primary key default gen_random_uuid(),

  company_id    uuid not null references public.companies(id) on delete cascade,
  tenant_id     uuid          references public.tenants(id)   on delete set null,
  requested_by  text not null,

  -- What is being asked for.
  kind          text not null check (kind in (
                  'registration',   -- تسجيل شركة جديدة
                  'claim',          -- المطالبة بشركة قائمة
                  'data_update',    -- تصحيح بيانات
                  'document_review' -- مراجعة مستندات وحدها
                )),

  -- Where it got to.
  --
  -- `resubmitted` is deliberately not `submitted`. A reviewer who asked for
  -- something and got an answer is doing different work from a reviewer meeting
  -- a request for the first time, and collapsing the two loses the thing they
  -- most need to know.
  status        text not null default 'draft' check (status in (
                  'draft', 'submitted', 'under_review',
                  'clarification_needed', 'resubmitted',
                  'approved', 'rejected', 'withdrawn'
                )),

  assigned_to   text references public.users(id) on delete set null,

  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   text references public.users(id) on delete set null,
  decision_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One open request per company per kind.
--
-- Partial, on the states that are still open: a company may be registered once,
-- rejected, and registered again — but it may not have two registrations in
-- flight, which is how a reviewer ends up approving one and rejecting the other.
create unique index if not exists company_requests_one_open_idx
  on public.company_requests (company_id, kind)
  where status in ('draft', 'submitted', 'under_review', 'clarification_needed', 'resubmitted');

create index if not exists company_requests_queue_idx
  on public.company_requests (status, submitted_at desc);

create index if not exists company_requests_company_idx
  on public.company_requests (company_id);

-- --- Documents belong to a request -------------------------------------------
-- Not a queue of their own. A document with no context is a file a reviewer has
-- to go and find the meaning of.
alter table public.company_documents
  add column if not exists request_id uuid references public.company_requests(id) on delete set null;

create index if not exists company_documents_request_idx
  on public.company_documents (request_id) where request_id is not null;

-- --- The history --------------------------------------------------------------
-- Every state change and every message, in order, on one timeline. The company
-- file reads this rather than assembling a story from four tables.
create table if not exists public.company_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.company_requests(id) on delete cascade,
  actor_id    text references public.users(id) on delete set null,

  event       text not null,        -- submitted | assigned | clarification_requested | …
  from_status text,
  to_status   text,
  note        text,

  created_at  timestamptz not null default now()
);

create index if not exists company_request_events_idx
  on public.company_request_events (request_id, created_at);

-- --- Who sees what ------------------------------------------------------------
alter table public.company_requests enable row level security;
alter table public.company_request_events enable row level security;

revoke all on public.company_requests from anon, authenticated, public;
revoke all on public.company_request_events from anon, authenticated, public;

grant select on public.company_requests to authenticated;
grant select on public.company_request_events to authenticated;

-- A company sees its own requests; Marsad sees all of them. Writes go through
-- the functions below, never directly — a status is a decision, and a decision
-- that can be written by whoever holds the row is not a decision.
drop policy if exists company_requests_select on public.company_requests;
create policy company_requests_select on public.company_requests
  for select to authenticated
  using (
    tenant_id = public.get_current_tenant_id()
    or coalesce(public.is_platform_admin(), false)
    or coalesce(public.is_reviewer(), false)
  );

drop policy if exists company_request_events_select on public.company_request_events;
create policy company_request_events_select on public.company_request_events
  for select to authenticated
  using (
    exists (
      select 1 from public.company_requests r
       where r.id = request_id
         and (r.tenant_id = public.get_current_tenant_id()
              or coalesce(public.is_platform_admin(), false)
              or coalesce(public.is_reviewer(), false))
    )
  );

-- ============================================================================
-- The moves a request may make, and only those
-- ============================================================================
-- A status column anyone may write is not a workflow; it is a text field with
-- opinions. These four functions are the only way a request changes state, so
-- «can this go from rejected straight to approved» has one answer in one place
-- rather than one answer per screen that writes it.

/** Open a request, or return the one already open. */
create or replace function public.open_company_request(
  p_company_id uuid,
  p_kind       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user   text := public.get_current_user_id();
  v_tenant uuid := public.get_current_tenant_id();
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  -- Returned rather than refused. Somebody who reloads a form and submits again
  -- means to continue what they started, and an error saying «you already have
  -- one» is a dead end standing exactly where the thing they wanted already is.
  select id into v_id
    from public.company_requests
   where company_id = p_company_id and kind = p_kind
     and status in ('draft', 'submitted', 'under_review', 'clarification_needed', 'resubmitted');

  if v_id is not null then
    return v_id;
  end if;

  insert into public.company_requests (company_id, tenant_id, requested_by, kind, status)
  values (p_company_id, v_tenant, v_user, p_kind, 'draft')
  returning id into v_id;

  insert into public.company_request_events (request_id, actor_id, event, to_status)
  values (v_id, v_user, 'created', 'draft');

  return v_id;
end;
$fn$;

/** Hand it to Marsad. The one move the applicant makes. */
create or replace function public.submit_company_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.company_requests;
  v_user text := public.get_current_user_id();
  v_next text;
  v_missing text;
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

  -- Required documents, checked here and not only in the form.
  --
  -- A check in the browser tells somebody early; this one is the rule.
  -- Registration and a claim both put a company in front of a reviewer, and a
  -- reviewer with nothing to check is the reason the requirement exists at all.
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

  -- Answering a clarification is a different arrival from a first submission,
  -- and the queue exists to show a reviewer which is which.
  v_next := case when r.status = 'clarification_needed' then 'resubmitted' else 'submitted' end;

  update public.company_requests
     set status = v_next,
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = p_request_id;

  insert into public.company_request_events (request_id, actor_id, event, from_status, to_status)
  values (p_request_id, v_user, 'submitted', r.status, v_next);

  return v_next;
end;
$fn$;

/** Ask the applicant for something. */
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

  -- «Needs clarification» with no clarification named is a rejection that
  -- refuses to say why, and leaves the applicant nothing to act on.
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

  update public.company_requests
     set status = 'clarification_needed',
         assigned_to = coalesce(assigned_to, v_user),
         updated_at = now()
   where id = p_request_id;

  insert into public.company_request_events
    (request_id, actor_id, event, from_status, to_status, note)
  values (p_request_id, v_user, 'clarification_requested', r.status, 'clarification_needed', p_note);
end;
$fn$;

/** Decide it. */
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
  r public.company_requests;
  v_user text := public.get_current_user_id();
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  -- A rejection somebody cannot act on is a rejection they will send again.
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

  update public.company_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(),
         reviewed_by = v_user,
         decision_reason = p_reason,
         updated_at = now()
   where id = p_request_id;

  -- The company follows the decision.
  --
  -- This is the join that was missing. A decision recorded on a request that
  -- leaves the company untouched is a record of an opinion rather than an
  -- outcome — which is how every company came to read `review_status =
  -- approved` while three registrations sat pending.
  if r.kind in ('registration', 'claim') then
    if p_approve then
      update public.companies
         set approved = true, status = 'active'
       where id = r.company_id;
    else
      update public.companies
         set approved = false, status = 'rejected', status_reason = p_reason
       where id = r.company_id;
    end if;
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

revoke all on function public.open_company_request(uuid, text) from anon, public;
revoke all on function public.submit_company_request(uuid) from anon, public;
revoke all on function public.request_company_clarification(uuid, text) from anon, public;
revoke all on function public.decide_company_request(uuid, boolean, text) from anon, public;

grant execute on function public.open_company_request(uuid, text) to authenticated;
grant execute on function public.submit_company_request(uuid) to authenticated;
grant execute on function public.request_company_clarification(uuid, text) to authenticated;
grant execute on function public.decide_company_request(uuid, boolean, text) to authenticated;
