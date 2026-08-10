-- What changed between two generations
-- ============================================================================
--
-- A quarterly snapshot is not an update, it is a whole new file. The only way
-- to know what actually moved is to compare it against the one before.
--
-- `removed` is the interesting one. A registration number that was in last
-- quarter's file and is not in this one has been struck off — one of the most
-- consequential facts Marsad can hold about a company, and one that a plain
-- «replace the table» import destroys without ever noticing.
--
-- Nothing is deleted from Marsad on the strength of it. A company Marsad knows
-- stays; what changed is what the Ministry says about it, and that is recorded
-- as a change in the government's data.
--
-- ============================================================================
-- Counts are exact; the row-by-row detail is capped
-- ============================================================================
-- The first real generation makes every one of 1.9 million rows «new». Writing
-- 1.9 million diff rows to say «this file is new» is storage spent to record
-- something the counts already say. So the counts are always complete and the
-- per-row detail stops at a limit — with the job recording that it was capped,
-- because a truncated list that does not say it is truncated is the same class
-- of bug as the 503.

create or replace function public.import_job_compute_diff(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j        public.import_jobs;
  v_cap    int;
  v_new    bigint := 0;
  v_chg    bigint := 0;
  v_gone   bigint := 0;
  v_capped boolean := false;
begin
  select * into j from public.import_jobs where id = p_job_id;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;

  select coalesce((value ->> 'diff_detail_cap')::int, 50000) into v_cap
    from public.system_settings where key = 'registry_source_spec';

  -- A first generation has nothing to be compared against. Saying «1.9 million
  -- new» is true and useless; what matters is that it is the baseline.
  if j.previous_dataset_id is null then
    select count(*) into v_new from public.government_company_registry
     where dataset_id = j.dataset_id;
    return jsonb_build_object(
      'baseline', true, 'new', v_new, 'changed', 0, 'removed', 0,
      'detail_written', 0, 'capped', false);
  end if;

  delete from public.import_diffs where job_id = p_job_id;

  -- Counted over the whole set, independent of what gets written below.
  select
    count(*) filter (where o.cr_number is null),
    count(*) filter (where o.cr_number is not null and (
      n.name              is distinct from o.name              or
      n.unified_number    is distinct from o.unified_number    or
      n.capital           is distinct from o.capital           or
      n.region            is distinct from o.region            or
      n.city              is distinct from o.city              or
      n.legal_entity      is distinct from o.legal_entity      or
      n.registration_type is distinct from o.registration_type or
      n.registration_date is distinct from o.registration_date))
    into v_new, v_chg
    from public.government_company_registry n
    left join public.government_company_registry o
           on o.cr_number = n.cr_number and o.dataset_id = j.previous_dataset_id
   where n.dataset_id = j.dataset_id;

  select count(*) into v_gone
    from public.government_company_registry o
   where o.dataset_id = j.previous_dataset_id
     and not exists (select 1 from public.government_company_registry n
                      where n.dataset_id = j.dataset_id and n.cr_number = o.cr_number);

  with candidate as (
    select 'new'::text as change, n.cr_number,
           null::jsonb as before,
           to_jsonb(n) - 'id' - 'dataset_id' - 'imported_at' as after
      from public.government_company_registry n
     where n.dataset_id = j.dataset_id
       and not exists (select 1 from public.government_company_registry o
                        where o.dataset_id = j.previous_dataset_id and o.cr_number = n.cr_number)
    union all
    select 'changed', n.cr_number,
           to_jsonb(o) - 'id' - 'dataset_id' - 'imported_at',
           to_jsonb(n) - 'id' - 'dataset_id' - 'imported_at'
      from public.government_company_registry n
      join public.government_company_registry o
        on o.cr_number = n.cr_number and o.dataset_id = j.previous_dataset_id
     where n.dataset_id = j.dataset_id
       and (n.name is distinct from o.name
         or n.unified_number is distinct from o.unified_number
         or n.capital is distinct from o.capital
         or n.region is distinct from o.region
         or n.city is distinct from o.city
         or n.legal_entity is distinct from o.legal_entity
         or n.registration_type is distinct from o.registration_type
         or n.registration_date is distinct from o.registration_date)
    union all
    select 'removed', o.cr_number,
           to_jsonb(o) - 'id' - 'dataset_id' - 'imported_at',
           null::jsonb
      from public.government_company_registry o
     where o.dataset_id = j.previous_dataset_id
       and not exists (select 1 from public.government_company_registry n
                        where n.dataset_id = j.dataset_id and n.cr_number = o.cr_number)
  )
  insert into public.import_diffs (job_id, dataset_id, previous_dataset_id, change, cr_number, before, after)
  select p_job_id, j.dataset_id, j.previous_dataset_id, c.change, c.cr_number, c.before, c.after
    from candidate c
    -- `removed` first: a struck-off company is the finding somebody needs to
    -- see, and it is the smallest of the three sets.
   order by case c.change when 'removed' then 0 when 'changed' then 1 else 2 end
   limit v_cap;

  v_capped := (v_new + v_chg + v_gone) > v_cap;

  return jsonb_build_object(
    'baseline', false,
    'new', v_new, 'changed', v_chg, 'removed', v_gone,
    'detail_written', least(v_new + v_chg + v_gone, v_cap),
    'capped', v_capped,
    'cap', v_cap);
end;
$fn$;

/**
 * The same comparison, on demand, between any two generations.
 *
 * For the question «what did last quarter actually change», asked after the
 * fact by somebody who was not there for the import.
 */
create or replace function public.registry_generation_diff(
  p_dataset_a uuid,
  p_dataset_b uuid
)
returns table (change text, n bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  return query
  select 'new'::text, count(*)
    from public.government_company_registry b
   where b.dataset_id = p_dataset_b
     and not exists (select 1 from public.government_company_registry a
                      where a.dataset_id = p_dataset_a and a.cr_number = b.cr_number)
  union all
  select 'removed', count(*)
    from public.government_company_registry a
   where a.dataset_id = p_dataset_a
     and not exists (select 1 from public.government_company_registry b
                      where b.dataset_id = p_dataset_b and b.cr_number = a.cr_number)
  union all
  select 'changed', count(*)
    from public.government_company_registry b
    join public.government_company_registry a
      on a.cr_number = b.cr_number and a.dataset_id = p_dataset_a
   where b.dataset_id = p_dataset_b
     and (b.name is distinct from a.name
       or b.unified_number is distinct from a.unified_number
       or b.capital is distinct from a.capital
       or b.region is distinct from a.region
       or b.city is distinct from a.city
       or b.legal_entity is distinct from a.legal_entity
       or b.registration_type is distinct from a.registration_type
       or b.registration_date is distinct from a.registration_date);
end;
$fn$;

/**
 * Every generation, what it holds, and where it stands.
 *
 * The Data Management screen reads this. One row per import ever attempted,
 * including the ones that failed — those are the ones worth looking at.
 */
create or replace function public.registry_import_history(p_limit int default 50)
returns table (
  job_id          uuid,
  dataset_id      uuid,
  snapshot_period text,
  status          text,
  is_published    boolean,
  file_name       text,
  expected_rows   bigint,
  rows_loaded     bigint,
  rows_rejected   bigint,
  completeness    numeric,
  started_at      timestamptz,
  finished_at     timestamptz,
  started_by      text,
  failure_reason  text,
  diff            jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  return query
  select j.id, j.dataset_id, j.snapshot_period, j.status,
         j.dataset_id = public.published_registry_dataset(),
         j.file_name, j.expected_rows, j.rows_loaded, j.rows_rejected,
         case when coalesce(j.expected_rows, 0) > 0
              then round((j.rows_loaded::numeric / j.expected_rows) * 100, 2) end,
         j.started_at, j.finished_at,
         -- `users.email` is varchar(255); the declared return column is text,
         -- and a returns-table function checks that at call time, not at
         -- creation. It applied cleanly and failed on the first read.
         (select u.email::text from public.users u where u.id = j.started_by),
         j.failure_reason,
         j.verification -> 'publish' -> 'diff'
    from public.import_jobs j
   order by j.started_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$fn$;

revoke all on function public.import_job_compute_diff(uuid) from anon, public;
revoke all on function public.registry_generation_diff(uuid, uuid) from anon, public;
revoke all on function public.registry_import_history(int) from anon, public;
grant execute on function public.registry_generation_diff(uuid, uuid) to authenticated;
grant execute on function public.registry_import_history(int) to authenticated;
