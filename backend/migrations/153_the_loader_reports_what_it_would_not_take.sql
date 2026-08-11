-- The loader reports what it would not take
-- ============================================================================
--
-- `loaded + rejected = expected` is the check the whole import system turns on.
-- The loader knew it had skipped rows — five with no name at all — and kept the
-- number in its own output, where the check could not see it. The job then read
-- a gap of five and called the import incomplete.
--
-- One call, one number, recorded against the job. Bulk rather than row-by-row:
-- a file can skip thousands, and writing a `import_job_errors` row for each of
-- them buys nothing the reason and the count do not already say.

create or replace function public.import_job_record_skips(
  p_job_id uuid,
  p_count  bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('data.import'), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  if coalesce(p_count, 0) <= 0 then
    return;
  end if;

  update public.import_jobs
     set rows_rejected = rows_rejected + p_count
   where id = p_job_id;

  insert into public.import_job_errors (job_id, line_no, cr_number, reason, raw)
  values (p_job_id, null, null,
          format('%s صفّاً: %s', p_count, coalesce(p_reason, 'غير مقبول')), null);
end;
$fn$;

revoke all on function public.import_job_record_skips(uuid, bigint, text) from anon, public;
grant execute on function public.import_job_record_skips(uuid, bigint, text) to authenticated;
