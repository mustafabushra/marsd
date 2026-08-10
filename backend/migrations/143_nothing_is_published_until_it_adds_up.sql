-- Nothing is published until it adds up
-- ============================================================================
--
-- The lifecycle, as functions. Every transition is one of these; there is no
-- path that sets `import_jobs.status` directly.
--
--   created → validating → loading → verifying → ready → published
--                  │           │          │        │
--                  └───────────┴──────────┴────────┴──→ failed / cancelled
--                                                published → rolled_back
--
-- The rule the whole thing exists for: a generation becomes visible only when
-- three numbers agree, and one of them was counted before the loader ran.
-- «No error occurred» is not completeness — the 503-row import raised nothing.

insert into public.system_settings (key, value, type, description)
select 'registry_source_spec',
       jsonb_build_object(
         'header', jsonb_build_array(
           'unified_number', 'cr_number', 'name', 'registration_type',
           'legal_entity', 'legal_entity_2', 'capital', 'region', 'city',
           'registration_date'),
         'shrink_tolerance_pct', 10,
         'diff_detail_cap', 50000),
       'json',
       'ترويسة ملف السجل التجاري المتوقّعة وحدود الفحص'
where not exists (select 1 from public.system_settings where key = 'registry_source_spec');

-- Row counts that mean a spreadsheet ate the file. Excel stops at 1,048,576
-- rows and the older format at 65,536, both counting the header — so a file
-- that ends on either number, or one short of it, did not end: it was cut.
create or replace function public.is_spreadsheet_ceiling(p_rows bigint)
returns boolean
language sql
immutable
as $fn$
  select p_rows in (1048576, 1048575, 65536, 65535);
$fn$;

/**
 * Open an import. Nothing is loaded yet.
 *
 * `p_expected_rows` must be counted by streaming the file. Passing the
 * loader's own tally would make the completeness check circular — it would
 * only ever prove the loader agrees with itself.
 */
