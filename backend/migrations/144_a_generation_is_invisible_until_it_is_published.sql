-- A generation is invisible until it is published
-- ============================================================================
--
-- This is the line that would have prevented everything.
--
-- 503 rows arrived from an upload that stopped, and `search_companies_unified`
-- read the registry table with no question about whether that generation was
-- finished. Half a thousand rows out of 1.9 million became «the commercial
-- register» — silently, with no error and no partial flag, because nothing in
-- the system had the concept of an unfinished generation.
--
-- From here, the registry surfaces read one dataset: the published one.

-- ============================================================================
-- The gate, on the two functions that show registry data to people
-- ============================================================================

create or replace function public.search_companies_unified(p_query text, p_limit integer default 25)
returns table (
  origin text, id uuid, name text, cr_number text, unified_number text,
  region text, city text, capital numeric, trust_score integer,
  snapshot_period text, in_marsad boolean,
  registration_type text, legal_entity text, registration_date text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_q      text := btrim(coalesce(p_query, ''));
  v_limit  int  := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_digits text;
  v_ds     uuid := public.published_registry_dataset();
begin
  if v_q = '' then
    return;
  end if;

  if public.get_current_user_id() is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  v_digits := nullif(regexp_replace(translate(v_q, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'), '');

  return query
  (
    select 'marsad'::text, c.id, c.name::text, c.cr_number::text, c.unified_number::text,
           c.region::text, c.city::text, c.capital, ts.score, null::text, true,
           null::text, c.entity_type::text, null::text
      from public.companies c
      left join public.trust_scores ts on ts.company_id = c.id
     where c.status = 'active'
       and ((v_digits is not null and (c.cr_number = v_digits or c.unified_number = v_digits))
            or c.name ilike '%' || v_q || '%')
     order by (v_digits is not null and c.cr_number = v_digits) desc,
              (c.name = v_q) desc, length(c.name)
     limit v_limit
  )
  union all
  (
    select 'registry'::text, g.id, g.name, g.cr_number, g.unified_number,
           g.region, g.city, g.capital, null::int, g.snapshot_period, false,
           g.registration_type, g.legal_entity, g.registration_date
      from (
        select distinct on (r.cr_number) r.*
          from public.government_company_registry r
         -- The gate. Without it a load that stopped halfway is indistinguishable
         -- from the register itself.
         where r.dataset_id = v_ds
           and ((v_digits is not null and (r.cr_number = v_digits or r.unified_number = v_digits))
                or r.name ilike '%' || v_q || '%')
         order by r.cr_number, r.snapshot_at desc nulls last, r.imported_at desc
         limit v_limit * 4
      ) g
     where not exists (
       select 1 from public.companies c
        where c.cr_number = g.cr_number and c.status = 'active')
     order by (v_digits is not null and g.cr_number = v_digits) desc,
              (g.name = v_q) desc, length(g.name)
     limit v_limit
  );
end;
$function$;

/**
 * Adding a Ministry record to Marsad, from the published generation only.
 *
 * A record from a half-loaded generation is not a record the Ministry
 * published — it is a row that happened to arrive before the connection died.
 */
create or replace function public.add_registry_company_to_marsad(p_registry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  g          public.government_company_registry;
  v_existing uuid;
  v_company  uuid;
  v_user     text := public.get_current_user_id();
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select * into g from public.government_company_registry
   where id = p_registry_id and dataset_id = public.published_registry_dataset();

  if g.id is null then
    raise exception 'السجل غير موجود في المجموعة المنشورة';
  end if;

  select c.id into v_existing from public.companies c where c.cr_number = g.cr_number limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.companies (
    name, cr_number, unified_number, capital, entity_type,
    region, city, source, status, government_company_id, verified, verified_at,
    verification_source)
  values (
    g.name, g.cr_number, g.unified_number, g.capital, g.legal_entity,
    g.region, g.city, 'official', 'active', g.id, true, now(),
    'وزارة التجارة')
  returning id into v_company;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_user, 'company_added_from_registry', 'company', v_company::text,
          jsonb_build_object('snapshot', g.snapshot_period, 'cr_number', g.cr_number,
                             'dataset_id', g.dataset_id));

  return v_company;
end;
$fn$;

-- ============================================================================
-- Publishing, and taking it back
-- ============================================================================

/**
 * Make a verified generation the live one.
 *
 * The shrink question is asked here rather than at validation, because it is
 * not a defect — a register can genuinely shrink — but it is never something
 * to discover afterwards. It needs a person to say yes.
 */
create or replace function public.import_job_publish(
  p_job_id         uuid,
  p_confirm_shrink boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j        public.import_jobs;
  v_prev   bigint;
  v_tol    numeric;
  v_shrink numeric;
  v_diff   jsonb;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'النشر من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;

  -- Only a generation that passed every check. `verify` is what sets `ready`,
  -- and there is no other way into it.
  if j.status <> 'ready' then
    raise exception 'المهمّة في حالة «%» — لا تُنشر إلا بعد اجتياز الفحص', j.status;
  end if;

  select coalesce((value ->> 'shrink_tolerance_pct')::numeric, 10) into v_tol
    from public.system_settings where key = 'registry_source_spec';

  select rows_loaded into v_prev from public.import_jobs
   where dataset_id = j.previous_dataset_id;

  v_shrink := case when coalesce(v_prev, 0) > 0
                   then round(((v_prev - j.rows_loaded)::numeric / v_prev) * 100, 2)
                   else 0 end;

  -- In RAISE, `%` is the placeholder — there is no `%s`. The first version
  -- wrote `%%%s` and printed «أصغر بـ%96.02s», which is a message about a
  -- number nobody can read.
  if v_shrink > v_tol and not coalesce(p_confirm_shrink, false) then
    raise exception 'الجيل الجديد أصغر بنسبة % بالمئة من السابق (% صفّاً ← % صفّاً) — يحتاج تأكيداً صريحاً',
      v_shrink, v_prev, j.rows_loaded;
  end if;

  v_diff := public.import_job_compute_diff(p_job_id);

  update public.system_settings
     set value = to_jsonb(j.dataset_id::text), updated_at = now()
   where key = 'published_registry_dataset';

  update public.import_jobs
     set status = 'published', published_at = now(), finished_at = now(),
         verification = j.verification || jsonb_build_object(
           'publish', jsonb_build_object(
             'shrink_pct', v_shrink, 'confirmed_shrink', coalesce(p_confirm_shrink, false),
             'previous_rows', v_prev, 'diff', v_diff))
   where id = p_job_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (public.get_current_user_id(), 'platform_admin', 'registry_dataset_published',
          'import_job', p_job_id::text,
          jsonb_build_object('dataset_id', j.dataset_id, 'rows', j.rows_loaded,
                             'previous_dataset_id', j.previous_dataset_id,
                             'shrink_pct', v_shrink, 'diff', v_diff));

  return jsonb_build_object('ok', true, 'dataset_id', j.dataset_id,
                            'rows', j.rows_loaded, 'diff', v_diff);
end;
$fn$;

/**
 * Point back at an earlier generation.
 *
 * The rows of the generation being left are not touched. Rollback is a change
 * of which one is read, which is why it is instant and why it can be undone by
 * doing it again in the other direction.
 */
create or replace function public.import_job_rollback(
  p_target_dataset_id uuid,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_target public.import_jobs;
  v_now    uuid := public.published_registry_dataset();
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'التراجع من صلاحيات مسؤول المنصة';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب التراجع مطلوب';
  end if;

  select * into v_target from public.import_jobs where dataset_id = p_target_dataset_id;
  if v_target.id is null then
    raise exception 'لا مهمّة لهذه المجموعة';
  end if;
  if v_target.status not in ('published', 'rolled_back') then
    raise exception 'المجموعة الهدف لم تُنشر قط (حالتها «%»)', v_target.status;
  end if;
  if not exists (select 1 from public.government_company_registry
                  where dataset_id = p_target_dataset_id limit 1) then
    raise exception 'صفوف المجموعة الهدف لم تعد موجودة';
  end if;
  if v_now = p_target_dataset_id then
    raise exception 'هذه المجموعة منشورة بالفعل';
  end if;

  update public.import_jobs
     set status = 'rolled_back',
         notes = notes || jsonb_build_object('rolled_back_at', now(), 'reason', p_reason)
   where dataset_id = v_now and status = 'published';

  update public.import_jobs set status = 'published' where dataset_id = p_target_dataset_id;

  update public.system_settings
     set value = to_jsonb(p_target_dataset_id::text), updated_at = now()
   where key = 'published_registry_dataset';

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (public.get_current_user_id(), 'platform_admin', 'registry_dataset_rolled_back',
          'import_job', v_target.id::text,
          jsonb_build_object('from_dataset', v_now, 'to_dataset', p_target_dataset_id,
                             'reason', p_reason));

  return jsonb_build_object('ok', true, 'published_dataset', p_target_dataset_id);
end;
$fn$;

/**
 * Stop a job, and clear what it loaded.
 *
 * The rows of an unpublished generation are not history — nothing ever read
 * them and nothing ever will. The job, its errors and its verdicts stay, which
 * is the part that explains what happened. A retry starts a new generation from
 * zero; half a file plus half another is not data.
 */
create or replace function public.import_job_cancel(p_job_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  j       public.import_jobs;
  v_gone  bigint;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'الإلغاء من صلاحيات مسؤول المنصة';
  end if;

  select * into j from public.import_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'المهمّة غير موجودة'; end if;
  if j.status = 'published' then
    raise exception 'المجموعة منشورة — استخدم التراجع لا الإلغاء';
  end if;
  if j.status in ('cancelled', 'rolled_back') then
    raise exception 'المهمّة مُغلقة بالفعل';
  end if;

  delete from public.government_company_registry where dataset_id = j.dataset_id;
  get diagnostics v_gone = row_count;

  update public.import_jobs
     set status = 'cancelled', finished_at = now(),
         failure_reason = coalesce(nullif(btrim(p_reason), ''), failure_reason),
         notes = notes || jsonb_build_object('discarded_rows', v_gone)
   where id = p_job_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (public.get_current_user_id(), 'platform_admin', 'registry_import_cancelled',
          'import_job', p_job_id::text,
          jsonb_build_object('dataset_id', j.dataset_id, 'discarded_rows', v_gone,
                             'reason', p_reason));

  return jsonb_build_object('ok', true, 'discarded_rows', v_gone);
end;
$fn$;

revoke all on function public.import_job_publish(uuid, boolean) from anon, public;
revoke all on function public.import_job_rollback(uuid, text) from anon, public;
revoke all on function public.import_job_cancel(uuid, text) from anon, public;
grant execute on function public.import_job_publish(uuid, boolean) to authenticated;
grant execute on function public.import_job_rollback(uuid, text) to authenticated;
grant execute on function public.import_job_cancel(uuid, text) to authenticated;
