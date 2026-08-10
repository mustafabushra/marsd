-- The sweep runs itself
-- ============================================================================
--
-- Reclaim exists but only a person could start it, which means a registration
-- number stays stuck until somebody notices and asks — and nobody notices,
-- because the person it blocks is outside the company and gave up.
--
-- pg_cron rather than an HTTP scheduler: the sweep is already a database
-- function. Calling it over the network would mean an endpoint to guard, a
-- secret to hold, and a deployment that has to stay alive — for nothing that
-- running it in place does not already give.
--
-- ============================================================================
-- Why the existing function could not simply be scheduled
-- ============================================================================
-- `expire_abandoned_registrations` demands `is_platform_admin()`. A cron job
-- has no JWT, so `get_current_user_id()` is null and the check refuses. The
-- authority test and the work are therefore separated: one internal function
-- does the work, and the two callers each prove their own right to ask for it.
--
-- The internal one is executable by nobody. Not `anon`, not `authenticated` —
-- it is reachable only from the two wrappers and from the scheduler, which runs
-- as the database owner.

create extension if not exists pg_cron;

/**
 * The reclaim itself, with no opinion about who is asking.
 *
 * `p_actor` is recorded rather than derived, because the two callers know
 * different things: a staff member has an id, and the sweep has none and must
 * say so instead of leaving the field empty and looking like a lost record.
 */
create or replace function public.reclaim_registration_internal(
  p_company_id uuid,
  p_actor      text default null,
  p_days       int  default 7
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  co       public.companies;
  v_tenant uuid;
  v_reason text;
begin
  select * into co from public.companies where id = p_company_id for update;
  if co.id is null then
    return false;
  end if;

  -- Live, approved or rejected companies are somebody's answer. Only an
  -- untouched `pending` shell is reclaimable.
  if co.status <> 'pending' then
    return false;
  end if;

  -- Anything ever sent to Marsad makes this a real attempt, not an abandoned
  -- one — including one sent and still waiting on a reviewer.
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

  if co.created_at > now() - make_interval(days => greatest(coalesce(p_days, 7), 1)) then
    return false;
  end if;

  v_reason := format('مهجور أكثر من %s أيام — استُرد رقم السجل', greatest(coalesce(p_days, 7), 1));
  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id limit 1;

  -- Closed, not deleted. The history of the attempt is what explains, later,
  -- why this number changed hands.
  update public.company_requests
     set status = 'withdrawn', withdraw_reason = v_reason,
         reviewed_at = now(), updated_at = now()
   where company_id = p_company_id and status = 'draft';

  insert into public.company_request_events (request_id, actor_id, event, from_status, to_status, note)
  select r.id, null, 'withdrawn', 'draft', 'withdrawn', v_reason
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
  -- `tenants.cr_number` is unique and NOT NULL too, so detaching the company is
  -- not enough — the dead account would go on holding the number. The column is
  -- varchar(20), so the original cannot be kept as a prefix; it stays readable
  -- on the company row and in the audit entry below.
  if v_tenant is not null then
    update public.tenants
       set company_id = null, status = 'inactive',
           cr_number  = 'مهجور-' || left(replace(v_tenant::text, '-', ''), 12)
     where id = v_tenant;
  end if;

  -- What was released, and by whom. Written here rather than by each caller so
  -- a reclaim cannot happen without a record of it.
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (
    p_actor,
    case when p_actor is null then 'system/cleanup' else 'platform_admin' end,
    'registration_number_reclaimed',
    'company',
    p_company_id::text,
    jsonb_build_object(
      'cr_number',       co.cr_number,
      'company_id',      p_company_id,
      'company_name',    co.name,
      'released_tenant', v_tenant,
      'abandoned_since', co.created_at,
      'threshold_days',  greatest(coalesce(p_days, 7), 1),
      'source',          case when p_actor is null then 'system/cleanup' else 'admin' end,
      'at',              now()
    )
  );

  return true;
end;
$fn$;

/** A staff member releasing one number by hand. */
create or replace function public.reclaim_abandoned_registration(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'استرداد رقم السجل من صلاحيات مسؤول المنصة';
  end if;
  return public.reclaim_registration_internal(p_company_id, public.get_current_user_id(), 7);
end;
$fn$;

/** A staff member sweeping. */
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

  for r in select * from public.abandoned_registration_candidates(p_days) loop
    if public.reclaim_registration_internal(r.id, public.get_current_user_id(), p_days) then
      company_id := r.id; company_name := r.name; cr_number := r.cr_number;
      return next;
    end if;
  end loop;
end;
$fn$;

/**
 * Who is holding a number they never used.
 *
 * Split out so the scheduled sweep and the manual one cannot drift apart in
 * what they consider abandoned — two copies of this condition is two answers.
 */
create or replace function public.abandoned_registration_candidates(p_days int default 7)
returns table (id uuid, name text, cr_number text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.id, c.name::text, c.cr_number::text, c.created_at
    from public.companies c
   where c.status = 'pending'
     and c.created_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
     and exists (select 1 from public.tenants t where t.company_id = c.id)
     and not exists (
       select 1 from public.company_requests q
        where q.company_id = c.id
          and (q.submitted_at is not null or q.status <> 'draft'));
$fn$;

/**
 * The scheduled sweep.
 *
 * Executable by no application role. pg_cron runs it as the database owner,
 * and nothing else can reach it — which is what lets it skip the admin check
 * without that being a way in.
 */
create or replace function public.cron_expire_abandoned_registrations()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r       record;
  v_count int := 0;
begin
  for r in select * from public.abandoned_registration_candidates(7) loop
    if public.reclaim_registration_internal(r.id, null, 7) then
      v_count := v_count + 1;
    end if;
  end loop;

  -- A run that freed nothing is still a run. Without this line, «the sweep is
  -- working» and «the sweep has not fired since March» look identical.
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (null, 'system/cleanup', 'registration_cleanup_ran', 'system', null,
          jsonb_build_object('released', v_count, 'threshold_days', 7, 'at', now()));

  return v_count;
end;
$fn$;

revoke all on function public.reclaim_registration_internal(uuid, text, int) from anon, authenticated, public;
revoke all on function public.cron_expire_abandoned_registrations() from anon, authenticated, public;
revoke all on function public.abandoned_registration_candidates(int) from anon, public;
grant execute on function public.abandoned_registration_candidates(int) to authenticated;

-- Every night at 03:15 Riyadh (00:15 UTC). Quiet hours, and far from the
-- daily snapshot windows.
select cron.unschedule('marsad-reclaim-abandoned-registrations')
 where exists (select 1 from cron.job where jobname = 'marsad-reclaim-abandoned-registrations');

select cron.schedule(
  'marsad-reclaim-abandoned-registrations',
  '15 0 * * *',
  $cron$ select public.cron_expire_abandoned_registrations(); $cron$
);
