-- A publish decision needs the whole picture
-- ============================================================================
--
-- Publishing swaps the register the entire product reads. The confirmation for
-- it cannot be «are you sure» — it has to put the numbers in front of the
-- person: what passed, what was rejected, what this generation does to the one
-- it replaces, and which dataset is live right now.
--
-- The diff is optional and off by default. Counting new/changed/removed across
-- two 1.9-million-row generations is three full comparisons, and a screen that
-- runs them to render a card nobody opened is a screen that times out.

create or replace function public.admin_import_job_detail(
  p_job_id    uuid,
  p_with_diff boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  j    public.import_jobs;
  v    jsonb;
  d    jsonb := null;
begin
  if not coalesce(public.has_permission('data.import')
                  or public.has_permission('data.publish')
                  or public.has_permission('audit.view'), false) then
    raise exception 'تفاصيل الاستيراد لإدارة مرصد';
  end if;

  select * into j from public.import_jobs where id = p_job_id;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;

  if coalesce(p_with_diff, false) and j.previous_dataset_id is not null then
    select jsonb_object_agg(change, n) into d
      from public.registry_generation_diff(j.previous_dataset_id, j.dataset_id);
  end if;

  select jsonb_build_object(
    'job', jsonb_build_object(
      'id', j.id, 'status', j.status,
      'snapshot_period', j.snapshot_period, 'file_name', j.file_name,
      'expected_rows', j.expected_rows, 'rows_loaded', j.rows_loaded,
      'rows_rejected', j.rows_rejected,
      'accounted', (j.rows_loaded + j.rows_rejected) = j.expected_rows,
      'completeness', case when coalesce(j.expected_rows, 0) > 0
                           then round((j.rows_loaded::numeric / j.expected_rows) * 100, 2) end,
      'started_at', j.started_at, 'finished_at', j.finished_at,
      'failure_reason', j.failure_reason,
      'dataset_id', j.dataset_id,
      'previous_dataset_id', j.previous_dataset_id,
      'is_published', j.dataset_id = public.published_registry_dataset()),

    'published_now', public.published_registry_dataset(),

    'checks', coalesce(j.verification -> 'verify', j.verification -> 'validate', '[]'::jsonb),

    -- The shape of what landed, counted from the rows themselves rather than
    -- from anything the loader reported about itself.
    'quality', (
      select jsonb_build_object(
        'rows', count(*),
        'no_cr_with_unified', count(*) filter (
          where coalesce(nullif(btrim(cr_number), ''), '') = ''
            and coalesce(nullif(btrim(unified_number), ''), '') <> ''),
        'no_identifier', count(*) filter (
          where coalesce(nullif(btrim(cr_number), ''), '') = ''
            and coalesce(nullif(btrim(unified_number), ''), '') = ''),
        'duplicate_cr', (select count(*) from (
          select cr_number from public.government_company_registry
           where dataset_id = j.dataset_id and coalesce(btrim(cr_number), '') <> ''
           group by cr_number having count(*) > 1) x),
        'duplicate_unified', (select count(*) from (
          select unified_number from public.government_company_registry
           where dataset_id = j.dataset_id and coalesce(btrim(unified_number), '') <> ''
           group by unified_number having count(*) > 1) x))
        from public.government_company_registry
       where dataset_id = j.dataset_id),

    'rejections', coalesce((
      select jsonb_agg(jsonb_build_object('reason', e.reason, 'line', e.line_no,
                                          'cr_number', e.cr_number))
        from (select * from public.import_job_errors
               where job_id = p_job_id order by line_no nulls first limit 20) e
    ), '[]'::jsonb),

    'diff', d
  ) into v;

  return v;
end;
$fn$;

revoke all on function public.admin_import_job_detail(uuid, boolean) from anon, public;
grant execute on function public.admin_import_job_detail(uuid, boolean) to authenticated;
