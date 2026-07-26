-- Migration: 027_business_requests.sql
-- Purpose: make طلبات الأعمال a feature instead of a screen.
--
-- The table has never held a row, and could not have. Nothing in the product
-- sends a request — the page reads two lists and offers no way to create one, so
-- "المرسلة" was always empty by construction. What it did offer was broken in
-- four separate ways, each invisible:
--
--   · Reject wrote status 'rejected'. The CHECK allows 'declined'. Every rejection
--     violated the constraint, the error was not read, and the card turned red on
--     screen while the row stayed pending.
--   · Accept and reject are restricted to tenant admins by RLS. A member pressing
--     accept changed nothing and was told it worked.
--   · The card read r.description; the column is body. The message was always
--     blank.
--   · tenants is readable only to its own members, so the counterparty's name is
--     unreachable. The card printed the subject where the sender's name goes and
--     labelled it "مستقبل من:".
--
-- Naming the other party is the thing this feature is for, and it cannot be done
-- by widening the tenants policy: a company would then be able to enumerate every
-- company on Marsad. list_business_requests returns the joined rows for the caller
-- only, which reveals the name of someone who has already written to you or been
-- written to — a fact you necessarily know.
--
-- Idempotent.

-- ============================================================================
-- 1) A request must go somewhere, and only once
-- ============================================================================

alter table public.business_requests
  drop constraint if exists business_requests_not_self;
alter table public.business_requests
  add constraint business_requests_not_self check (from_tenant_id <> to_tenant_id);

-- One open request between two parties. Without this a company can bury another
-- under identical requests, and the recipient has no way to refuse the sender.
drop index if exists business_requests_one_open;
create unique index business_requests_one_open
  on public.business_requests (from_tenant_id, to_tenant_id)
  where status = 'pending';

alter table public.business_requests
  alter column expires_at set default (now() + interval '30 days');

create index if not exists business_requests_to_status_idx
  on public.business_requests (to_tenant_id, status, created_at desc);
create index if not exists business_requests_from_status_idx
  on public.business_requests (from_tenant_id, status, created_at desc);

-- ============================================================================
-- 2) Expiry has to actually expire
-- ============================================================================
-- 'expired' is in the CHECK and nothing has ever set it. A date that only decorates
-- the card is not a deadline: without this, a request answered a year late is
-- accepted as though it were answered the same day.

create or replace function public.guard_business_request_answer()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_platform_admin() then
    new.updated_at := now();
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'هذا الطلب سبق الرد عليه';
  end if;

  if now() > old.expires_at and new.status in ('accepted', 'declined') then
    raise exception 'انتهت صلاحية هذا الطلب';
  end if;

  -- The sender does not get to answer on the recipient's behalf, and neither of
  -- them gets to rewrite what was sent. RLS already limits the row to the
  -- recipient; this limits the columns, which RLS cannot.
  if new.from_tenant_id is distinct from old.from_tenant_id
     or new.to_tenant_id is distinct from old.to_tenant_id
     or new.subject is distinct from old.subject
     or new.body is distinct from old.body
     or new.expires_at is distinct from old.expires_at
  then
    raise exception 'لا يمكن تعديل محتوى الطلب';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists business_request_answer_guard on public.business_requests;
create trigger business_request_answer_guard
  before update on public.business_requests
  for each row execute function public.guard_business_request_answer();

-- ============================================================================
-- 3) Reading a request without being able to read every company on Marsad
-- ============================================================================

create or replace function public.list_business_requests()
returns table (
  id uuid,
  direction text,
  counterparty_tenant_id uuid,
  counterparty_name text,
  counterparty_company_id uuid,
  subject text,
  body text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.id,
    case when r.from_tenant_id = public.get_current_tenant_id() then 'sent' else 'received' end,
    other.id,
    other.name::text,
    other.company_id,
    r.subject::text,
    r.body,
    -- A pending request whose date has passed reads as expired even though the
    -- row still says pending. The status column is what was decided; this is what
    -- is true now, and the trigger above makes them agree the moment anyone acts.
    case when r.status = 'pending' and now() > r.expires_at then 'expired' else r.status::text end,
    r.expires_at,
    r.created_at
  from public.business_requests r
  join public.tenants other
    on other.id = case when r.from_tenant_id = public.get_current_tenant_id()
                       then r.to_tenant_id else r.from_tenant_id end
  where public.get_current_tenant_id() is not null
    and (r.from_tenant_id = public.get_current_tenant_id()
      or r.to_tenant_id   = public.get_current_tenant_id())
  order by r.created_at desc
$$;

revoke all on function public.list_business_requests() from public;
grant execute on function public.list_business_requests() to authenticated, service_role;

-- ============================================================================
-- 4) Finding who to write to
-- ============================================================================
-- companies is public; tenants is not. This is the one bridge between them, and
-- it discloses exactly one bit — whether a company has an account on Marsad —
-- which is the bit a sender needs and the recipient has already published by
-- registering.

create or replace function public.tenant_id_for_company(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id
    from public.tenants t
   where t.company_id = p_company_id
     and t.status = 'active'
   limit 1
$$;

revoke all on function public.tenant_id_for_company(uuid) from public;
grant execute on function public.tenant_id_for_company(uuid) to authenticated, service_role;

-- ============================================================================
-- 5) Realtime
-- ============================================================================
-- The dashboards refresh themselves from a subscription; a table not in the
-- publication is a screen that silently stops being live.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'business_requests'
  ) then
    alter publication supabase_realtime add table public.business_requests;
  end if;
end $$;

alter table public.business_requests replica identity full;

do $$
begin
  raise notice 'business_requests: صلاحية، انتهاء، وأسماء الأطراف';
end $$;
