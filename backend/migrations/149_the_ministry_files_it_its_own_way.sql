-- The Ministry files it its own way
-- ============================================================================
--
-- The original file arrived and it does not look like the spec written against
-- the copy that had been through Excel. Two differences, both found by the
-- validation before a row was loaded, which is what it is for.
--
-- ============================================================================
-- 1. The header is Arabic, and one column appears twice
-- ============================================================================
--   الرقم الموحد,رقم السجل,اسم السجل,نوع السجل,الكيان القانوني,الكيان القانوني,
--   رأس المال,المنطقة,المدينة,تاريخ انشاء السجل
--
-- The English header in the spec came from the spreadsheet-processed copy —
-- somebody's export renamed the columns on the way through. «الكيان القانوني»
-- really is there twice; the parser suffixes the duplicate.
--
-- Both spellings are accepted, because the wording has changed between quarters
-- before and an import should not fail on a rename that changes no data.

update public.system_settings
   set value = jsonb_build_object(
     'headers', jsonb_build_array(
       jsonb_build_array(
         'الرقم الموحد', 'رقم السجل', 'اسم السجل', 'نوع السجل',
         'الكيان القانوني', 'الكيان القانوني', 'رأس المال',
         'المنطقة', 'المدينة', 'تاريخ انشاء السجل'),
       jsonb_build_array(
         'unified_number', 'cr_number', 'name', 'registration_type',
         'legal_entity', 'legal_entity_2', 'capital', 'region', 'city',
         'registration_date')),
     'shrink_tolerance_pct', 10,
     'diff_detail_cap', 50000),
       updated_at = now()
 where key = 'registry_source_spec';

/**
 * The header check, against any accepted spelling.
 *
 * The BOM on the first cell is stripped: it is a byte-order mark, not part of
 * the column name, and comparing it as one fails a file that is correct.
 */
create or replace function public.registry_header_ok(p_header text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.system_settings s,
           lateral jsonb_array_elements(s.value -> 'headers') h
     where s.key = 'registry_source_spec'
       and (select array_agg(btrim(replace(x, chr(65279), '')) order by ord)
              from unnest(p_header) with ordinality t(x, ord))
         = (select array_agg(btrim(replace(y, chr(65279), '')) order by ord)
              from jsonb_array_elements_text(h) with ordinality u(y, ord))
  );
$fn$;

grant execute on function public.registry_header_ok(text[]) to authenticated;

-- ============================================================================
-- 2. Nearly a quarter of the register has no registration number
-- ============================================================================
-- 438,067 rows of 1,912,738 carry `NULL` where the registration number should
-- be. They are not junk: every one is a `رئيسي` main registration, their
-- unified numbers are unique across the whole file, and they are recent —
-- companies issued under the unified-number regime, where الرقم الموحد is the
-- identifier and a legacy CR number was never assigned.
--
-- The first version of `import_job_verify` demanded a valid registration number
-- on every row, which would have rejected all 438,067 — losing 23% of the
-- national register to a rule about a column, in exactly the way this whole
-- system was built to prevent.
--
-- The rule becomes: every row must be identifiable, by one number or the other,
-- and a registration number that is present must be well-formed.

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
  v_no_id  bigint;
  v_empty  bigint;
  v_dupes  bigint;
  v_dupu   bigint;
  v_no_cr  bigint;
  v_fail   text;
