-- A ministry record is a verified one
-- ============================================================================
--
-- A company brought in from the national register was created unverified. So the
-- official layer of its trust score gave it five points out of thirty — the
-- unified number and nothing else — while the company was, in fact, verified by
-- the authority that issues commercial registrations.
--
-- That is the exemption half-applied. We stopped asking for a scan it cannot
-- provide, and then scored it as though it had failed to provide one.
--
-- `verified` means «this company's identity has been checked». A row published
-- by the Ministry of Commerce is a stronger check than a photograph uploaded by
-- a user and read by a reviewer — the photograph was only ever the route to the
-- same certainty.
--
-- The national address stays empty, and its five points stay unearned. The
-- Ministry does not publish it, and it is exactly the kind of thing a company
-- completes when it claims its own profile. That is a reason to claim it.

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

  select c.id into v_existing
    from public.companies c
   where c.cr_number = g.cr_number
   limit 1;

  if v_existing is not null then
    update public.companies
       set government_company_id = coalesce(government_company_id, g.id)
     where id = v_existing;
    return v_existing;
  end if;

  insert into public.companies (
    name, cr_number, unified_number, entity_type, capital,
    region, city, source, status, approved, government_company_id,
    verified, verified_at, verification_source
  ) values (
    g.name, g.cr_number, g.unified_number,
    coalesce(g.legal_entity_2, g.legal_entity), g.capital,
    g.region, g.city, 'official', 'active', true, g.id,
    -- Named, not left to the guard's default. The guard fills a missing source
    -- with the acting user's role, which would record «platform_admin» for a
    -- fact that has nothing to do with who pressed the button.
    --
    -- The column holds 30 characters and «وزارة التجارة — البيانات المفتوحة» is
    -- 33. Shortened rather than widening the column: the source is a label
    -- shown beside a badge, the shorter one says the same thing, and altering a
    -- column used across the product to fit one string is the larger change.
    true, now(), 'وزارة التجارة'
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
