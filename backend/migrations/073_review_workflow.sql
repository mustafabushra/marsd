-- Migration: 073_review_workflow.sql
-- Purpose: a company's review has states, reasons, and a workflow that cannot be
--          skipped — enforced here, not by whichever screen happens to be open.
--
-- ============================================================================
-- What exists today
-- ============================================================================
-- companies.status carries pending / approved / active, and every one of the 31
-- rows is 'active'. Whether a company is genuinely reviewed, waiting on a
-- document, or was suspended for missing information is not recorded anywhere,
-- and neither is who decided or why. The admin screens show "نشط" for all of it.
--
-- The rules below live in the database because a workflow guarded only by a
-- screen is a workflow that ends at the first direct request. "Cannot approve
-- while awaiting clarification" has to be true of the table, or it is only true
-- of the button.
--
-- companies.status is left alone. It is read in several places and means
-- "operating", which is a different question from "where is this in review".
-- Overloading one column with both is how the current confusion started.

-- ============================================================================
-- 1) The review state, its reason, and who set it
-- ============================================================================
alter table public.companies
  add column if not exists review_status        varchar(30) not null default 'approved',
  add column if not exists review_reason        text,
  add column if not exists review_status_at     timestamptz default now(),
  add column if not exists review_status_by     text;

do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_review_status_check') then
    alter table public.companies
      add constraint companies_review_status_check check (review_status in (
        'under_review',        -- قيد المراجعة
        'awaiting_verification',-- بانتظار التحقق
        'clarification_needed', -- مطلوب توضيح
        'awaiting_documents',   -- بانتظار مستندات
        'clarification_received',-- تم استلام التوضيح
        'suspended_incomplete', -- موقوفة لنقص المعلومات
        'rejected',             -- مرفوضة
        'approved',             -- معتمدة
        'frozen',               -- مجمدة
        'on_hold'));            -- موقوفة مؤقتاً
  end if;
end $blk$;

comment on column public.companies.review_status is
  'موضع الشركة في سير المراجعة — منفصل عن status الذي يعني «تعمل أو لا»';
comment on column public.companies.review_reason is
  'سبب الحالة الحالية — إلزامي لكل حالة ليست «معتمدة»';

create index if not exists idx_companies_review_status on public.companies (review_status)
  where review_status <> 'approved';

-- Existing rows describe reality: approved and operating.
update public.companies
   set review_status = case when approved then 'approved' else 'under_review' end,
       review_status_at = coalesce(review_status_at, created_at)
 where review_status is null or review_status = 'approved';

-- ============================================================================
-- 2) The workflow, enforced
-- ============================================================================
-- A state that anything can move to from anywhere is not a workflow. The two
-- rules that matter:
--
--   Nothing leaves clarification_needed except by the company answering. An
--   approval or rejection issued while a question is outstanding is a decision
--   made without the answer that was asked for.
--
--   Every state that is not 'approved' carries a reason. A company told it is
--   "موقوفة" with no reason cannot act, and an administrator reading it later
--   cannot either.

create or replace function public.guard_review_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_from text := coalesce(old.review_status, 'approved');
  v_to   text := coalesce(new.review_status, 'approved');
begin
  if v_from = v_to then
    return new;
  end if;

  -- A company never sets its own review state.
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and public.get_current_user_id() is not null then
    raise exception 'حالة المراجعة تُغيّرها إدارة مرصد فقط';
  end if;

  if v_to <> 'approved' and coalesce(trim(new.review_reason), '') = '' then
    raise exception 'الحالة «%» تحتاج سبباً يُعرض على الشركة', v_to;
  end if;

  -- The suspension the whole request is about: while a clarification is
  -- outstanding the file does not move, in either direction.
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

drop trigger if exists trg_guard_review_status on public.companies;
create trigger trg_guard_review_status
  before update on public.companies
  for each row execute function public.guard_review_status();

-- Every transition is recorded, without the caller having to remember to.
create or replace function public.log_review_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.company_audit_log
      (company_id, action, actor_id, old_values, new_values, change_reason)
    values (new.id, 'review_status_changed', public.get_current_user_id(),
            jsonb_build_object('review_status', old.review_status),
            jsonb_build_object('review_status', new.review_status),
            new.review_reason);
  end if;
  return null;
end $fn$;

drop trigger if exists trg_log_review_status on public.companies;
create trigger trg_log_review_status
  after update on public.companies
  for each row execute function public.log_review_status();

