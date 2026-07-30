-- Migration: 069_profile_completion.sql
-- Purpose: tell a company exactly what its record is missing and what each gap
--          costs it, so completing the profile is an incentive rather than a
--          reminder.
--
-- ============================================================================
-- Why this shape
-- ============================================================================
-- A permanent "أكمل ملفك" banner is ignored within a week. People learn to skip
-- a bar that says the same thing every day and never changes. What does not get
-- ignored is a number attached to an action: the verification badge is worth 20
-- points on the official layer, a verified document 4, and a company that can
-- see that will send the paperwork.
--
-- So this returns the gaps priced, not a percentage. Every figure is read from
-- trust_score_rules — the same document the score itself reads — so a gap can
-- never advertise points the model would not actually award, and an operator
-- who changes a weight changes what the company is told in the same moment.
--
-- Official status is included read-only. A company must be able to see that
-- Marsad has recorded an insolvency against it; learning that from a customer
-- who just read its report is worse for everyone. It appears here as a fact
-- about them, never as a field.

create or replace function public.company_profile_completion(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_company  uuid;
  v_own      uuid;
  co         record;
  r          jsonb;
  v_doc_pts  numeric;
  v_doc_cap  numeric;
  v_field_pt numeric;
  v_verified int;
  v_gaps     jsonb := '[]'::jsonb;
  v_done     int := 0;
  v_total    int := 0;
  f          record;
begin
  if public.get_current_user_id() is null then
    return '{}'::jsonb;
  end if;

  select company_id into v_own from public.tenants where id = public.get_current_tenant_id();

  -- Defaults to the caller's own company, so the common case needs no argument
  -- and cannot be pointed at another company by accident.
  v_company := coalesce(p_company_id, v_own);
  if v_company is null then
    return jsonb_build_object('has_company', false);
  end if;

  -- Another company's gaps are Marsad's business, not a competitor's.
  if v_company is distinct from v_own
     and not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  select * into co from public.companies where id = v_company;
  if not found then
    return jsonb_build_object('has_company', false);
  end if;

  select value -> 'layers' -> 'official' into r
    from public.system_settings where key = 'trust_score_rules';
  v_doc_pts := coalesce((r ->> 'document_bonus')::numeric, 4);
  v_doc_cap := coalesce((r ->> 'document_bonus_cap')::numeric, 12);

  -- The completeness bonus is shared across the eight fields the platform layer
  -- counts, so each field is worth an eighth of it. Quoting the whole bonus per
  -- field would promise eight times what exists.
  select round(coalesce((value #>> '{layers,platform,profile_completeness_bonus}')::numeric, 10) / 8.0, 1)
    into v_field_pt from public.system_settings where key = 'trust_score_rules';

  select count(*) into v_verified
    from public.company_documents where company_id = v_company and status = 'verified';

  -- ── official layer ─────────────────────────────────────────────────────────
  v_total := v_total + 1;
  if coalesce(co.verified, false) then
    v_done := v_done + 1;
  else
    v_gaps := v_gaps || jsonb_build_object(
      'key', 'verification', 'label', 'توثيق الشركة من مرصد',
      'points', coalesce((r ->> 'verified_bonus')::numeric, 20),
      'layer', 'official', 'action', 'documents',
      'hint', 'ارفع سجلك التجاري ليراجعه فريق مرصد');
  end if;

  v_total := v_total + 1;
  if co.unified_number is not null then
    v_done := v_done + 1;
  else
    v_gaps := v_gaps || jsonb_build_object(
      'key', 'unified_number', 'label', 'الرقم الموحّد',
      'points', coalesce((r ->> 'unified_number_bonus')::numeric, 5),
      'layer', 'official', 'action', 'profile', 'hint', null);
  end if;

  v_total := v_total + 1;
  if co.national_address is not null then
    v_done := v_done + 1;
  else
    v_gaps := v_gaps || jsonb_build_object(
      'key', 'national_address', 'label', 'العنوان الوطني',
      'points', coalesce((r ->> 'national_address_bonus')::numeric, 5),
      'layer', 'official', 'action', 'profile', 'hint', null);
  end if;

  -- Priced at what the next document is actually worth: once the cap is reached
  -- the gap disappears rather than advertising points nobody would receive.
  v_total := v_total + 1;
  if v_verified * v_doc_pts >= v_doc_cap then
    v_done := v_done + 1;
  else
    v_gaps := v_gaps || jsonb_build_object(
      'key', 'documents', 'label', 'مستندات رسمية موثَّقة',
      'points', least(v_doc_pts, v_doc_cap - v_verified * v_doc_pts),
      'layer', 'official', 'action', 'documents',
      'hint', v_verified || ' موثَّق حتى الآن');
  end if;

  -- ── platform layer: the eight fields it counts, and only those ─────────────
  for f in
    select * from (values
      ('sector',         'القطاع',            co.sector is not null),
      ('city',           'المدينة',           co.city is not null),
      ('main_activity',  'النشاط الرئيسي',    co.main_activity is not null),
      ('entity_type',    'نوع الكيان',        co.entity_type is not null),
      ('phone',          'رقم الهاتف',        co.phone is not null),
      ('official_email', 'البريد الرسمي',     co.official_email is not null),
      ('website',        'الموقع الإلكتروني', co.website is not null),
      ('founding',       'تاريخ التأسيس',
         coalesce(co.founding_date::text, co.founded_year::text) is not null)
    ) as t(key, label, filled)
  loop
    v_total := v_total + 1;
    if f.filled then
      v_done := v_done + 1;
    else
      v_gaps := v_gaps || jsonb_build_object(
        'key', f.key, 'label', f.label, 'points', v_field_pt,
        'layer', 'platform', 'action', 'profile', 'hint', null);
    end if;
  end loop;

  return jsonb_build_object(
    'has_company',  true,
    'company_id',   v_company,
    'company_name', co.name,
    'completed',    v_done,
    'total',        v_total,
    'percent',      round(v_done * 100.0 / nullif(v_total, 0)),
    'gaps',         v_gaps,
    'points_available', (select coalesce(sum((g ->> 'points')::numeric), 0)
                           from jsonb_array_elements(v_gaps) g),
    'verified_documents', v_verified,
    'official_status', jsonb_build_object(
      'status', coalesce(co.official_status, 'none'),
      'at',     co.official_status_at,
      'note',   co.official_status_note));
end $fn$;

revoke all on function public.company_profile_completion(uuid) from public, anon;
grant execute on function public.company_profile_completion(uuid) to authenticated;

-- ============================================================================
-- Verify
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_co    uuid;
  v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_co from public.companies where approved limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v := public.company_profile_completion(v_co);
  if not (v ->> 'has_company')::boolean then
    raise exception 'الدالة لا تجد الشركة';
  end if;
  if (v ->> 'total')::int <> 12 then
    raise exception 'عدد البنود % والمتوقّع 12', v ->> 'total';
  end if;
  if (v ->> 'completed')::int + jsonb_array_length(v -> 'gaps') <> 12 then
    raise exception 'المكتمل والفجوات لا يساويان الإجمالي';
  end if;

  perform set_config('request.jwt.claims', '', true);
  if public.company_profile_completion(v_co) <> '{}'::jsonb then
    raise exception 'الدالة تُجيب بلا جلسة';
  end if;

  raise notice '✅ اكتمال الملف %٪ · % نقطة متاحة · % فجوة',
    v ->> 'percent', v ->> 'points_available', jsonb_array_length(v -> 'gaps');
end $blk$;
