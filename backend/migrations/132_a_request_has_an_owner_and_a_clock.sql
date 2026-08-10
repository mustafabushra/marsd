-- A request has an owner, and a clock
-- ============================================================================
--
-- `under_review` was declared in the status constraint and no function ever
-- set it. The queue offered a filter for it that could only ever return zero.
-- A state nothing can reach is worse than a missing one: it tells every future
-- reader that assignment exists.
--
-- This migration gives it the columns it needs. The functions that move a
-- request into it come next.
--
-- ============================================================================
-- Two clocks, because one cannot measure both failures
-- ============================================================================
-- Response  : submitted → assigned.   Did we pick it up?
-- Resolution: submitted → decided.    Did we finish it?
--
-- Measured from `assigned_at` alone, a request nobody ever picks up is never
-- late — which is the worst failure made invisible. Measured from
-- `submitted_at` alone, there is no way to tell whether the time was lost
-- before the work started or during it.
--
-- The resolution clock pauses while the company owes us something. The
-- response clock never pauses: nothing excuses not picking a request up.

alter table public.company_requests
  add column if not exists assigned_at        timestamptz,
  add column if not exists first_response_at  timestamptz,
  add column if not exists response_due_at    timestamptz,
  add column if not exists resolution_due_at  timestamptz,
  -- When the clock stopped, and how much stopped time has accumulated. Stored
  -- rather than derived because every transition already passes through a
  -- function — and a single write at the moment of transition cannot drift the
  -- way a re-derivation across a rewritten history can.
  add column if not exists paused_since       timestamptz,
  add column if not exists paused_total       interval not null default '0'::interval,
  add column if not exists withdraw_reason    text;

comment on column public.company_requests.assigned_at is
  'وقت استلام الموظّف للطلب — بداية العمل الفعلي';
comment on column public.company_requests.paused_total is
  'مجموع المدّة التي كان الطلب فيها بانتظار الشركة — تُخصم من مهلة الإنجاز';

create index if not exists company_requests_assigned_idx
  on public.company_requests (assigned_to) where assigned_to is not null;

create index if not exists company_requests_open_idx
  on public.company_requests (status, submitted_at)
  where status in ('submitted', 'under_review', 'clarification_needed', 'resubmitted');

-- ============================================================================
-- How long each kind may take
-- ============================================================================
-- In settings rather than in the code, because a service promise is a business
-- decision and changing one should not need a deployment.
--
-- The values are stored at submit time on the request itself. A request keeps
-- the promise that was made when it arrived, not whatever the setting says
-- today.

insert into public.system_settings (key, value, type, description)
select 'request_sla_rules',
       jsonb_build_object(
         'registration',     jsonb_build_object('response_hours', 4,  'resolution_hours', 48),
         'claim',            jsonb_build_object('response_hours', 4,  'resolution_hours', 48),
         'data_update',      jsonb_build_object('response_hours', 8,  'resolution_hours', 72),
         'document_review',  jsonb_build_object('response_hours', 4,  'resolution_hours', 24)
       ),
       'json',
       'مهل الاستجابة والإنجاز لكل نوع طلب، بالساعات'
where not exists (select 1 from public.system_settings where key = 'request_sla_rules');

/**
 * The promise for one kind of request, in hours.
 *
 * Falls back to the registration figures rather than to null, so a kind added
 * later without a settings row still gets a deadline instead of silently
 * getting none — «no SLA» and «no row in settings» must not look the same.
 */
create or replace function public.request_sla_target(p_kind text)
returns table (response_hours int, resolution_hours int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((v -> p_kind ->> 'response_hours')::int,
                  (v -> 'registration' ->> 'response_hours')::int, 4),
         coalesce((v -> p_kind ->> 'resolution_hours')::int,
                  (v -> 'registration' ->> 'resolution_hours')::int, 48)
    from (select value v from public.system_settings where key = 'request_sla_rules') s;
$$;

-- ============================================================================
-- The words a timeline is allowed to use
-- ============================================================================
-- `event` was free text, and the screen printed it raw: an Arabic review page
-- reading «created» and «submitted». The fix is not a lookup table in the
-- browser — it is that the vocabulary is finite and the database knows it.
--
-- Document events live here too. A document verified during a registration is
-- part of that registration's story, and a timeline that omits it cannot
-- explain why the decision took three days.

create or replace function public.request_event_types()
returns table (event text, ar text, en text, actor_type text)
language sql
immutable
as $$
  select * from (values
    ('created',                 'أُنشئ الطلب',      'Request created',        'company'),
    ('submitted',               'أُرسل الطلب',      'Request submitted',      'company'),
    ('assigned',                'أُسنِد الطلب',     'Assigned',               'staff'),
    ('unassigned',              'أُلغي الإسناد',    'Unassigned',             'staff'),
    ('clarification_requested', 'طُلب توضيح',       'Clarification requested','staff'),
    ('resubmitted',             'أُعيد الإرسال',    'Resubmitted',            'company'),
    ('document_verified',       'دُقّق مستند',      'Document verified',      'staff'),
    ('document_rejected',       'رُفض مستند',       'Document rejected',      'staff'),
    ('approved',                'قُبل الطلب',       'Request approved',       'staff'),
    ('rejected',                'رُفض الطلب',       'Request rejected',       'staff'),
    ('withdrawn',               'سُحب الطلب',       'Request withdrawn',      'company')
  ) as t(event, ar, en, actor_type);
$$;

-- The constraint repeats the list because a check constraint cannot call a
-- function that reads a table — and a function marked immutable that lies
-- about it is worse than the repetition. The assertion below is what keeps the
-- two copies honest: if they ever drift, this migration refuses to finish.
alter table public.company_request_events
  drop constraint if exists company_request_events_event_check;

alter table public.company_request_events
  add constraint company_request_events_event_check check (
    event in ('created', 'submitted', 'assigned', 'unassigned',
              'clarification_requested', 'resubmitted',
              'document_verified', 'document_rejected',
              'approved', 'rejected', 'withdrawn')
  );

do $$
declare
  v_fn   text[];
  v_ck   text[] := array['created', 'submitted', 'assigned', 'unassigned',
                         'clarification_requested', 'resubmitted',
                         'document_verified', 'document_rejected',
                         'approved', 'rejected', 'withdrawn'];
begin
  select array_agg(event order by event) into v_fn from public.request_event_types();

  if v_fn is distinct from (select array_agg(e order by e) from unnest(v_ck) e) then
    raise exception 'قاموس الأحداث لا يطابق القيد: % مقابل %', v_fn, v_ck;
  end if;
end;
$$;

revoke all on function public.request_sla_target(text) from anon, public;
grant execute on function public.request_sla_target(text) to authenticated;
grant execute on function public.request_event_types() to authenticated, anon;