create or replace function public.import_job_start(
  p_file_name       text,
  p_file_bytes      bigint,
  p_expected_rows   bigint,
  p_snapshot_period text,
  p_snapshot_at     date,
  p_source_key      text default 'ministry_of_commerce',
  p_file_sha256     text default null
)
returns table (job_id uuid, dataset_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_job  uuid;
  v_ds   uuid := gen_random_uuid();
  v_prev uuid := public.published_registry_dataset();
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  if coalesce(p_expected_rows, 0) <= 0 then
    raise exception 'عدد الأسطر المتوقّع مطلوب — يُعدّ من الملف قبل التحميل';
  end if;

  -- One load at a time. Two concurrent generations would both be comparing
  -- themselves against the same predecessor and both be right.
  if exists (select 1 from public.import_jobs
              where source_key = p_source_key
                and status in ('created', 'validating', 'loading', 'verifying', 'ready')) then
    raise exception 'توجد مهمّة استيراد مفتوحة — أنهها أو ألغها أولاً';
  end if;

  insert into public.import_jobs (
    source_key, dataset_id, snapshot_period, snapshot_at,
    file_name, file_bytes, file_sha256, expected_rows,
    status, previous_dataset_id, started_by)
  values (
    p_source_key, v_ds, p_snapshot_period, p_snapshot_at,
    p_file_name, p_file_bytes, p_file_sha256, p_expected_rows,
    'validating', v_prev, public.get_current_user_id())
  returning id into v_job;

  return query select v_job, v_ds;
end;
$fn$;

/**
 * Everything that can be known before a single row is written.
 *
 * Refuses here rather than after an hour of loading, and refuses loudly: a
 * truncated file is not a smaller import, it is a different file.
 */
create or replace function public.import_job_validate(
  p_job_id      uuid,
  p_header      text[],
  p_last_line_complete boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j        public.import_jobs;
  v_spec   jsonb;
  v_want   text[];
  v_checks jsonb := '[]'::jsonb;
  v_fail   text;
  v_prev   bigint;
  v_shrink numeric;
  v_tol    numeric;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status <> 'validating' then
    raise exception 'المهمّة في حالة «%» ولا يمكن التحقّق منها', j.status;
  end if;

  select value into v_spec from public.system_settings where key = 'registry_source_spec';
  select array_agg(x order by ord) into v_want
    from jsonb_array_elements_text(v_spec -> 'header') with ordinality t(x, ord);
  v_tol := coalesce((v_spec ->> 'shrink_tolerance_pct')::numeric, 10);

  -- 1. The header, exactly. A column that moved silently maps names into
  --    registration numbers.
  v_checks := v_checks || jsonb_build_object(
    'key', 'header', 'ok', p_header = v_want,
    'label', 'ترويسة الملف مطابقة',
    'detail', case when p_header = v_want then null
                   else format('جاء: %s', array_to_string(p_header, ', ')) end);

  -- 2. The spreadsheet ceilings.
  v_checks := v_checks || jsonb_build_object(
    'key', 'ceiling', 'ok', not public.is_spreadsheet_ceiling(j.expected_rows),
    'label', 'لا بتر عند سقف جدول البيانات',
    'detail', case when public.is_spreadsheet_ceiling(j.expected_rows)
                   then format('الملف ينتهي عند %s بالضبط — سقف Excel', j.expected_rows) end);

  -- 3. A file that stops mid-line stopped mid-write.
  v_checks := v_checks || jsonb_build_object(
    'key', 'last_line', 'ok', coalesce(p_last_line_complete, false),
    'label', 'السطر الأخير كامل',
    'detail', case when not coalesce(p_last_line_complete, false)
                   then 'الملف مقطوع في منتصف سطر' end);

  -- 4. The register does not lose a tenth of its companies between quarters.
  --    Not fatal here — it is a question, and it is asked again at publish.
  select rows_loaded into v_prev from public.import_jobs
   where dataset_id = j.previous_dataset_id;

  v_shrink := case when coalesce(v_prev, 0) > 0
                   then round(((v_prev - j.expected_rows)::numeric / v_prev) * 100, 2)
                   else 0 end;

  v_checks := v_checks || jsonb_build_object(
    'key', 'shrink', 'ok', v_shrink <= v_tol,
    'label', format('الحجم مقارنة بالجيل السابق (%s%%)', -v_shrink),
    'detail', case when v_shrink > v_tol
                   then format('انخفاض %s%% — يحتاج تأكيداً صريحاً عند النشر', v_shrink) end,
    'blocking', false);

  select string_agg(c ->> 'label', ' · ') into v_fail
    from jsonb_array_elements(v_checks) c
   where not (c ->> 'ok')::boolean and coalesce((c ->> 'blocking')::boolean, true);

  if v_fail is not null then
    update public.import_jobs
       set status = 'failed', failure_reason = 'فشل التحقّق: ' || v_fail,
           verification = jsonb_build_object('validate', v_checks),
           finished_at = now()
     where id = p_job_id;
    return jsonb_build_object('ok', false, 'checks', v_checks, 'reason', v_fail);
  end if;

  update public.import_jobs
     set status = 'loading', validated_at = now(),
         verification = jsonb_build_object('validate', v_checks)
   where id = p_job_id;

  return jsonb_build_object('ok', true, 'checks', v_checks, 'dataset_id', j.dataset_id);
end;
$fn$;

/** A row the loader would not take. */
create or replace function public.import_job_reject_row(
  p_job_id uuid, p_line_no bigint, p_cr_number text, p_reason text, p_raw text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  insert into public.import_job_errors (job_id, line_no, cr_number, reason, raw)
  values (p_job_id, p_line_no, p_cr_number, p_reason, left(p_raw, 2000));

  update public.import_jobs set rows_rejected = rows_rejected + 1 where id = p_job_id;
end;
$fn$;

/** The loader is done. It reports what it wrote; it does not get to decide. */
create or replace function public.import_job_finish_load(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j      public.import_jobs;
  v_rows bigint;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status <> 'loading' then
    raise exception 'المهمّة في حالة «%»', j.status;
  end if;

  -- Counted from the table, not taken from the caller. A loader that
  -- miscounts is exactly the failure this is meant to catch.
  select count(*) into v_rows
    from public.government_company_registry where dataset_id = j.dataset_id;

  update public.import_jobs
     set rows_loaded = v_rows, status = 'verifying', loaded_at = now()
   where id = p_job_id;

  return jsonb_build_object('rows_loaded', v_rows, 'rows_rejected', j.rows_rejected);
end;
$fn$;

/**
 * Does it add up?
 *
 * Returns every check with its verdict, and moves the job to `ready` only when
 * all of them hold. Nothing here trusts a count it did not take itself.
 */
create or replace function public.import_job_verify(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j        public.import_jobs;
  v_checks jsonb := '[]'::jsonb;
  v_rows   bigint;
  v_bad_cr bigint;
  v_bad_un bigint;
  v_empty  bigint;
  v_dupes  bigint;
  v_fail   text;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status not in ('verifying', 'ready') then
    raise exception 'المهمّة في حالة «%»', j.status;
  end if;

  select count(*),
         count(*) filter (where cr_number is null or btrim(cr_number) = ''
                            or cr_number !~ '^[0-9]{6,15}$'),
         count(*) filter (where unified_number is not null and btrim(unified_number) <> ''
                            and unified_number !~ '^[0-9]{6,15}$'),
         count(*) filter (where name is null or btrim(name) = '')
    into v_rows, v_bad_cr, v_bad_un, v_empty
    from public.government_company_registry where dataset_id = j.dataset_id;

  select count(*) into v_dupes from (
    select cr_number from public.government_company_registry
     where dataset_id = j.dataset_id group by cr_number having count(*) > 1) d;

  -- 1. The three numbers.
  v_checks := v_checks || jsonb_build_object(
    'key', 'accounted', 'ok', (j.rows_loaded + j.rows_rejected) = j.expected_rows,
    'label', format('%s محمّل + %s مرفوض = %s متوقّع',
                    j.rows_loaded, j.rows_rejected, j.expected_rows),
    'detail', case when (j.rows_loaded + j.rows_rejected) <> j.expected_rows
                   then format('فرق %s صفّاً غير محسوب',
                               j.expected_rows - j.rows_loaded - j.rows_rejected) end);

  -- 2. What the table actually holds.
  v_checks := v_checks || jsonb_build_object(
    'key', 'table_count', 'ok', v_rows = j.rows_loaded,
    'label', format('الجدول يحمل %s صفّاً', v_rows),
    'detail', case when v_rows <> j.rows_loaded then 'لا يطابق ما سجّله المُحمِّل' end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'ceiling', 'ok', not public.is_spreadsheet_ceiling(j.expected_rows),
    'label', 'لا بتر عند سقف جدول البيانات', 'detail', null);

  v_checks := v_checks || jsonb_build_object(
    'key', 'cr_number', 'ok', v_bad_cr = 0,
    'label', 'كل أرقام السجل صالحة',
    'detail', case when v_bad_cr > 0 then format('%s رقماً غير صالح', v_bad_cr) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'unified_number', 'ok', v_bad_un = 0,
    'label', 'الأرقام الموحّدة صالحة',
    'detail', case when v_bad_un > 0 then format('%s رقماً غير صالح', v_bad_un) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'names', 'ok', v_empty = 0,
    'label', 'لا اسم فارغ',
    'detail', case when v_empty > 0 then format('%s صفّاً بلا اسم', v_empty) end);

  -- The unique index makes this structurally impossible; checked anyway,
  -- because «impossible» is a claim about the schema, not about the data.
  v_checks := v_checks || jsonb_build_object(
    'key', 'duplicates', 'ok', v_dupes = 0,
    'label', 'لا أرقام سجل مكرّرة',
    'detail', case when v_dupes > 0 then format('%s رقماً مكرّراً', v_dupes) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'not_empty', 'ok', v_rows > 0,
    'label', 'المجموعة ليست فارغة', 'detail', null);

  select string_agg(c ->> 'label', ' · ') into v_fail
    from jsonb_array_elements(v_checks) c where not (c ->> 'ok')::boolean;

  if v_fail is not null then
    update public.import_jobs
       set status = 'failed', failure_reason = 'فشل الفحص: ' || v_fail,
           verification = j.verification || jsonb_build_object('verify', v_checks),
           verified_at = now(), finished_at = now()
     where id = p_job_id;
    return jsonb_build_object('ok', false, 'checks', v_checks);
  end if;

  update public.import_jobs
     set status = 'ready', verified_at = now(),
         verification = j.verification || jsonb_build_object('verify', v_checks)
   where id = p_job_id;

  return jsonb_build_object('ok', true, 'checks', v_checks);
end;
$fn$;

revoke all on function public.import_job_start(text, bigint, bigint, text, date, text, text) from anon, public;
revoke all on function public.import_job_validate(uuid, text[], boolean) from anon, public;
revoke all on function public.import_job_reject_row(uuid, bigint, text, text, text) from anon, public;
revoke all on function public.import_job_finish_load(uuid) from anon, public;
revoke all on function public.import_job_verify(uuid) from anon, public;
grant execute on function public.import_job_start(text, bigint, bigint, text, date, text, text) to authenticated;
grant execute on function public.import_job_validate(uuid, text[], boolean) to authenticated;
grant execute on function public.import_job_reject_row(uuid, bigint, text, text, text) to authenticated;
grant execute on function public.import_job_finish_load(uuid) to authenticated;
grant execute on function public.import_job_verify(uuid) to authenticated;
