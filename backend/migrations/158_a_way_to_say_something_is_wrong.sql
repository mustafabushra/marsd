-- A way to say something is wrong
-- ============================================================================
--
-- There was none. A company that hit a broken screen, a wrong figure on its own
-- file, or a payment that did not register had no route to Marsad inside the
-- product — the only paths out were the report form, which is for reporting
-- *other companies* and lands in a review queue, and the clarification thread,
-- which only Marsad can open. Someone whose subscription failed to activate had
-- to find an email address.
--
-- So: a ticket, its attachments, and the one call that creates both.
--
-- ============================================================================
-- Why attachments matter here specifically
-- ============================================================================
-- «It does not work» is not actionable and a screenshot is. The people
-- reporting these are looking at something we cannot see, and the cheapest way
-- to carry that across is to let them hand over the picture. The limits match
-- report evidence exactly — five files, ten megabytes, PDF and images — because
-- a second set of rules for the same act of attaching a file is a second set to
-- keep in step.
--
-- ============================================================================
-- Who may read one
-- ============================================================================
-- The person who opened it, anyone else in their company, and Marsad. A ticket
-- can quote an invoice or a screenshot with account details in it, so it is not
-- public and it is not cross-tenant. Marsad reads every ticket because Marsad
-- is who answers them.

-- ============================================================================
-- The ticket
-- ============================================================================

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete set null,
  created_by   text not null,
  kind         text not null,
  details      text not null,
  status       text not null default 'open',
  -- Where they were standing when it broke. Filled by the client, so it is
  -- treated as a hint and never as a fact — but «which screen» is the first
  -- question anyone would ask, and this saves the round trip.
  page_url     text,
  user_agent   text,
  resolved_at  timestamptz,
  resolved_by  text,
  resolution   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint support_tickets_kind_ck
    check (kind in ('technical', 'data', 'billing', 'suggestion', 'other')),
  constraint support_tickets_status_ck
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  -- A ticket with nothing in it cannot be answered.
  constraint support_tickets_details_ck
    check (length(btrim(details)) between 10 and 4000)
);

create index if not exists support_tickets_tenant_idx
  on public.support_tickets (tenant_id, created_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_creator_idx
  on public.support_tickets (created_by, created_at desc);

-- ============================================================================
-- Its attachments
-- ============================================================================

create table if not exists public.support_ticket_attachments (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  s3_key      text not null unique,
  file_name   text not null,
  mime_type   text,
  file_size   bigint,
  uploaded_by text,
  created_at  timestamptz not null default now()
);

create index if not exists support_ticket_attachments_ticket_idx
  on public.support_ticket_attachments (ticket_id);

-- ============================================================================
-- The bucket
-- ============================================================================
-- Private. These carry screenshots of whatever the person had on screen, which
-- is routinely their own account.

insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.support_tickets            enable row level security;
alter table public.support_ticket_attachments enable row level security;

-- Readable by its author, their colleagues, and Marsad.
drop policy if exists support_tickets_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets
  for select to authenticated
  using (
    created_by = public.get_current_user_id()
    or (tenant_id is not null and tenant_id = (
      select u.tenant_id from public.users u where u.id = public.get_current_user_id()))
    or coalesce(public.has_permission('platform.admin'), false)
  );

-- Written through the RPC below, which is what stamps the tenant and the
-- author. Direct inserts are not offered: a client that sets its own
-- created_by can open a ticket in somebody else's name.
drop policy if exists support_tickets_write on public.support_tickets;
create policy support_tickets_write on public.support_tickets
  for update to authenticated
  using (coalesce(public.has_permission('platform.admin'), false))
  with check (coalesce(public.has_permission('platform.admin'), false));

drop policy if exists support_attachments_read on public.support_ticket_attachments;
create policy support_attachments_read on public.support_ticket_attachments
  for select to authenticated
  using (exists (
    select 1 from public.support_tickets t
     where t.id = ticket_id
       and (t.created_by = public.get_current_user_id()
            or (t.tenant_id is not null and t.tenant_id = (
              select u.tenant_id from public.users u where u.id = public.get_current_user_id()))
            or coalesce(public.has_permission('platform.admin'), false))));

-- Only onto a ticket you just opened, and only by you. The row points at an
-- object in the bucket; letting anyone attach to anyone's ticket would let them
-- plant a file in a conversation they are not part of.
drop policy if exists support_attachments_insert on public.support_ticket_attachments;
create policy support_attachments_insert on public.support_ticket_attachments
  for insert to authenticated
  with check (exists (
    select 1 from public.support_tickets t
     where t.id = ticket_id
       and t.created_by = public.get_current_user_id()));

-- ============================================================================
-- Storage policies
-- ============================================================================
-- The first path segment is the ticket id, so ownership is decided by looking
-- the ticket up rather than by trusting the name of the file.

drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and exists (
      select 1 from public.support_tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.created_by = public.get_current_user_id())
  );

drop policy if exists support_files_read on storage.objects;
create policy support_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and exists (
      select 1 from public.support_tickets t
       where t.id::text = split_part(name, '/', 1)
         and (t.created_by = public.get_current_user_id()
              or (t.tenant_id is not null and t.tenant_id = (
                select u.tenant_id from public.users u where u.id = public.get_current_user_id()))
              or coalesce(public.has_permission('platform.admin'), false)))
  );

-- ============================================================================
-- Opening one
-- ============================================================================
--
-- The tenant and the author are stamped here rather than sent by the browser.
-- A ticket is a claim about who is having the problem, and a client that names
-- itself can name somebody else.

create or replace function public.submit_support_ticket(
  p_kind      text,
  p_details   text,
  p_page_url  text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me     text := public.get_current_user_id();
  v_tenant uuid;
  v_id     uuid;
  v_recent int;
begin
  if v_me is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  if p_kind is null or p_kind not in ('technical','data','billing','suggestion','other') then
    raise exception 'نوع البلاغ غير معروف';
  end if;

  if p_details is null or length(btrim(p_details)) < 10 then
    raise exception 'اكتب وصفاً لا يقلّ عن ١٠ أحرف حتى نتمكّن من المتابعة';
  end if;

  -- A stuck submit button or an impatient double click should not open five
  -- tickets. Five in an hour is far above anyone reporting a real problem and
  -- far below what a loop would produce.
  select count(*) into v_recent
    from public.support_tickets
   where created_by = v_me and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'وصلتنا عدّة بلاغات منك خلال الساعة الماضية — سنعود إليك قبل استقبال المزيد';
  end if;

  select u.tenant_id into v_tenant from public.users u where u.id = v_me;

  insert into public.support_tickets (tenant_id, created_by, kind, details, page_url, user_agent)
  values (v_tenant, v_me, p_kind, btrim(p_details),
          nullif(btrim(coalesce(p_page_url, '')), ''),
          left(nullif(btrim(coalesce(p_user_agent, '')), ''), 400))
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.submit_support_ticket(text, text, text, text) from anon, public;
grant execute on function public.submit_support_ticket(text, text, text, text) to authenticated;

grant select on public.support_tickets            to authenticated;
grant select, insert on public.support_ticket_attachments to authenticated;
grant update on public.support_tickets            to authenticated;