-- ============================================================================
-- 3) Clarification requests, and the answers to them
-- ============================================================================
create table if not exists public.clarification_requests (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  request_type   varchar(30) not null default 'information',
  reason         text not null,
  details        text,
  documents_requested text[],
  due_at         timestamptz,
  status         varchar(20) not null default 'open',
  requested_by   text,
  requested_at   timestamptz not null default now(),
  responded_at   timestamptz,
  closed_at      timestamptz,

  constraint clarification_type_check check (request_type in (
    'information', 'documents', 'correction', 'verification')),
  constraint clarification_status_check check (status in (
    'open', 'answered', 'closed', 'expired')),
  -- The reason is mandatory in the table, not only in the modal. A screen that
  -- requires it is one screen; a company asked to explain itself with no
  -- question stated cannot answer, whichever path created the row.
  constraint clarification_reason_present check (length(trim(reason)) > 0)
);

comment on table public.clarification_requests is
  'طلبات التوضيح من إدارة مرصد إلى الشركة — والردود عليها';

create index if not exists idx_clarification_company on public.clarification_requests (company_id);
create index if not exists idx_clarification_open on public.clarification_requests (status)
  where status = 'open';

create table if not exists public.clarification_messages (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.clarification_requests(id) on delete cascade,
  body        text not null,
  from_marsad boolean not null default false,
  author_id   text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_clarification_messages on public.clarification_messages (request_id, created_at);

alter table public.clarification_requests enable row level security;
alter table public.clarification_messages enable row level security;

-- The company reads what was asked of it; Marsad reads everything.
drop policy if exists clarification_select on public.clarification_requests;
create policy clarification_select on public.clarification_requests
  for select to authenticated
  using (
    coalesce(public.is_platform_admin() or public.is_reviewer(), false)
    or company_id = (select company_id from public.tenants
                      where id = public.get_current_tenant_id())
  );

drop policy if exists clarification_write on public.clarification_requests;
create policy clarification_write on public.clarification_requests
  for all to authenticated
  using (coalesce(public.is_platform_admin() or public.is_reviewer(), false))
  with check (coalesce(public.is_platform_admin() or public.is_reviewer(), false));

drop policy if exists clarification_msg_select on public.clarification_messages;
create policy clarification_msg_select on public.clarification_messages
  for select to authenticated
  using (exists (
    select 1 from public.clarification_requests r
     where r.id = request_id
       and (coalesce(public.is_platform_admin() or public.is_reviewer(), false)
            or r.company_id = (select company_id from public.tenants
                                where id = public.get_current_tenant_id()))));

-- Both sides may write a message; from_marsad is not the writer's to claim.
drop policy if exists clarification_msg_insert on public.clarification_messages;
create policy clarification_msg_insert on public.clarification_messages
  for insert to authenticated
  with check (exists (
    select 1 from public.clarification_requests r
     where r.id = request_id
       and (coalesce(public.is_platform_admin() or public.is_reviewer(), false)
            or r.company_id = (select company_id from public.tenants
                                where id = public.get_current_tenant_id()))));

create or replace function public.stamp_clarification_message()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.author_id   := coalesce(new.author_id, public.get_current_user_id());
  new.from_marsad := coalesce(public.is_platform_admin() or public.is_reviewer(), false);
  return new;
end $fn$;

drop trigger if exists trg_stamp_clarification_message on public.clarification_messages;
create trigger trg_stamp_clarification_message
  before insert on public.clarification_messages
  for each row execute function public.stamp_clarification_message();

-- ============================================================================
-- 4) Asking, and answering
-- ============================================================================
create or replace function public.request_clarification(
  p_company_id uuid,
  p_reason     text,
  p_details    text default null,
  p_type       text default 'information',
  p_documents  text[] default null,
  p_due_days   integer default 14
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_id uuid;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return jsonb_build_object('ok', false, 'reason', 'طلب التوضيح لإدارة مرصد فقط');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'سبب طلب التوضيح مطلوب');
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

  return jsonb_build_object('ok', true, 'request_id', v_id);
end $fn$;

grant execute on function public.request_clarification(uuid, text, text, text, text[], integer) to authenticated;

