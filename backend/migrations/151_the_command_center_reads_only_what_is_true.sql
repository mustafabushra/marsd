-- The Command Center reads only what is true
-- ============================================================================
--
-- Half the screen's cards had no source. Building them against invented numbers
-- would produce a control tower that reports on itself.
--
-- One function per section rather than one big one, because the screen loads
-- each independently: a health check that fails must not blank the queue beside
-- it. Nothing here computes a comparison against yesterday — there is no daily
-- snapshot, so «↑ 3 since yesterday» could only ever be a decoration.

-- ============================================================================
-- Model health
-- ============================================================================
-- Six questions, each of which asks «has the model broken?» rather than «how is
-- business?». They exist because every serious fault in this system so far was
-- invisible while every individual row looked fine.

create or replace function public.admin_model_health()
returns table (
  key     text,
  label   text,
  n       bigint,
  status  text,
  detail  text,
  target  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('audit.view')
                  or public.has_permission('platform.admin'), false) then
    raise exception 'صحّة النموذج لإدارة مرصد';
  end if;

  return query

  -- A company Marsad vouches for, with nothing verified behind it.
  --
  -- Scoped to `community`: a Ministry import is `active` and has no documents
  -- by design — it is the register, not an application. Without the scope this
  -- check would light up red across 1.9 million perfectly correct rows, which
  -- is how a health monitor teaches people to ignore it.
  select 'active_without_documents'::text,
         'شركة معتمدة بلا مستند مُدقَّق'::text,
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end::text,
         case when count(*) > 0 then 'شركات مجتمعية نشطة ولم يُدقَّق لها مستند' end::text,
         '/admin/companies?filter=active_no_docs'::text
    from public.companies c
   where c.status = 'active'
     and c.source = 'community'
     and not exists (
       select 1 from public.company_documents d
        where d.company_id = c.id and d.status = 'verified' and d.superseded_at is null)

  union all

  -- The failure that started all of this: one registration in two tables.
  select 'double_written_requests',
         'طلب مكتوب في الجدولين',
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         case when count(*) > 0 then 'تسجيل له صفّان مستقلّان' end,
         '/admin/work'
    from public.registration_requests rr
   where rr.status = 'pending'
     and not exists (select 1 from public.company_requests cr
                      where cr.company_id = rr.company_id and cr.kind = 'registration')

  union all

  select 'account_without_company',
         'حساب بلا شركة',
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'warning' end,
         case when count(*) > 0 then 'حسابات لا ترتبط بشركة' end,
         '/admin/accounts'
    from public.tenants t
   where t.company_id is null and t.status = 'active'

  union all

  select 'stale_open_requests',
         'طلب مفتوح أكثر من ١٤ يوماً',
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'warning' end,
         case when count(*) > 0 then 'طلبات تجاوزت أسبوعين دون قرار' end,
         '/admin/work?scope=late'
    from public.company_requests r
   where r.status in ('submitted', 'under_review', 'resubmitted')
     and r.submitted_at < now() - interval '14 days'

  union all

  -- The 503. A generation is published; is it complete?
  select 'partial_published_dataset',
         'مجموعة سجلّ منشورة ناقصة',
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         (select string_agg(format('%s: %s من %s', j.snapshot_period,
                                   j.rows_loaded, j.expected_rows), ' · ')
            from public.import_jobs j
           where j.dataset_id = public.published_registry_dataset()
             and j.rows_loaded < j.expected_rows),
         '/admin/data'
    from public.import_jobs j
   where j.dataset_id = public.published_registry_dataset()
     and coalesce(j.expected_rows, 0) > 0
     and j.rows_loaded < j.expected_rows

  union all

  -- `approved` and `review_status` are derived by trigger. This is zero by
  -- construction — and stays a check, because a trigger can be dropped.
  select 'status_disagreement',
         'تعارض بين الحالة والأعمدة المشتقّة',
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         case when count(*) > 0 then 'approved لا يطابق status' end,
         '/admin/system'
    from public.companies c
   where c.approved is distinct from (c.status = 'active');
end;
$fn$;

-- ============================================================================
-- What was finished today
-- ============================================================================

create or replace function public.admin_completed_today()
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
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  select jsonb_build_object(
    'total',
      (select count(*) from public.company_requests
        where reviewed_at::date = current_date)
    + (select count(*) from public.company_documents
        where verified_at::date = current_date)
    + (select count(*) from public.disputes
        where resolved_at::date = current_date),
    'approved',   (select count(*) from public.company_requests
                    where status = 'approved' and reviewed_at::date = current_date),
    'rejected',   (select count(*) from public.company_requests
                    where status = 'rejected' and reviewed_at::date = current_date),
    'clarified',  (select count(*) from public.company_request_events
                    where event = 'clarification_requested' and created_at::date = current_date),
    'documents',  (select count(*) from public.company_documents
                    where verified_at::date = current_date),
    'disputes',   (select count(*) from public.disputes
                    where resolved_at::date = current_date),
    'last_at',    (select max(reviewed_at) from public.company_requests
                    where reviewed_at::date = current_date)
  ) into v;

  return v;
