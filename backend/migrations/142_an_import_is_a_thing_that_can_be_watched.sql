-- An import is a thing that can be watched
-- ============================================================================
--
-- A browser upload of the Ministry's register stopped after 503 rows and left
-- no trace anywhere. Not an error, not a log line, not a partial-load flag —
-- the 503 rows simply became «the commercial register», and stayed that way
-- until somebody counted them.
--
-- The rows themselves were fine. Every one of them is a real company, complete,
-- unduplicated. That is the whole problem: nothing was wrong with the data, so
-- nothing could tell that 1,912,235 companies were missing.
--
-- An import needs to be an object with a lifecycle, not a script somebody ran.
--
-- ============================================================================
-- No staging table
-- ============================================================================
-- The registry table already carries `dataset_id`. A new import writes a new
-- generation beside the old one and nothing reads it until it is published —
-- which gives isolation during load, an atomic switch, rollback by pointing
-- back, and generation-to-generation diffing, without a second copy of the
-- schema to keep in step.
--
-- What was missing was never the staging table. It was the gate.

create table if not exists public.import_jobs (
  id                  uuid primary key default gen_random_uuid(),
  source_key          text        not null default 'ministry_of_commerce',
  dataset_id          uuid        not null unique,
  snapshot_period     text,
  snapshot_at         date,

  file_name           text,
  file_bytes          bigint,
  file_sha256         text,

  -- Counted by streaming the file before a single row is inserted. «The file
  -- says how many rows it has» is not a thing a CSV can say, and trusting the
  -- loader's own count to verify the loader is circular.
  expected_rows       bigint,
  rows_loaded         bigint      not null default 0,
  rows_rejected       bigint      not null default 0,

  status              text        not null default 'created',
  failure_reason      text,
  -- Every check that ran, with its verdict, kept even when they all passed.
  verification        jsonb       not null default '{}'::jsonb,

  -- The generation this one replaces. Rollback and diffing both need it, and
  -- deriving it later from timestamps guesses.
  previous_dataset_id uuid,

  started_by          text,
  started_at          timestamptz not null default now(),
  validated_at        timestamptz,
  loaded_at           timestamptz,
  verified_at         timestamptz,
  published_at        timestamptz,
  finished_at         timestamptz,

  notes               jsonb       not null default '{}'::jsonb,

  constraint import_jobs_status_check check (status in (
    'created', 'validating', 'loading', 'verifying', 'ready',
    'published', 'failed', 'cancelled', 'rolled_back'))
);

comment on table public.import_jobs is
  'كل محاولة استيراد، ناجحة أو فاشلة — لا يُنشر جيل بلا مهمّة تشهد باكتماله';
comment on column public.import_jobs.expected_rows is
  'عدد الأسطر المعدود بالتدفّق قبل التحميل — لا يُؤخذ من المُحمِّل نفسه';

create index if not exists import_jobs_status_idx  on public.import_jobs (status, started_at desc);
create index if not exists import_jobs_source_idx  on public.import_jobs (source_key, started_at desc);

/**
 * Every row the loader would not take, and why.
 *
 * Kept per row rather than counted, because «3,412 rows rejected» is a number
 * nobody can act on. The line number and the raw text are what let somebody
 * open the file and see it.
 */
create table if not exists public.import_job_errors (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.import_jobs(id) on delete cascade,
  line_no    bigint,
  cr_number  text,
  reason     text not null,
  raw        text,
  created_at timestamptz not null default now()
);

create index if not exists import_job_errors_job_idx on public.import_job_errors (job_id, line_no);

/**
 * What changed between two generations.
 *
 * `removed` means the record left the Ministry's file — a company struck off,
 * which is one of the most consequential facts Marsad can know about it. It is
 * recorded as a change in the government's data. Nothing is deleted from
 * Marsad on the strength of it.
 */