create or replace function public.answer_clarification(
  p_request_id uuid,
  p_body       text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare r public.clarification_requests;
begin
  select * into r from public.clarification_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الطلب غير موجود');
  end if;
  if coalesce(trim(p_body), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'اكتب التوضيح قبل الإرسال');
  end if;
  if r.company_id is distinct from (select company_id from public.tenants
                                     where id = public.get_current_tenant_id()) then
    return jsonb_build_object('ok', false, 'reason', 'هذا الطلب ليس على شركتك');
  end if;

  insert into public.clarification_messages (request_id, body) values (p_request_id, trim(p_body));

  update public.clarification_requests
     set status = 'answered', responded_at = now()
   where id = p_request_id;

  -- Answered, so the file moves on — to received, and from there a reviewer
  -- returns it to review. It does not jump straight back into the queue, because
  -- somebody has to read the answer.
  update public.companies
     set review_status = 'clarification_received',
         review_reason = 'وصل توضيح الشركة — بانتظار قراءته'
   where id = r.company_id;

  return jsonb_build_object('ok', true);
end $fn$;

grant execute on function public.answer_clarification(uuid, text) to authenticated;

-- ============================================================================
-- 5) Everything about one company, in one call
-- ============================================================================
create or replace function public.company_review_file(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare co record; v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and p_company_id is distinct from (select company_id from public.tenants
                                         where id = public.get_current_tenant_id()) then
    return '{}'::jsonb;
  end if;

  select * into co from public.companies where id = p_company_id;
  if not found then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'company_id',    co.id,
    'name',          co.name,
    'review_status', co.review_status,
    'review_reason', co.review_reason,
    'review_at',     co.review_status_at,
    'review_by',     (select email from public.users where id = co.review_status_by),
    'clarifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'type', r.request_type, 'reason', r.reason,
               'details', r.details, 'documents', r.documents_requested,
               'due_at', r.due_at, 'status', r.status, 'requested_at', r.requested_at,
               'messages', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'body', m.body, 'from_marsad', m.from_marsad, 'at', m.created_at)
                        order by m.created_at)
                   from public.clarification_messages m where m.request_id = r.id), '[]'::jsonb))
             order by r.requested_at desc)
        from public.clarification_requests r where r.company_id = p_company_id), '[]'::jsonb),
    -- The timeline the brief asks for: what happened, who did it, when.
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', l.action, 'at', l.created_at, 'reason', l.change_reason,
               'actor', (select email from public.users where id = l.actor_id),
               'from', l.old_values ->> 'review_status',
               'to',   l.new_values ->> 'review_status')
             order by l.created_at desc)
        from (select * from public.company_audit_log
               where company_id = p_company_id
               order by created_at desc limit 50) l), '[]'::jsonb));
end $fn$;

grant execute on function public.company_review_file(uuid) to authenticated;
revoke all on function public.company_review_file(uuid) from public, anon;

-- ============================================================================
-- 6) Notification types for the new events
-- ============================================================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'report_approved', 'report_rejected', 'report_request_info',
    'company_approved', 'company_rejected', 'company_data_updated',
    'claim_approved', 'claim_rejected',
    'subscription_changed', 'tenant_status_changed',
    'credits_awarded', 'welcome',
    'company_registration_submitted', 'claim_request_submitted',
    'report_submitted', 'dispute_raised', 'document_submitted',
    'document_verified', 'document_rejected', 'official_status_recorded',
    'clarification_requested', 'clarification_answered', 'review_status_changed',
    'score_changed', 'watchlist_alert'
  ));

drop policy if exists notifications_insert_queue on public.notifications;
create policy notifications_insert_queue on public.notifications
  for insert to authenticated
  with check (
    public.get_current_user_id() is not null
    and type in ('company_registration_submitted', 'claim_request_submitted',
                 'report_submitted', 'dispute_raised', 'document_submitted',
                 'clarification_answered')
    and exists (
      select 1 from public.users u
       where u.id = notifications.user_id
         and u.role in ('platform_admin', 'reviewer')
         and u.status = 'active')
  );

-- ============================================================================
-- 7) Verify by driving the workflow
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_co    uuid;
  v jsonb;
  v_ok boolean := false;
  v_status text;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_co from public.companies where approved limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- A reason is mandatory.
  begin
    update public.companies set review_status = 'on_hold' where id = v_co;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'حالة بلا سبب قُبلت'; end if;

  v := public.request_clarification(v_co, 'ناقص العنوان الوطني', 'أرفق وثيقة العنوان', 'documents',
                                    array['national_address'], 14);
  if not (v ->> 'ok')::boolean then
    raise exception 'طلب التوضيح فشل: %', v ->> 'reason';
  end if;

  select review_status into v_status from public.companies where id = v_co;
  if v_status <> 'awaiting_documents' then
    raise exception 'الحالة بعد الطلب % والمتوقّع awaiting_documents', v_status;
  end if;

  -- And the file must refuse to move while the question is open.
  v_ok := false;
  begin
    update public.companies set review_status = 'approved' where id = v_co;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'اعتُمدت الشركة وطلب التوضيح ما زال مفتوحاً'; end if;

  -- Undo everything this check created.
  delete from public.clarification_requests where company_id = v_co;
  update public.companies set review_status = 'clarification_received',
         review_reason = 'probe' where id = v_co;
  update public.companies set review_status = 'approved' where id = v_co;
  delete from public.company_audit_log
   where company_id = v_co and action = 'review_status_changed'
     and created_at > now() - interval '1 minute';

  raise notice '✅ السبب إلزامي · الطلب يوقف السير · الاعتماد مرفوض حتى الردّ';
end $blk$;
