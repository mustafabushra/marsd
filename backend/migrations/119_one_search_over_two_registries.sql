-- One search over two registries
-- ============================================================================
--
-- A person looking for a company does not know, and should not have to know,
-- whether Marsad already tracks it. They know a name, or the unified number on
-- an invoice, or the registration number on a contract. So there is one search
-- box and one list of results, and each result says which it is.
--
-- Marsad's own companies come first. They are the ones with reports, a trust
-- score and a history — the answer somebody searching Marsad is usually looking
-- for. A government row is a company that exists; a Marsad row is a company
-- there is something to say about.
--
-- ============================================================================
-- The same company in both, and in several quarters
-- ============================================================================
-- A company Marsad tracks is very often in the register too, and the register
-- holds it once per published quarter. Showing it four times is not a search
-- result, it is a filing cabinet.
--
-- So: a government row whose registration number already belongs to a Marsad
-- company is dropped — the Marsad row is the same company and says more. And of
-- the quarters that remain, only the most recent is shown, with the others
-- reachable from the company's own page rather than crowding the list.

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
  in_marsad           boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := btrim(coalesce(p_query, ''));
  v_limit int  := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_digits text;
begin
  if v_q = '' then
    return;
  end if;

  -- Signing in is the price of searching, as it already is everywhere else in
  -- the product. The register is public data, but who searched for whom is not
  -- something to hand to anonymous traffic.
  if public.get_current_user_id() is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  -- A number typed with spaces, dashes or Arabic-Indic digits is the same
  -- number. Somebody copying a registration number off a contract should not
  -- have to clean it first.
  v_digits := nullif(regexp_replace(translate(v_q, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'), '');

  return query
  -- --- Marsad's own, first ---------------------------------------------------
  (
    select 'marsad'::text,
           c.id,
           c.name::text,
           c.cr_number::text,
           c.unified_number::text,
           c.region::text,
           c.city::text,
           c.capital,
           ts.score,
           null::text,
           true
      from public.companies c
      left join public.trust_scores ts on ts.company_id = c.id
     where c.approved
       and (
         (v_digits is not null and (c.cr_number = v_digits or c.unified_number = v_digits))
         or c.name ilike '%' || v_q || '%'
       )
     order by
       -- An exact number is the thing that was asked for, not a suggestion.
       (v_digits is not null and c.cr_number = v_digits) desc,
       (c.name = v_q) desc,
       length(c.name)
     limit v_limit
  )

  union all

  -- --- The register, for what Marsad does not have ---------------------------
  (
    select 'government'::text,
           g.id,
           g.name,
           g.cr_number,
           g.unified_number,
           g.region,
           g.city,
           g.capital,
           null::int,
           g.snapshot_period,
           false
      from (
        -- The most recent quarter only. `distinct on` over imported_at keeps
        -- the newest publication of each registration and discards the rest,
        -- which are still on the record and still reachable — just not four
        -- times in one list.
        select distinct on (r.cr_number) r.*
          from public.government_company_registry r
         where (v_digits is not null and (r.cr_number = v_digits or r.unified_number = v_digits))
            or r.name ilike '%' || v_q || '%'
         order by r.cr_number, r.imported_at desc
         limit v_limit * 4
      ) g
     where not exists (
       -- Already in Marsad under the same registration number. The Marsad row
       -- above is this company and carries more.
       select 1 from public.companies c
        where c.cr_number = g.cr_number and c.approved
     )
     order by
       (v_digits is not null and g.cr_number = v_digits) desc,
       (g.name = v_q) desc,
       length(g.name)
     limit v_limit
  );
end;
$$;

revoke all on function public.search_companies_unified(text, int) from anon, public;
grant execute on function public.search_companies_unified(text, int) to authenticated;
