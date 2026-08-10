-- The flag follows the status
-- ============================================================================
--
--   approved       DEFAULT true
--   review_status  DEFAULT 'approved'  NOT NULL
--
-- Every company row was born approved. A row created with defaults alone was a
-- company nobody had reviewed, marked as reviewed, and — until the previous
-- migration — discoverable.
--
-- Changing the defaults is not enough on its own: it leaves three columns that
-- can still be written into disagreement by any caller who sets one and forgets
-- the others. So the two deprecated columns are derived instead, by a trigger,
-- from the one column that owns the answer. A caller that passes something else
-- has it corrected rather than honoured.
--
-- This is the safe half of «make them generated columns». A generated column
-- makes every existing writer throw; a trigger makes every existing writer
-- correct. The throw comes later, once a full cycle has proved nothing writes
-- them on purpose.

alter table public.companies
  alter column approved      set default false,
  alter column review_status set default 'under_review';

/**
 * `approved` and `review_status` are shadows of `status` now.
 *
 * On insert always, and on update only when `status` itself moved — so an
 * ordinary profile save does not silently rewrite a review state, and the
 * guards above still see the change they are there to judge.
 */
create or replace function public.sync_deprecated_company_state()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  new.approved := (new.status = 'active');

  new.review_status := case
    when new.status = 'active'   then 'approved'
    when new.status = 'rejected' then 'rejected'
    when new.status = 'suspended' then 'suspended_incomplete'
    else 'under_review'
  end;

  return new;
end;
$fn$;

-- Named to sort after `trg_guard_*`: BEFORE triggers fire in alphabetical
-- order, and the guards must judge the change the caller actually made before
-- anything derived is written on top of it.
drop trigger if exists trg_sync_deprecated_state on public.companies;
create trigger trg_sync_deprecated_state
  before insert or update on public.companies
  for each row execute function public.sync_deprecated_company_state();

-- Bring the existing rows into line. Zero disagreements today; this is what
-- keeps it zero.
update public.companies
   set approved = (status = 'active')
 where approved is distinct from (status = 'active');

-- ============================================================================
-- A registration nobody finished must not hold a registration number forever
-- ============================================================================
--
-- `companies.cr_number` is unique, and a half-finished registration creates the
-- company *and* the account. So whoever types a registration number first owns
-- it — and the real holder of that number is refused with «رقم السجل مسجّل
-- بالفعل لشركة أخرى» and has no way through but a support ticket.
--
-- Reclaim is deliberately narrow. It only touches an attempt that never sent
-- anything: no request was ever submitted, the company never left `pending`,
-- and it has sat that way for a week. The abandoned account is not deleted —
-- it is detached from the company and its draft is closed, so the person can
-- still sign in and start again.
--
-- ============================================================================
-- Why this does not run inside the newcomer's registration
-- ============================================================================
-- The first version did, and `guard_tenant_admin_columns` refused it — rightly.
-- Detaching somebody's account from a company is an administrative act, and
-- doing it as a side effect of a stranger's sign-up is an administrative act
-- with no administrator behind it.
--
-- The obvious workaround is a transaction-local flag the guards honour. It is
-- not safe: `set_config` is callable by any client, so a company account could
-- raise the same flag and then detach whatever it liked. A guard that can be
-- switched off by the party it guards against is not a guard.
--
-- So reclaim is staff-authorised, and runs as a sweep. Registration does not
-- perform it — it recognises the situation and says something the person can
-- act on, instead of «this number belongs to another company», which is false
-- and leads nowhere.

