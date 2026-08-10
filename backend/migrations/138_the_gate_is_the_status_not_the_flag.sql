-- The gate is the status, not the flag
-- ============================================================================
--
-- Two columns guarded the same door and nothing kept them agreeing.
--
--   the search functions   →  where c.approved
--   Search.jsx             →  status === 'active' || status === 'approved'
--
-- `approved` defaults to true, so a row created with defaults alone was
-- discoverable while its own registration was still `pending`. I proved it: a
-- companies row inserted with nothing but defaults came back from
-- `search_companies_unified` for any signed-in user.
--
-- It is not exposed today — both real registration paths write `approved:false`
-- explicitly — but a third path that forgets the column inherits a company
-- nobody approved, published.
--
-- One rule now, in one place:
--
--     a company is visible  ⟺  companies.status = 'active'
--
-- These four bodies are the live definitions with that single clause changed
-- and nothing else touched. `approved` is still written and still correct; it
-- simply stops being what anyone asks. It is removed in a later step, once a
-- full cycle has proved nothing reads it.

-- search_companies_unified — 2 بوّابة
CREATE OR REPLACE FUNCTION public.search_companies_unified(p_query text, p_limit integer DEFAULT 25)
 RETURNS TABLE(origin text, id uuid, name text, cr_number text, unified_number text, region text, city text, capital numeric, trust_score integer, snapshot_period text, in_marsad boolean, registration_type text, legal_entity text, registration_date text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_q      text := btrim(coalesce(p_query, ''));
  v_limit  int  := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_digits text;
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
    select 'government'::text, g.id, g.name, g.cr_number, g.unified_number,
           g.region, g.city, g.capital, null::int, g.snapshot_period, false,
           g.registration_type,
           -- The specific legal form where the file gives one. The sheet
           -- carries the column twice: «شركة» and «شركة ذات مسؤولية محدودة
           -- شخص واحد». The second is the one a form wants.
           coalesce(g.legal_entity_2, g.legal_entity),
           g.registration_date
      from (
        select distinct on (r.cr_number) r.*
          from public.government_company_registry r
         where (v_digits is not null and (r.cr_number = v_digits or r.unified_number = v_digits))
            or r.name ilike '%' || v_q || '%'
         order by r.cr_number, r.snapshot_at desc nulls last, r.imported_at desc
         limit v_limit * 4
      ) g
     where not exists (
       select 1 from public.companies c
        where c.cr_number = g.cr_number and c.status = 'active'
     )
     order by (v_digits is not null and g.cr_number = v_digits) desc,
              (g.name = v_q) desc, length(g.name)
     limit v_limit
  );
end;
$function$;

-- search_companies_fts — 1 بوّابة
CREATE OR REPLACE FUNCTION public.search_companies_fts(search_query text, limit_val integer DEFAULT 20, offset_val integer DEFAULT 0)
 RETURNS TABLE(id uuid, name character varying, cr_number character varying, sector character varying, city character varying, created_at timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id, c.name::varchar, c.cr_number::varchar,
         c.sector::varchar, c.city::varchar,
         c.created_at::timestamp
    from public.companies c
   where public.get_current_user_id() is not null
     and c.status = 'active'
     and (
       c.cr_number = trim(search_query)
       or c.name ilike '%' || trim(search_query) || '%'
       or c.commercial_name ilike '%' || trim(search_query) || '%'
     )
   order by
     (c.cr_number = trim(search_query)) desc,
     (c.name = trim(search_query)) desc,
     similarity(c.name, trim(search_query)) desc,
     c.name
   limit greatest(1, least(limit_val, 100))
  offset greatest(0, offset_val);
$function$;

-- count_companies_fts — 1 بوّابة
CREATE OR REPLACE FUNCTION public.count_companies_fts(search_query text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::int
    from public.companies c
   where public.get_current_user_id() is not null
     and c.status = 'active'
     and (
       c.cr_number = trim(search_query)
       or c.name ilike '%' || trim(search_query) || '%'
       or c.commercial_name ilike '%' || trim(search_query) || '%'
     );
$function$;

-- autocomplete_companies — 1 بوّابة
CREATE OR REPLACE FUNCTION public.autocomplete_companies(search_query text, limit_val integer DEFAULT 10)
 RETURNS TABLE(id uuid, name character varying, cr_number character varying)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id, c.name::varchar, c.cr_number::varchar
    from public.companies c
   where public.get_current_user_id() is not null
     and c.status = 'active'
     and length(trim(search_query)) > 0
     and (c.name ilike '%' || trim(search_query) || '%'
          or c.cr_number like trim(search_query) || '%')
   order by
     (c.cr_number like trim(search_query) || '%') desc,
     (c.name ilike trim(search_query) || '%') desc,
     length(c.name),
     c.name
   limit greatest(1, least(limit_val, 25));
$function$;
