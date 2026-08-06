-- Migration: 111_the_price_list_comes_from_the_plans.sql
-- Purpose: the public pricing page quoted prices that do not exist.
--
-- ============================================================================
-- What a visitor was being told
-- ============================================================================
-- /pricing rendered four cards hand-written in src/data/mockData.js. The plans
-- table says something else entirely:
--
--     الباقة        الصفحة تقول      قاعدة البيانات        نشطة؟
--     مجاني         3 شركات/شهر      10                    نعم
--     أساسي         99 ر.س           1499 ر.س              لا
--     احترافي       299 ر.س          4999 ر.س              لا
--     مؤسسات        «مخصص»           9999 ر.س              لا
--     شريك مرصد     غير معروضة       —                     نعم
--
-- So the page understated three prices by a factor of fifteen, advertised three
-- plans that are switched off and cannot be bought, and hid one that is on. Its
-- buttons had no onClick at all. Editing a plan in the admin panel changed none
-- of it, which is the opposite of how everything else here works.
--
-- ============================================================================
-- Why an RPC and not a direct read
-- ============================================================================
-- `plans` is already readable by anyone — plans_select_all is `using (true)` —
-- but the labels for feature keys live in system_settings.feature_catalog, and
-- RLS keeps that from a visitor. Rather than copy those labels into the page
-- (where they would drift the first time one changed), one SECURITY DEFINER
-- function hands back the plans and the catalogue together.
--
-- It returns facts, not sentences. Which limits are worth showing and how to
-- word them is the page's business; a paragraph assembled in SQL is a paragraph
-- nobody can change without a migration.
--
-- ============================================================================
-- "Not for sale" becomes a switch
-- ============================================================================
-- شريك مرصد is active — it grants real entitlements — and must not appear on a
-- price list: it is awarded for contribution, not bought. The obvious shortcut
-- is `where code <> 'partner'` in the query. That hides a business rule inside a
-- string comparison, and the next plan of the same kind would need another
-- migration to hide it too. A column says it out loud, and the admin panel can
-- set it.

alter table public.plans
  add column if not exists listed_publicly boolean not null default true;

comment on column public.plans.listed_publicly is
  'هل تظهر هذه الباقة في صفحة الأسعار العامة. باقة تُمنح ولا تُباع تكون false.';

-- Awarded for contribution. Its own page explains it; the price list would only
-- invite people to buy something that is not on sale.
update public.plans set listed_publicly = false where code = 'partner';

-- ============================================================================
-- The price list
-- ============================================================================
create or replace function public.public_plans()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', p.code,
               'name', p.name,
               'description', p.description,
               'priceMonthly', p.price_monthly,
               'isDefault', p.is_default,
               'giveToGet', p.give_to_get_enabled,
               'limits', coalesce(p.limits, '{}'::jsonb),
               'features', to_jsonb(coalesce(p.features, '{}'::text[]))
             ) order by p.price_monthly nulls first, p.name)
        from public.plans p
       where p.active
         and p.listed_publicly), '[]'::jsonb),
    -- The labels, so the page never has to keep its own copy.
    'featureLabels', coalesce((
      select value from public.system_settings where key = 'feature_catalog'), '{}'::jsonb)
  );
$$;

comment on function public.public_plans() is
  'باقات صفحة الأسعار العامة: النشطة والمعروضة فقط، ومعها أسماء المزايا. حقائق لا جُمل — الصياغة في الواجهة.';

revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;

-- ============================================================================
-- Prove it
-- ============================================================================
do $blk$
declare
  v jsonb;
  v_codes text[];
begin
  begin
    set local role anon;
    perform set_config('request.jwt.claims', null, true);
    v := public.public_plans();
    reset role;

    if v -> 'plans' is null then
      raise exception 'الدالة لم تُرجع قائمة باقات';
    end if;

    select array_agg(x ->> 'code') into v_codes
      from jsonb_array_elements(v -> 'plans') x;

    -- Everything listed must be buyable, and nothing switched off may appear.
    if exists (select 1 from public.plans p
                where p.code = any(coalesce(v_codes, '{}'))
                  and (not p.active or not p.listed_publicly)) then
      raise exception 'الصفحة تعرض باقة غير نشطة أو غير معروضة: %', v_codes;
    end if;

    if 'partner' = any(coalesce(v_codes, '{}')) then
      raise exception 'باقة الشراكة معروضة للبيع';
    end if;

    -- The prices are the real ones. This is the whole point: the page used to
    -- say 99 where the row says 1499.
    if exists (
      select 1 from jsonb_array_elements(v -> 'plans') x
        join public.plans p on p.code = x ->> 'code'
       where (x ->> 'priceMonthly')::numeric is distinct from p.price_monthly) then
      raise exception 'سعر معروض لا يطابق الصف';
    end if;

    if v -> 'featureLabels' = '{}'::jsonb then
      raise notice '⚠️  دليل المزايا فارغ — أسماء المزايا لن تظهر';
    end if;

    raise notice '✅ قائمة الأسعار من الباقات نفسها: %', coalesce(array_to_string(v_codes, '، '), 'لا شيء');
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