create table if not exists public.import_diffs (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.import_jobs(id) on delete cascade,
  dataset_id          uuid not null,
  previous_dataset_id uuid,
  change              text not null check (change in ('new', 'changed', 'removed')),
  cr_number           text not null,
  before              jsonb,
  after               jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists import_diffs_job_idx    on public.import_diffs (job_id, change);
create index if not exists import_diffs_cr_idx     on public.import_diffs (cr_number);

alter table public.import_jobs        enable row level security;
alter table public.import_job_errors  enable row level security;
alter table public.import_diffs       enable row level security;

-- Staff read; nobody writes except through the functions in the next migration.
drop policy if exists import_jobs_select on public.import_jobs;
create policy import_jobs_select on public.import_jobs for select to authenticated
  using (coalesce(public.is_platform_admin() or public.is_reviewer(), false));

drop policy if exists import_job_errors_select on public.import_job_errors;
create policy import_job_errors_select on public.import_job_errors for select to authenticated
  using (coalesce(public.is_platform_admin() or public.is_reviewer(), false));

drop policy if exists import_diffs_select on public.import_diffs;
create policy import_diffs_select on public.import_diffs for select to authenticated
  using (coalesce(public.is_platform_admin() or public.is_reviewer(), false));

-- ============================================================================
-- The generation that is live
-- ============================================================================
-- One setting, read by every surface that shows registry data. Publishing is
-- writing this value; rollback is writing the previous one back.

insert into public.system_settings (key, value, type, description)
select 'published_registry_dataset', 'null'::jsonb, 'json',
       'معرّف مجموعة السجل التجاري المنشورة — لا يُقرأ غيرها في البحث'
where not exists (select 1 from public.system_settings where key = 'published_registry_dataset');

/**
 * Which generation the product is allowed to see.
 *
 * Stable and callable by anyone signed in, because every search calls it. It
 * returns an id and nothing else — knowing which generation is live tells a
 * caller nothing they could not infer from the results.
 */
create or replace function public.published_registry_dataset()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select nullif(value #>> '{}', '')::uuid
    from public.system_settings where key = 'published_registry_dataset';
$fn$;

grant execute on function public.published_registry_dataset() to authenticated;

-- ============================================================================
-- The generation that is already here
-- ============================================================================
-- The 503 rows predate all of this. They are not deleted — they are the only
-- registry data Marsad has — but they are now described truthfully: a job that
-- stopped, recorded as partial, published because it is what is live today and
-- taking it away was not asked for.
--
-- Everything after it goes through the gate.

do $$
declare
  v_dataset uuid;
  v_rows    bigint;
  v_period  text;
  v_at      date;
  v_first   timestamptz;
begin
  select dataset_id, count(*), min(snapshot_period), min(snapshot_at), min(imported_at)
    into v_dataset, v_rows, v_period, v_at, v_first
    from public.government_company_registry
   group by dataset_id
   order by count(*) desc
   limit 1;

  if v_dataset is null then
    raise notice 'لا بيانات سجلّ — لا شيء لتسجيله';
    return;
  end if;

  if exists (select 1 from public.import_jobs where dataset_id = v_dataset) then
    raise notice 'المجموعة مسجّلة سلفاً';
    return;
  end if;

  insert into public.import_jobs (
    dataset_id, snapshot_period, snapshot_at, file_name,
    expected_rows, rows_loaded, rows_rejected,
    status, verification, started_at, loaded_at, verified_at, published_at, finished_at, notes
  ) values (
    v_dataset, v_period, v_at, '2026 02q active crs.csv',
    -- What the source actually holds, against what arrived.
    1912738, v_rows, 0,
    'published',
    jsonb_build_object(
      'completeness', 'partial',
      'evidence', 'الصفوف الموجودة هي أول 503 سطر من الملف بالضبط، بترتيبها، وصفر خارجها',
      'loaded_pct', round((v_rows::numeric / 1912738) * 100, 4),
      'missing', 1912738 - v_rows,
      'gate_applies', false),
    v_first, v_first, now(), now(), now(),
    jsonb_build_object(
      'note', 'رفع من لوحة Supabase توقّف بعد 503 صفّاً. مسجَّل بأثر رجعي عند بناء نظام الاستيراد.',
      'grandfathered', true)
  );

  update public.system_settings
     set value = to_jsonb(v_dataset::text), updated_at = now()
   where key = 'published_registry_dataset';

  raise notice 'سُجّلت المجموعة القائمة: % صفّاً، ناقصة، ومنشورة', v_rows;
end;
$$;
