-- Migration: 071_repair_unlinked_tenants.sql
-- Purpose: a tenant with no company row is a customer with an account and no
--          record in the registry it just joined.
--
-- ============================================================================
-- What was found
-- ============================================================================
-- Opening the documents section as شركة الدجاج الوطني answered "لا توجد شركة
-- مرتبطة بحسابك". The tenant is active, has a CR number, a subscription and a
-- user — and there is no company row matching it anywhere, and no registration
-- request either.
--
-- createTenantAndUser creates the company and then links it:
--
--   .from('tenants').update({ company_id }).eq('id', tenantData.id)
--   if (tenantUpdateError) throw ...
--
-- with no .select() and no row count. An UPDATE filtered out by RLS raises
-- nothing and returns nothing, so the absence of an error was read as success
-- and registration continued to the subscription step. That is now checked in
-- api.ts; this repairs what it already produced and stops it recurring silently.
--
-- The consequence is larger than one screen. An unlinked tenant has no trust
-- report, cannot upload documents, cannot be found in search, and cannot be
-- reported on — it paid to join a registry it is not in.

-- ============================================================================
-- 1) Repair
-- ============================================================================
-- Built from what the tenant already holds. Marked as community-sourced and
-- unapproved: this record was never reviewed by anyone, and approving it here
-- to make the number look tidy would put an unverified company into the registry
-- with a badge it did not earn.
do $blk$
declare
  t       record;
  v_id    uuid;
  v_fixed int := 0;
begin
  for t in
    select id, name, cr_number
      from public.tenants
     where company_id is null
       and coalesce(status, 'active') <> 'deleted'
  loop
    -- A company may already exist under the same registration; link rather than
    -- duplicate. Two rows for one CR number is worse than none.
    select id into v_id from public.companies
     where cr_number is not null and cr_number = t.cr_number
     limit 1;

    if v_id is null then
      insert into public.companies (name, cr_number, source, approved, status)
      values (t.name, t.cr_number, 'community', false, 'active')
      returning id into v_id;
      raise notice 'أُنشئت شركة للكيان %: %', t.name, v_id;
    else
      raise notice 'رُبط الكيان % بشركة قائمة %', t.name, v_id;
    end if;

    update public.tenants set company_id = v_id where id = t.id;
    v_fixed := v_fixed + 1;
  end loop;

  raise notice 'كيانات أُصلحت: %', v_fixed;
end $blk$;

-- ============================================================================
-- 2) Make the gap visible instead of silent
-- ============================================================================
-- Not a NOT NULL constraint: a tenant legitimately exists for a moment before
-- its company is created, and forcing the column would break registration
-- itself. What was missing is anyone noticing afterwards, so platform_health
-- reports it — the screen already lists consistency checks, and this is one.
create or replace function public.platform_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'access', jsonb_build_object(
      'tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r'),
      'rls_enabled', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
      'without_rls', coalesce((select jsonb_agg(c.relname)
                                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                where n.nspname = 'public' and c.relkind = 'r'
                                  and not c.relrowsecurity), '[]'::jsonb),
      'definer_without_search_path', coalesce((select jsonb_agg(p.proname)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                           where c like 'search_path=%')), '[]'::jsonb)),
    'data', jsonb_build_object(
      'tenants',            (select count(*) from public.tenants),
      'companies',          (select count(*) from public.companies),
      'reports',            (select count(*) from public.reports),
      'users',              (select count(*) from public.users),
      'reports_no_reporter',(select count(*) from public.reports where reporter_tenant_id is null),
      -- The check this migration exists for. A customer with an account and no
      -- record in the registry is invisible to search, to reports and to its own
      -- trust score, and nothing surfaced it until someone opened a screen.
      'tenants_no_company', (select count(*) from public.tenants
                              where company_id is null
                                and coalesce(status, 'active') <> 'deleted'),
      'tenants_no_plan',    (select count(*) from public.tenants t
                              where not exists (select 1 from public.subscriptions s
                                                 where s.tenant_id = t.id and s.status = 'active')),
      'users_no_tenant',    (select count(*) from public.users
                              where tenant_id is null and role not in ('platform_admin','reviewer')),
      'documents_pending',  (select count(*) from public.company_documents where status = 'pending'),
      'users_never_logged_in', (select count(*) from public.users where last_login_at is null))
  ) into v;

  return v;
end $fn$;

grant execute on function public.platform_health() to authenticated;
revoke all on function public.platform_health() from public, anon;

-- ============================================================================
-- 3) Verify
-- ============================================================================
do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.tenants
   where company_id is null and coalesce(status, 'active') <> 'deleted';
  if v_n > 0 then
    raise exception 'ما زال % كياناً بلا شركة مرتبطة', v_n;
  end if;

  -- And every repaired tenant must now resolve to a real company row.
  select count(*) into v_n from public.tenants t
   where t.company_id is not null
     and not exists (select 1 from public.companies c where c.id = t.company_id);
  if v_n > 0 then
    raise exception '% كياناً يشير إلى شركة غير موجودة', v_n;
  end if;

  raise notice '✅ كل كيان مرتبط بشركة قائمة · الفحص يرصد التكرار مستقبلاً';
end $blk$;
