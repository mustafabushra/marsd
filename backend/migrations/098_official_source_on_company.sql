-- Migration: 098_official_source_on_company.sql
-- Purpose: keep the verification link and the official facts the form has no
--          box for, instead of reading them and throwing them away.
--
-- ============================================================================
-- Why two columns and not fifteen
-- ============================================================================
-- The Business Centre page prints things the add-company form does not ask for:
-- capital, company traits, the registration copy number, the annual confirmation
-- date, the managers, and the full activity list. They were being parsed and
-- discarded, which is the worst of both — the reader saw them, the record did
-- not keep them.
--
-- Adding a column per fact would mean a migration every time the portal prints
-- something new, and most of them are not queried, filtered or scored on. They
-- go into one jsonb whose shape is owned by the parser that produced it, next to
-- the version of that parser, so a value read a year ago can be told apart from
-- one read after the page was redesigned.
--
-- verification_url is separate because it is not a fact about the company — it
-- is where the facts came from, and the point of keeping it is being able to
-- return to it. A registry that cannot say where an entry came from is a registry
-- nobody should trust.

alter table public.companies
  add column if not exists verification_url text,
  add column if not exists official_data    jsonb;

comment on column public.companies.verification_url is
  'رابط صفحة التحقّق الرسمية التي استُخرجت منها البيانات — للرجوع إليه ومطابقته';
comment on column public.companies.official_data is
  'ما عرضته صفحة التحقّق ولا يوجد له حقل: رأس المال، صفات الشركة، رقم النسخة، التأكيد السنوي، المديرين، الأنشطة — ومعها إصدار المحلّل';

-- Only the portal's own verification pages belong in this column. A link to
-- anywhere else recorded as a company's official source would be a lie the
-- registry tells on its own behalf.
do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_verification_url_check') then
    alter table public.companies
      add constraint companies_verification_url_check
      check (
        verification_url is null
        or verification_url ~ '^https://qr\.saudibusiness\.gov\.sa/'
      );
  end if;
end $blk$;

-- Reading it back is what makes it worth storing.
create index if not exists idx_companies_verification_url
  on public.companies (verification_url) where verification_url is not null;

-- ============================================================================
-- The company file shows where the entry came from
-- ============================================================================
create or replace function public.company_official_source(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when public.get_current_user_id() is null then null
    else (select jsonb_build_object(
            'verification_url', c.verification_url,
            'official_data',    c.official_data,
            'has_source',       c.verification_url is not null)
            from public.companies c where c.id = p_company_id)
  end;
$fn$;

grant execute on function public.company_official_source(uuid) to authenticated;
revoke all on function public.company_official_source(uuid) from public, anon;

-- ============================================================================
-- Prove the constraint binds and the columns hold
-- ============================================================================
do $blk$
declare
  v_admin text; v_id uuid; v_raised boolean; v_back jsonb;
  v_cr text := '98' || lpad((floor(random() * 100000000))::text, 8, '0');
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  insert into public.companies (name, cr_number, approved, source, verification_url, official_data)
  values ('شركة فحص 098', v_cr, false, 'community',
          'https://qr.saudibusiness.gov.sa/viewcr?nCrNumber=abc%3D%3D',
          jsonb_build_object('capital', '500000', 'managers', jsonb_build_array('أحمد'),
                             'parser', '2026.08-1'))
  returning id into v_id;

  select public.company_official_source(v_id) into v_back;
  if (v_back ->> 'verification_url') is null then
    raise exception 'الرابط لم يُحفظ';
  end if;
  if (v_back #>> '{official_data,capital}') <> '500000' then
    raise exception 'البيانات الرسمية لم تُحفظ';
  end if;

  -- A link to anywhere else is not an official source.
  v_raised := false;
  begin
    update public.companies set verification_url = 'https://example.com/x' where id = v_id;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'قُبل رابط من خارج بوابة مركز الأعمال';
  end if;

  delete from public.company_documents where company_id = v_id;
  delete from public.companies where id = v_id;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ المصدر الرسمي يُحفظ ويُقرأ، والروابط الأخرى مرفوضة';
end $blk$;

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.companies where name like 'شركة فحص 098%';
  if v_n > 0 then raise exception 'بقيت % شركة من الفحص', v_n; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