end;
$fn$;

-- ============================================================================
-- What the Ministry started saying about a company
-- ============================================================================
-- Marsad's own status and the government's are two different claims about the
-- same company, and both can be true. This returns them side by side so the
-- screen never has to flatten «نشطة في مرصد» and «تحت التصفية لدى الوزارة»
-- into one badge.

create or replace function public.admin_official_status_changes(p_days int default 30)
returns table (
  company_id      uuid,
  company_name    text,
  cr_number       text,
  marsad_status   text,
  official_status text,
  cr_status       text,
  changed_at      timestamptz,
  note            text,
  source          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('companies.view'), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  return query
  select c.id, c.name::text, c.cr_number::text,
         c.status::text, c.official_status::text, c.cr_status::text,
         c.official_status_at, c.official_status_note, c.official_status_source
    from public.companies c
   where coalesce(c.official_status, 'none') <> 'none'
     and c.official_status_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
   order by c.official_status_at desc
   limit 50;
end;
$fn$;

-- ============================================================================
-- Who did what
-- ============================================================================

create or replace function public.admin_activity_feed(p_limit int default 25)
returns table (
  at         timestamptz,
  actor      text,
  actor_role text,
  action     text,
  entity     text,
  entity_id  text,
  meta       jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('audit.view'), false) then
    raise exception 'سجلّ النشاط يحتاج صلاحية';
  end if;

  return query
  select l.created_at,
         coalesce(u.email::text, case when l.actor_id is null then 'النظام' end),
         coalesce(l.actor_role::text, u.role::text),
         l.action::text, l.entity::text, l.entity_id, l.meta
    from public.audit_logs l
    left join public.users u on u.id = l.actor_id
   order by l.created_at desc
   limit least(greatest(coalesce(p_limit, 25), 1), 200);
end;
$fn$;

-- ============================================================================
-- The jobs that run without anybody watching
-- ============================================================================
-- The nightly sweep works and no screen says so. A run that freed nothing still
-- writes its heartbeat, which is what separates «working» from «has not fired
-- since March».

create or replace function public.admin_background_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb;
begin
  if not coalesce(public.has_permission('platform.admin')
                  or public.has_permission('audit.view'), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  select jsonb_build_object(
    'cleanup', (
      select jsonb_build_object(
        'name', 'الكنس الليلي',
        'schedule', (select schedule from cron.job
                      where jobname = 'marsad-reclaim-abandoned-registrations'),
        'active', (select active from cron.job
                    where jobname = 'marsad-reclaim-abandoned-registrations'),
        'last_at', l.created_at,
        'released', l.meta -> 'released',
        -- Never run is a state of its own. Showing it as «success, 0 released»
        -- is how a job that never fires looks healthy forever.
        'status', case when l.created_at is null then 'never'
                       when l.created_at < now() - interval '48 hours' then 'stalled'
                       else 'success' end)
        from (select created_at, meta from public.audit_logs
               where action = 'registration_cleanup_ran'
               order by created_at desc limit 1) l
    ),
    'import', (
      select jsonb_build_object(
        'name', 'استيراد السجل التجاري',
        'period', j.snapshot_period,
        'status', j.status,
        'expected', j.expected_rows,
        'loaded', j.rows_loaded,
        'rejected', j.rows_rejected,
        'started_at', j.started_at,
        'finished_at', j.finished_at,
        'is_published', j.dataset_id = public.published_registry_dataset(),
        'failure_reason', j.failure_reason)
        from public.import_jobs j order by j.started_at desc limit 1
    )
  ) into v;

  return v;
end;
$fn$;

revoke all on function public.admin_model_health() from anon, public;
revoke all on function public.admin_completed_today() from anon, public;
revoke all on function public.admin_official_status_changes(int) from anon, public;
revoke all on function public.admin_activity_feed(int) from anon, public;
revoke all on function public.admin_background_jobs() from anon, public;
grant execute on function public.admin_model_health() to authenticated;
grant execute on function public.admin_completed_today() to authenticated;
grant execute on function public.admin_official_status_changes(int) to authenticated;
grant execute on function public.admin_activity_feed(int) to authenticated;
grant execute on function public.admin_background_jobs() to authenticated;
