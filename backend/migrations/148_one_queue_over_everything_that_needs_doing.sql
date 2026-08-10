-- One queue over everything that needs doing
-- ============================================================================
--
-- Registration in one screen, documents in another, claims in a third,
-- verification in a fourth, reports in a fifth, disputes in a sixth. Six lists
-- of work, no shared idea of who holds a thing, how long it has waited, or
-- which of them is the one to open first.
--
-- This is the data layer for a single queue: one shape over every kind of work,
-- with a priority nobody types.
--
-- No screen is built here. The functions are what a screen would read.

-- ============================================================================
-- Priority is derived, never entered
-- ============================================================================
-- A field somebody sets by hand drifts: everything becomes urgent, and then
-- nothing is. This reads the facts that already exist — the promise made when
-- the request arrived, and whether the company is in trouble at the Ministry.

create or replace function public.work_priority(
  p_due_at         timestamptz,
  p_response_due   timestamptz,
  p_assigned_at    timestamptz,
  p_official_flag  boolean default false
)
returns text
language sql
immutable
as $fn$
  select case
    -- A company in insolvency or liquidation is a different kind of urgent
    -- from a late queue item, and it outranks the clock.
    when coalesce(p_official_flag, false)                              then 'critical'
    when p_response_due is not null and p_assigned_at is null
         and now() > p_response_due                                    then 'critical'
    when p_due_at is not null and now() > p_due_at                     then 'critical'
    when p_due_at is not null and now() > p_due_at - interval '24 hours' then 'high'
    else 'normal'
  end;
$fn$;

/**
 * Everything that needs a person, in one shape.
 *
 * `p_scope`:
 *   mine          — assigned to the caller
 *   unassigned    — nobody has taken it
 *   late          — past its promise
 *   waiting_them  — the ball is with the company; the clock is stopped
 *   all           — everything open
 *
 * Reports and disputes have no assignment of their own yet, so they come back
 * with a null assignee rather than being left out. A queue that silently omits
 * two of its six kinds is the problem this replaces.
 */