begin
  if not coalesce(public.has_permission('data.import'), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status not in ('verifying', 'ready') then
    raise exception 'المهمّة في حالة «%»', j.status;
  end if;

  select count(*),
         -- Present but malformed. Absent is a separate question.
         count(*) filter (where cr_number is not null and btrim(cr_number) <> ''
                            and cr_number !~ '^[0-9]{6,15}$'),
         count(*) filter (where unified_number is not null and btrim(unified_number) <> ''
                            and unified_number !~ '^[0-9]{6,15}$'),
         count(*) filter (where coalesce(nullif(btrim(cr_number), ''), '') = ''
                            and coalesce(nullif(btrim(unified_number), ''), '') = ''),
         count(*) filter (where name is null or btrim(name) = ''),
         count(*) filter (where coalesce(nullif(btrim(cr_number), ''), '') = '')
    into v_rows, v_bad_cr, v_bad_un, v_no_id, v_empty, v_no_cr
    from public.government_company_registry where dataset_id = j.dataset_id;

  select count(*) into v_dupes from (
    select cr_number from public.government_company_registry
     where dataset_id = j.dataset_id and coalesce(btrim(cr_number), '') <> ''
     group by cr_number having count(*) > 1) d;

  select count(*) into v_dupu from (
    select unified_number from public.government_company_registry
     where dataset_id = j.dataset_id and coalesce(btrim(unified_number), '') <> ''
     group by unified_number having count(*) > 1) d;

  v_checks := v_checks || jsonb_build_object(
    'key', 'accounted', 'ok', (j.rows_loaded + j.rows_rejected) = j.expected_rows,
    'label', format('%s محمّل + %s مرفوض = %s متوقّع',
                    j.rows_loaded, j.rows_rejected, j.expected_rows),
    'detail', case when (j.rows_loaded + j.rows_rejected) <> j.expected_rows
                   then format('فرق %s صفّاً غير محسوب',
                               j.expected_rows - j.rows_loaded - j.rows_rejected) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'table_count', 'ok', v_rows = j.rows_loaded,
    'label', format('الجدول يحمل %s صفّاً', v_rows),
    'detail', case when v_rows <> j.rows_loaded then 'لا يطابق ما سجّله المُحمِّل' end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'ceiling', 'ok', not public.is_spreadsheet_ceiling(j.expected_rows),
    'label', 'لا بتر عند سقف جدول البيانات', 'detail', null);

  -- Identifiable, by either number.
  v_checks := v_checks || jsonb_build_object(
    'key', 'identifiable', 'ok', v_no_id = 0,
    'label', 'كل صفّ يحمل رقم سجل أو رقماً موحّداً',
    'detail', case when v_no_id > 0 then format('%s صفّاً بلا أي معرّف', v_no_id) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'cr_number', 'ok', v_bad_cr = 0,
    'label', 'أرقام السجل الموجودة صالحة',
    'detail', case when v_bad_cr > 0 then format('%s رقماً مشوّهاً', v_bad_cr) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'unified_number', 'ok', v_bad_un = 0,
    'label', 'الأرقام الموحّدة صالحة',
    'detail', case when v_bad_un > 0 then format('%s رقماً مشوّهاً', v_bad_un) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'names', 'ok', v_empty = 0,
    'label', 'لا اسم فارغ',
    'detail', case when v_empty > 0 then format('%s صفّاً بلا اسم', v_empty) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'duplicates', 'ok', v_dupes = 0 and v_dupu = 0,
    'label', 'لا معرّفات مكرّرة',
    'detail', case when v_dupes > 0 or v_dupu > 0
                   then format('%s رقم سجل و%s رقم موحّد مكرّر', v_dupes, v_dupu) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'not_empty', 'ok', v_rows > 0,
    'label', 'المجموعة ليست فارغة', 'detail', null);

  -- Not a pass/fail: a fact the reviewer should see before publishing, because
  -- a company with no registration number cannot be matched or claimed the way
  -- the rest can.
  v_checks := v_checks || jsonb_build_object(
    'key', 'no_cr_share', 'ok', true, 'blocking', false,
    'label', format('%s صفّاً بالرقم الموحّد وحده (%s%%)',
                    v_no_cr,
                    case when v_rows > 0 then round((v_no_cr::numeric / v_rows) * 100, 1) else 0 end),
    'detail', 'سجلات صادرة برقم موحّد بلا رقم سجل تجاري');

  select string_agg(c ->> 'label', ' · ') into v_fail
    from jsonb_array_elements(v_checks) c
   where not (c ->> 'ok')::boolean and coalesce((c ->> 'blocking')::boolean, true);

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

-- The validate function reads the accepted headers rather than one array.
create or replace function public.import_job_validate(
  p_job_id uuid,
  p_header text[],
  p_last_line_complete boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j        public.import_jobs;
  v_checks jsonb := '[]'::jsonb;
  v_fail   text;
  v_prev   bigint;
  v_shrink numeric;
  v_tol    numeric;
begin
  if not coalesce(public.has_permission('data.import'), false) then
    raise exception 'الاستيراد من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status <> 'validating' then
    raise exception 'المهمّة في حالة «%» ولا يمكن التحقّق منها', j.status;
  end if;

  select coalesce((value ->> 'shrink_tolerance_pct')::numeric, 10) into v_tol
    from public.system_settings where key = 'registry_source_spec';

  v_checks := v_checks || jsonb_build_object(
    'key', 'header', 'ok', public.registry_header_ok(p_header),
    'label', 'ترويسة الملف معروفة',
    'detail', case when not public.registry_header_ok(p_header)
                   then format('جاءت: %s', array_to_string(p_header, ', ')) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'ceiling', 'ok', not public.is_spreadsheet_ceiling(j.expected_rows),
    'label', 'لا بتر عند سقف جدول البيانات',
    'detail', case when public.is_spreadsheet_ceiling(j.expected_rows)
                   then format('الملف ينتهي عند %s بالضبط — سقف Excel', j.expected_rows) end);

  v_checks := v_checks || jsonb_build_object(
    'key', 'last_line', 'ok', coalesce(p_last_line_complete, false),
    'label', 'السطر الأخير كامل',
    'detail', case when not coalesce(p_last_line_complete, false)
                   then 'الملف مقطوع في منتصف سطر' end);

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
           verification = jsonb_build_object('validate', v_checks), finished_at = now()
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
