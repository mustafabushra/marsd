-- The search returns enough to fill a form
-- ============================================================================
--
-- «Add company» now checks the register while somebody types the registration
-- number, and offers to fill the form from it rather than turning them away
-- after they have entered everything.
--
-- For that the search has to hand back what the form asks for. It returned the
-- name, the numbers, the region, the city and the capital — but not the legal
-- form, the registration type or the registration date, which are three of the
-- fields a person would otherwise be typing by hand off the same document.
--
-- Added to the government branch only. A Marsad row already has a page of its
-- own and nothing to prefill.

create or replace function public.search_companies_unified(
  p_query text,
  p_limit int default 25
)
returns table (
  origin              text,
  id                  uuid,
  name                text,
  cr_number           text,
  unified_number      text,
  region              text,
  city                text,
  capital             numeric,
  trust_score         int,
  snapshot_period     text,
  in_marsad           boolean,
  registration_type   text,
  legal_entity        text,
  registration_date   text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
     where c.approved
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
        where c.cr_number = g.cr_number and c.approved
     )
     order by (v_digits is not null and g.cr_number = v_digits) desc,
              (g.name = v_q) desc, length(g.name)
     limit v_limit
  );
end;
$$;

revoke all on function public.search_companies_unified(text, int) from anon, public;
grant execute on function public.search_companies_unified(text, int) to authenticated;
