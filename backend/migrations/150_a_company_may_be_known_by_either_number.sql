-- A company may be known by either number
-- ============================================================================
--
-- 438,067 of the register's 1,912,738 rows carry a unified number and no
-- registration number — recent main registrations issued under the regime where
-- الرقم الموحد is the identifier. They are 23% of the national register.
--
-- Marsad could find them and could not take them: `companies.cr_number` is NOT
-- NULL, so `add_registry_company_to_marsad` would fail on every one. A search
-- result that cannot be acted on is worse than one that is missing — it looks
-- like the product working.
--
-- Two identifiers now, either of which is enough.

-- ============================================================================
-- Dedup on the other number too
-- ============================================================================
-- `unique (dataset_id, cr_number)` permits unlimited NULLs, so those 438,067
-- rows had no uniqueness guarantee at all. They are unique in this file; the
-- index is what makes that true of every file.

create unique index if not exists government_registry_unified_uniq
  on public.government_company_registry (dataset_id, unified_number)
  where unified_number is not null;

-- ============================================================================
-- A company row may carry either
-- ============================================================================

alter table public.companies alter column cr_number drop not null;

-- One of them must be there. A company with neither cannot be matched to
-- anything, and would be a row nobody could ever find on purpose.
alter table public.companies drop constraint if exists companies_has_identifier;
alter table public.companies add constraint companies_has_identifier check (
  coalesce(nullif(btrim(cr_number), ''), '') <> ''
  or coalesce(nullif(btrim(unified_number), ''), '') <> ''
);

-- `cr_number` is already unique. The other number needs the same protection, or
-- the same company arrives twice by the path that has no CR number.
create unique index if not exists companies_unified_number_uniq
  on public.companies (unified_number)
  where unified_number is not null;

comment on column public.companies.cr_number is
  'رقم السجل التجاري — قد يكون فارغاً لسجل صادر بالرقم الموحّد وحده';

/**
 * Adding a Ministry record to Marsad, by whichever number it has.
 *
 * The «already here?» test moves with it: matching on `cr_number` alone would
 * add a second copy of every company that has only a unified number, every time
 * somebody pressed the button.
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

  select c.id into v_existing
    from public.companies c
   where (nullif(btrim(g.cr_number), '') is not null
          and c.cr_number = btrim(g.cr_number))
      or (nullif(btrim(g.unified_number), '') is not null
          and c.unified_number = btrim(g.unified_number))
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.companies (
    name, cr_number, unified_number, capital, entity_type,
    region, city, source, status, government_company_id, verified, verified_at,
    verification_source)
  values (
    g.name, nullif(btrim(g.cr_number), ''), nullif(btrim(g.unified_number), ''),
    g.capital, g.legal_entity, g.region, g.city, 'official', 'active', g.id,
    true, now(), 'وزارة التجارة')
  returning id into v_company;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_user, 'company_added_from_registry', 'company', v_company::text,
          jsonb_build_object('snapshot', g.snapshot_period,
                             'cr_number', g.cr_number,
                             'unified_number', g.unified_number,
                             'dataset_id', g.dataset_id));

  return v_company;
end;
$fn$;

/**
 * Search, by either number, and «already in Marsad» by either too.
 */
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
        select distinct on (coalesce(nullif(btrim(r.cr_number), ''), r.unified_number)) r.*
          from public.government_company_registry r
         where r.dataset_id = v_ds
           and ((v_digits is not null and (r.cr_number = v_digits or r.unified_number = v_digits))
                or r.name ilike '%' || v_q || '%')
         order by coalesce(nullif(btrim(r.cr_number), ''), r.unified_number),
                  r.snapshot_at desc nulls last, r.imported_at desc
         limit v_limit * 4
      ) g
     where not exists (
       select 1 from public.companies c
        where c.status = 'active'
          and ((nullif(btrim(g.cr_number), '') is not null and c.cr_number = btrim(g.cr_number))
            or (nullif(btrim(g.unified_number), '') is not null
                and c.unified_number = btrim(g.unified_number))))
     order by (v_digits is not null and g.cr_number = v_digits) desc,
              (g.name = v_q) desc, length(g.name)
     limit v_limit
  );
end;
$function$;