create or replace function public.admin_work_items(
  p_scope text default 'all',
  p_kind  text default null,
  p_limit int  default 100
)
returns table (
  kind          text,
  kind_label    text,
  item_id       uuid,
  company_id    uuid,
  company_name  text,
  title         text,
  status        text,
  status_label  text,
  priority      text,
  assignee      text,
  created_at    timestamptz,
  updated_at    timestamptz,
  due_at        timestamptz,
  sla_state     text,
  waiting_days  int,
  assignable    boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me      text := public.get_current_user_id();
  v_all     boolean := coalesce(public.has_permission('work.view_all'), false);
  v_mine    boolean := coalesce(public.has_permission('work.view_assigned'), false);
  v_reports boolean := coalesce(public.has_permission('reports.review'), false);
  v_disp    boolean := coalesce(public.has_permission('disputes.resolve'), false);
begin
  if not (v_all or v_mine) then
    raise exception 'مركز العمل يحتاج صلاحية';
  end if;

  return query
  with req as (
    select
      r.kind::text                                            as kind,
      case r.kind
        when 'registration'    then 'تسجيل شركة'
        when 'claim'           then 'مطالبة بملكية'
        when 'data_update'     then 'تصحيح بيانات'
        when 'document_review' then 'مراجعة مستندات'
        else r.kind end::text                                 as kind_label,
      r.id, c.id as company_id, c.name::text as company_name,
      c.name::text                                            as title,
      r.status::text,
      case r.status
        when 'draft'                then 'مسودّة'
        when 'submitted'            then 'جديد'
        when 'under_review'         then 'قيد المراجعة'
        when 'clarification_needed' then 'بانتظار الشركة'
        when 'resubmitted'          then 'رُدّ عليه'
        else r.status end::text                               as status_label,
      public.work_priority(
        r.resolution_due_at, r.response_due_at, r.assigned_at,
        coalesce(c.official_status, 'none') <> 'none')        as priority,
      u.email::text                                           as assignee,
      r.assigned_to, r.created_at, r.updated_at,
      r.resolution_due_at                                     as due_at,
      case
        when r.status = 'clarification_needed'                              then 'paused'
        when r.assigned_at is null and r.response_due_at is not null
             and now() > r.response_due_at                                  then 'late_response'
        when r.resolution_due_at is not null and now() > r.resolution_due_at then 'late_resolution'
        when r.resolution_due_at is not null
             and now() > r.resolution_due_at - interval '24 hours'          then 'due_soon'
        else 'ok' end::text                                   as sla_state,
      case when r.submitted_at is null then 0
           else greatest(0, (extract(epoch from now() - r.submitted_at) / 86400)::int)
      end                                                     as waiting_days,
      true                                                    as assignable
    from public.company_requests r
    join public.companies c on c.id = r.company_id
    left join public.users u on u.id = r.assigned_to
   where r.status in ('submitted', 'under_review', 'clarification_needed', 'resubmitted')
  ),
  rep as (
    select 'report_review'::text, 'مراجعة تقرير'::text,
           rp.id, rp.target_company_id, c.name::text, rp.title::text,
           rp.status::text,
           case rp.status when 'pending_review' then 'بانتظار المراجعة'
                          when 'request_info'   then 'بانتظار معلومات'
                          else rp.status end::text,
           public.work_priority(null, null, null,
                                coalesce(c.official_status, 'none') <> 'none'),
           null::text, null::text, rp.created_at, rp.updated_at, null::timestamptz,
           'ok'::text,
           greatest(0, (extract(epoch from now() - rp.created_at) / 86400)::int),
           false
      from public.reports rp
      left join public.companies c on c.id = rp.target_company_id
     where rp.status in ('pending_review', 'request_info') and v_reports
  ),
  dis as (
    select 'dispute'::text, 'اعتراض'::text,
           d.id, rp.target_company_id, c.name::text,
           coalesce(rp.title, 'اعتراض')::text,
           d.status::text, 'مفتوح'::text,
           'critical'::text,
           null::text, null::text, d.created_at, d.created_at, null::timestamptz,
           'ok'::text,
           greatest(0, (extract(epoch from now() - d.created_at) / 86400)::int),
           false
      from public.disputes d
      left join public.reports rp on rp.id = d.report_id
      left join public.companies c on c.id = rp.target_company_id
     where d.status = 'open' and v_disp
  ),
  everything as (
    select * from req union all select * from rep union all select * from dis
  )
  select e.kind, e.kind_label, e.id, e.company_id, e.company_name, e.title,
         e.status, e.status_label, e.priority, e.assignee,
         e.created_at, e.updated_at, e.due_at, e.sla_state, e.waiting_days, e.assignable
    from everything e
   where (p_kind is null or e.kind = p_kind)
     -- Somebody who may only see their own work sees theirs and what nobody
     -- has taken. Hiding the unclaimed pile from them would mean it could only
     -- ever be worked by a supervisor.
     and (v_all or e.assigned_to = v_me or e.assigned_to is null)
     and case coalesce(p_scope, 'all')
           when 'mine'         then e.assigned_to = v_me
           when 'unassigned'   then e.assigned_to is null and e.assignable
           when 'late'         then e.sla_state in ('late_response', 'late_resolution')
           when 'waiting_them' then e.sla_state = 'paused'
           else true
         end
   order by
     case e.priority when 'critical' then 0 when 'high' then 1 else 2 end,
     e.due_at asc nulls last,
     e.created_at asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$fn$;

/**
 * How much of each, for the filters to carry their own counts.
 *
 * A filter without a number is a filter nobody presses.
 */
create or replace function public.admin_work_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb;
begin
  if not coalesce(public.has_permission('work.view_all')
                  or public.has_permission('work.view_assigned'), false) then
    raise exception 'مركز العمل يحتاج صلاحية';
  end if;

  select jsonb_build_object(
    'all',          (select count(*) from public.admin_work_items('all',  null, 500)),
    'mine',         (select count(*) from public.admin_work_items('mine', null, 500)),
    'unassigned',   (select count(*) from public.admin_work_items('unassigned', null, 500)),
    'late',         (select count(*) from public.admin_work_items('late', null, 500)),
    'waiting_them', (select count(*) from public.admin_work_items('waiting_them', null, 500)),
    'by_kind',      (select jsonb_object_agg(kind, n) from (
                       select kind, count(*) n from public.admin_work_items('all', null, 500)
                        group by kind) k),
    'by_priority',  (select jsonb_object_agg(priority, n) from (
                       select priority, count(*) n from public.admin_work_items('all', null, 500)
                        group by priority) p)
  ) into v;

  return v;
end;
$fn$;

revoke all on function public.admin_work_items(text, text, int) from anon, public;
revoke all on function public.admin_work_counts() from anon, public;
grant execute on function public.admin_work_items(text, text, int) to authenticated;
grant execute on function public.admin_work_counts() to authenticated;
grant execute on function public.work_priority(timestamptz, timestamptz, timestamptz, boolean) to authenticated;