create or replace function public.reclaim_abandoned_registration(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  co       public.companies;
  v_days   int := 7;
  v_tenant uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'استرداد رقم السجل من صلاحيات مسؤول المنصة';
  end if;

  select * into co from public.companies where id = p_company_id for update;
  if co.id is null then
    return false;
  end if;

  -- Live, approved, or rejected companies are somebody's answer. Only an
  -- untouched `pending` shell is reclaimable.
  if co.status <> 'pending' then
    return false;
  end if;

  -- Anything ever sent to Marsad makes this a real attempt, not an abandoned
  -- one — including one that was sent and is waiting on a reviewer.
  if exists (
    select 1 from public.company_requests r
     where r.company_id = p_company_id
       and (r.submitted_at is not null or r.status <> 'draft')
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.registration_requests rr
     where rr.company_id = p_company_id and rr.status <> 'pending'
  ) then
    return false;
  end if;

  if co.created_at > now() - make_interval(days => v_days) then
    return false;
  end if;

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id limit 1;

  -- Close the draft rather than delete it: the history of the attempt is what
  -- explains, later, why this number changed hands.
  update public.company_requests
     set status = 'withdrawn',
         withdraw_reason = format('مهجور أكثر من %s أيام — استُرد رقم السجل', v_days),
         reviewed_at = now(),
         updated_at = now()
   where company_id = p_company_id and status = 'draft';

  insert into public.company_request_events (request_id, actor_id, event, from_status, to_status, note)
  select r.id, null, 'withdrawn', 'draft', 'withdrawn',
         format('مهجور أكثر من %s أيام — استُرد رقم السجل', v_days)
    from public.company_requests r
   where r.company_id = p_company_id and r.status = 'withdrawn'
     and not exists (select 1 from public.company_request_events e
                      where e.request_id = r.id and e.event = 'withdrawn');

  update public.registration_requests
     set status = 'expired', updated_at = now()
   where company_id = p_company_id and status = 'pending';

  -- The account survives, detached. Deleting it would take a person's sign-in
  -- away to solve a registration-number collision.
  --
  -- `tenants.cr_number` is unique and NOT NULL as well, so detaching the
  -- company is not enough: the abandoned account would still be holding the
  -- number on its own row and the next registration fails on
  -- `tenants_cr_number_key`. Releasing the company means releasing both.
  -- The column is varchar(20), so the released number cannot be kept as a
  -- prefix. The original stays readable on the company row and in the audit
  -- log; this only has to be unique and obviously dead.
  if v_tenant is not null then
    update public.tenants
       set company_id = null,
           status     = 'inactive',
           cr_number  = 'مهجور-' || left(replace(v_tenant::text, '-', ''), 12)
     where id = v_tenant;
  end if;

  return true;
end;
$fn$;

/**
 * Release every registration number held by an attempt nobody finished.
 *
 * Staff-run, and safe to run repeatedly. Meant for a schedule — until one is
 * wired, a real holder blocked by an abandoned shell is unblocked by an
 * administrator running this, and the message they were given says so.
 */
create or replace function public.expire_abandoned_registrations(p_days int default 7)
returns table (company_id uuid, company_name text, cr_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'هذا الإجراء لمسؤول المنصة';
  end if;

  for r in
    select c.id, c.name, c.cr_number
      from public.companies c
     where c.status = 'pending'
       and c.created_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
       and exists (select 1 from public.tenants t where t.company_id = c.id)
       and not exists (
         select 1 from public.company_requests q
          where q.company_id = c.id
            and (q.submitted_at is not null or q.status <> 'draft'))
  loop
    if public.reclaim_abandoned_registration(r.id) then
      company_id := r.id; company_name := r.name; cr_number := r.cr_number;
      return next;
    end if;
  end loop;
end;
$fn$;

/**
 * Is this registration number held by an attempt nobody finished?
 *
 * Read-only, and callable by the person who has just been refused — it decides
 * only which of two messages they see, and reveals nothing beyond «that number
 * is stuck», which they already know.
 */
create or replace function public.cr_number_is_abandoned(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.status = 'pending'
     and c.created_at < now() - interval '7 days'
     and not exists (
       select 1 from public.company_requests q
        where q.company_id = c.id
          and (q.submitted_at is not null or q.status <> 'draft'))
    from public.companies c
   where c.id = p_company_id;
$fn$;

/**
 * Registration. The collision it cannot resolve, it explains.
 */
create or replace function public.register_company_for_current_user(
  p_name           text,
  p_cr_number      text,
  p_email          text,
  p_phone          text default null,
  p_city           text default null,
  p_sector         text default null,
  p_unified_number text default null,
  p_cr_file_url    text default null,
  p_founded_year   int  default null
)
returns table (company_id uuid, tenant_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user     text := public.get_current_user_id();
  v_company  uuid;
  v_tenant   uuid;
  v_existing uuid;
  v_request  uuid;
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'اسم الشركة مطلوب';
  end if;
  if coalesce(btrim(p_cr_number), '') = '' then
    raise exception 'رقم السجل التجاري مطلوب';
  end if;
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'البريد الإلكتروني مطلوب';
  end if;

  select t.company_id, t.id into v_company, v_tenant
    from public.users u join public.tenants t on t.id = u.tenant_id
   where u.id = v_user;

  if v_tenant is not null and v_company is not null then
    select r.id into v_request
      from public.company_requests r
     where r.company_id = v_company and r.kind = 'registration'
       and r.status in ('draft', 'clarification_needed')
     order by r.created_at desc limit 1;
    return query select v_company, v_tenant, v_request;
    return;
  end if;

  select c.id into v_existing
    from public.companies c where c.cr_number = btrim(p_cr_number) limit 1;

  if v_existing is not null then
    if exists (select 1 from public.tenants t where t.company_id = v_existing) then
      -- «مسجّل لشركة أخرى» is false when the holder is a sign-up somebody
      -- abandoned, and it leaves the real holder of the number with nowhere to
      -- go. Two situations, two messages.
      if coalesce(public.cr_number_is_abandoned(v_existing), false) then
        raise exception 'رقم السجل محجوز بتسجيل لم يكتمل — تواصل مع مرصد لاسترداده';
      end if;
      raise exception 'رقم السجل مسجّل بالفعل لشركة أخرى';
    end if;
    v_company := v_existing;

    update public.companies
       set official_email = coalesce(p_email, official_email),
           city = coalesce(p_city, city),
           sector = coalesce(p_sector, sector),
           unified_number = coalesce(p_unified_number, unified_number),
           cr_file_url = coalesce(p_cr_file_url, cr_file_url)
     where id = v_company;
  else
    insert into public.companies (
      name, cr_number, unified_number, official_email, city, sector,
      founded_year, cr_file_url, source, status
    ) values (
      p_name, btrim(p_cr_number), p_unified_number, p_email, p_city, p_sector,
      p_founded_year, p_cr_file_url, 'community', 'pending'
    )
    returning id into v_company;
  end if;

  if exists (select 1 from public.tenants t where lower(t.email) = lower(btrim(p_email))) then
    raise exception 'هذا البريد مستخدم في حساب شركة آخر';
  end if;

  insert into public.tenants (name, cr_number, email, phone, city, sector, company_id, status)
  values (p_name, btrim(p_cr_number), p_email, p_phone, p_city, p_sector, v_company, 'active')
  returning id into v_tenant;

  update public.users
     set tenant_id = v_tenant, role = 'company_admin', status = 'active'
   where id = v_user;

  insert into public.company_requests (company_id, tenant_id, requested_by, kind, status)
  values (v_company, v_tenant, v_user, 'registration', 'draft')
  returning id into v_request;

  insert into public.company_request_events (request_id, actor_id, event, to_status)
  values (v_request, v_user, 'created', 'draft');

  insert into public.registration_requests (company_id, tenant_id, user_id, cr_document_url, status)
  values (v_company, v_tenant, v_user, p_cr_file_url, 'pending');

  return query select v_company, v_tenant, v_request;
end;
$fn$;

revoke all on function public.reclaim_abandoned_registration(uuid) from anon, public;
revoke all on function public.expire_abandoned_registrations(int) from anon, public;
revoke all on function public.cr_number_is_abandoned(uuid) from anon, public;
grant execute on function public.reclaim_abandoned_registration(uuid) to authenticated;
grant execute on function public.expire_abandoned_registrations(int) to authenticated;
grant execute on function public.cr_number_is_abandoned(uuid) to authenticated;
