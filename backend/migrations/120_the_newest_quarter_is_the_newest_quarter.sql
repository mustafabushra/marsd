-- The newest quarter is the newest quarter, not the newest import
-- ============================================================================
--
-- The unified search shows one row per company: the most recent publication it
-- appears in. It decided «most recent» by `imported_at`, which is when we
-- happened to load the file.
--
-- Those are different things, and the difference bites twice. Importing Q2
-- after Q3 — catching up on a quarter that was missed — would make Q2 look
-- newer. And two files loaded in one session share a timestamp exactly, because
-- `now()` is fixed for a transaction, so the tie is broken arbitrarily. The
-- probe hit the second one and reported Q2 where Q3 was expected.
--
-- So the row carries the period it describes, and the search orders by that.

alter table public.government_company_registry
  add column if not exists snapshot_at date;

-- Existing rows keep behaving: the import date is the best evidence available
-- for what was already loaded, and it is at least monotonic per file.
update public.government_company_registry
   set snapshot_at = imported_at::date
 where snapshot_at is null;

create index if not exists gov_registry_snapshot_idx
  on public.government_company_registry (cr_number, snapshot_at desc);

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

  -- A number typed with spaces, dashes or Arabic-Indic digits is the same
  -- number. Somebody copying one off a contract should not have to clean it.
  v_digits := nullif(regexp_replace(translate(v_q, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'), '');

  return query
  (
    select 'marsad'::text, c.id, c.name::text, c.cr_number::text, c.unified_number::text,
           c.region::text, c.city::text, c.capital, ts.score, null::text, true
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
           g.region, g.city, g.capital, null::int, g.snapshot_period, false
      from (
        -- The most recent *publication* of each registration. `snapshot_at`
        -- describes the quarter; `imported_at` only breaks a tie between two
        -- rows claiming the same one.
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
