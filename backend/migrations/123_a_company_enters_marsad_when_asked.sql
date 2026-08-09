-- A company enters Marsad when somebody asks for it
-- ============================================================================
--
-- The register holds every commercial registration in the Kingdom. Marsad holds
-- the companies it tracks. Searching the first must not populate the second —
-- otherwise the trust score, the review queue and every admin screen end up
-- working over a million records nobody asked about.
--
-- So this is the only door. It takes a government row and makes a company from
-- it, and `government_company_id` records where it came from — permanently, and
-- distinguishably from a company a person typed in.

create or replace function public.add_registry_company_to_marsad(p_registry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g public.government_company_registry;
  v_existing uuid;
  v_company uuid;
  v_user text := public.get_current_user_id();
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select * into g from public.government_company_registry where id = p_registry_id;
  if g.id is null then
    raise exception 'السجل غير موجود';
  end if;

  -- Already here. Returned rather than refused: somebody pressing «add» on a
  -- company Marsad already has wants to end up looking at it, and an error
  -- telling them it exists is a dead end where a destination was expected.
  select c.id into v_existing
    from public.companies c
   where c.cr_number = g.cr_number
   limit 1;

  if v_existing is not null then
    -- Record the origin if this row is the first to explain it.
    update public.companies
       set government_company_id = coalesce(government_company_id, g.id)
     where id = v_existing;
    return v_existing;
  end if;

  -- The Ministry issued this record. It does not queue behind a review that
  -- would be checking the government's own register against itself.
  insert into public.companies (
    name, cr_number, unified_number, entity_type, capital,
    region, city, source, status, approved, government_company_id
  ) values (
    g.name, g.cr_number, g.unified_number,
    coalesce(g.legal_entity_2, g.legal_entity), g.capital,
    g.region, g.city, 'official', 'active', true, g.id
  )
  returning id into v_company;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta, created_at)
  values (v_user, 'company_added_from_registry', 'company', v_company::text,
          jsonb_build_object('cr_number', g.cr_number, 'snapshot', g.snapshot_period),
          now());

  return v_company;
end;
$$;

revoke all on function public.add_registry_company_to_marsad(uuid) from anon, public;
grant execute on function public.add_registry_company_to_marsad(uuid) to authenticated;
