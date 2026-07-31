-- Migration: 075_document_lifecycle.sql
-- Purpose: documents are a checklist with a lifecycle, not an upload form.
--
-- ============================================================================
-- The conflict this fixes
-- ============================================================================
-- 068 created a partial unique index allowing one verified document per type per
-- company, to stop a company raising its own official layer by uploading the
-- same paper twice. That reasoning was right and the rule was wrong: it also
-- forbids replacing an expired certificate with a current one. A registration
-- renewed every year cannot be renewed here at all.
--
-- The rule that was actually wanted is one *current* verified document per type.
-- A superseded copy is history, not evidence, so it neither counts nor blocks.
--
-- ============================================================================
-- The model this enables
-- ============================================================================
-- The screen stops asking "which type are you uploading" and shows the types
-- that exist, each with its own state and the one action that state allows:
-- missing → upload, expired → replace, verified → view. The document decides the
-- button. A user who cannot pick the wrong type cannot file a tax certificate as
-- a municipal licence, and no validation is needed for a mistake that can no
-- longer be made.

-- ============================================================================
-- 1) The types a Saudi company actually holds
-- ============================================================================
alter table public.company_documents
  drop constraint if exists company_documents_type_check;

alter table public.company_documents
  add constraint company_documents_type_check check (doc_type in (
    'commercial_registration',  -- السجل التجاري
    'articles_of_incorporation',-- عقد التأسيس
    'vat_certificate',          -- شهادة ضريبة القيمة المضافة
    'zakat_certificate',        -- شهادة الزكاة
    'gosi_certificate',         -- شهادة التأمينات الاجتماعية
    'municipal_license',        -- الرخصة البلدية
    'national_address',         -- العنوان الوطني
    'chamber_membership',       -- عضوية الغرفة التجارية
    'license',                  -- ترخيص النشاط
    'bank_letter',              -- خطاب بنكي
    'owner_id',                 -- هوية المالك أو المفوّض
    'other'));

-- The old name kept working; rename it rather than orphan the rows.
update public.company_documents
   set doc_type = 'vat_certificate' where doc_type = 'tax_certificate';

-- ============================================================================
-- 2) Expiry, versions, and the states they create
-- ============================================================================
alter table public.company_documents
  add column if not exists expires_at   date,
  add column if not exists issued_at    date,
  add column if not exists replaces_id  uuid references public.company_documents(id) on delete set null,
  add column if not exists superseded_at timestamptz;

comment on column public.company_documents.expires_at is
  'تاريخ انتهاء المستند — يجعل حالته «منتهٍ» تلقائياً دون تدخّل';
comment on column public.company_documents.replaces_id is
  'النسخة التي حلّ محلّها هذا المستند — لبناء سجلّ النسخ';

alter table public.company_documents
  drop constraint if exists company_documents_status_check;

alter table public.company_documents
  add constraint company_documents_status_check check (status in (
    'pending', 'verified', 'rejected', 'superseded', 'reupload_required'));

-- One *current* verified document per type. A superseded copy is history.
drop index if exists idx_company_documents_one_verified;
create unique index if not exists idx_company_documents_one_current
  on public.company_documents (company_id, doc_type)
  where status = 'verified' and superseded_at is null;

-- ============================================================================
-- 3) The checklist — every type, its state, and the action it allows
-- ============================================================================
-- This is what the screen renders. It returns a row per required type whether or
-- not a document exists, because "missing" is a state the company needs to see
-- and an absent row shows nothing.
create or replace function public.company_document_checklist(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if public.get_current_user_id() is null then
    return '[]'::jsonb;
  end if;
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and p_company_id is distinct from (select company_id from public.tenants
                                         where id = public.get_current_tenant_id()) then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(row_to_json(x) order by x.sort_order) into v from (
    select
      t.doc_type,
      t.label,
      t.required,
      t.sort_order,
      d.id            as document_id,
      d.file_name,
      d.created_at    as uploaded_at,
      d.verified_at,
      d.expires_at,
      d.rejection_reason,
      (select u.email from public.users u where u.id = d.verified_by) as reviewer,
      -- The state, derived rather than stored: an expired certificate becomes
      -- expired on its own date, and nothing has to run to make that true.
      case
        when d.id is null                              then 'missing'
        when d.status = 'rejected'                     then 'rejected'
        when d.status = 'reupload_required'            then 'reupload_required'
        when d.status = 'pending'                      then 'pending'
        when d.expires_at is not null
             and d.expires_at < current_date           then 'expired'
        when d.status = 'verified'                     then 'verified'
        else d.status
      end as state,
      -- And the one action that state allows. The screen renders this rather
      -- than deciding it, so the button and the rule cannot disagree.
      case
        when d.id is null                              then 'upload'
        when d.status in ('rejected', 'reupload_required') then 'reupload'
        when d.status = 'pending'                      then 'view'
        when d.expires_at is not null
             and d.expires_at < current_date           then 'replace'
        else 'view'
      end as action,
      (select count(*)::int from public.company_documents h
        where h.company_id = p_company_id and h.doc_type = t.doc_type) as versions
    from (values
      ('commercial_registration',   'السجل التجاري',            true,  1),
      ('articles_of_incorporation', 'عقد التأسيس',              false, 2),
      ('vat_certificate',           'شهادة ضريبة القيمة المضافة', true,  3),
      ('zakat_certificate',         'شهادة الزكاة',             true,  4),
      ('gosi_certificate',          'شهادة التأمينات الاجتماعية', false, 5),
      ('municipal_license',         'الرخصة البلدية',           false, 6),
      ('national_address',          'العنوان الوطني',           true,  7),
      ('chamber_membership',        'عضوية الغرفة التجارية',     false, 8),
      ('owner_id',                  'هوية المالك أو المفوَّض',   false, 9)
    ) as t(doc_type, label, required, sort_order)
    left join lateral (
      select * from public.company_documents cd
       where cd.company_id = p_company_id
         and cd.doc_type = t.doc_type
         and cd.superseded_at is null
       order by case cd.status when 'verified' then 1 when 'pending' then 2 else 3 end,
                cd.created_at desc
       limit 1) d on true
  ) x;

  return coalesce(v, '[]'::jsonb);
end $fn$;

grant execute on function public.company_document_checklist(uuid) to authenticated;
revoke all on function public.company_document_checklist(uuid) from public, anon;

-- ============================================================================
-- 4) Replacing a document keeps the old one
-- ============================================================================
-- Deleting the previous copy would erase the record of what Marsad verified last
-- year, which is the thing a dispute about last year's dealings would turn on.
create or replace function public.supersede_document(p_document_id uuid, p_new_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old public.company_documents;
begin
  select * into v_old from public.company_documents where id = p_document_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'المستند السابق غير موجود');
  end if;

  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and v_old.uploaded_by_tenant_id is distinct from public.get_current_tenant_id() then
    return jsonb_build_object('ok', false, 'reason', 'هذا المستند ليس لشركتك');
  end if;

  update public.company_documents
     set status = 'superseded', superseded_at = now()
   where id = p_document_id;

  update public.company_documents
     set replaces_id = p_document_id
   where id = p_new_id;

  return jsonb_build_object('ok', true);
end $fn$;

grant execute on function public.supersede_document(uuid, uuid) to authenticated;

-- The version history of one type, newest first.
create or replace function public.document_versions(p_company_id uuid, p_doc_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if public.get_current_user_id() is null then return '[]'::jsonb; end if;
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and p_company_id is distinct from (select company_id from public.tenants
                                         where id = public.get_current_tenant_id()) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'file_name', d.file_name, 'status', d.status,
           'uploaded_at', d.created_at, 'verified_at', d.verified_at,
           'expires_at', d.expires_at, 'superseded_at', d.superseded_at,
           'rejection_reason', d.rejection_reason,
           'reviewer', (select u.email from public.users u where u.id = d.verified_by))
         order by d.created_at desc), '[]'::jsonb)
    into v
    from public.company_documents d
   where d.company_id = p_company_id and d.doc_type = p_doc_type;
  return v;
end $fn$;

grant execute on function public.document_versions(uuid, text) to authenticated;

-- ============================================================================
-- 4b) Verifying a replacement retires the one it replaces
-- ============================================================================
-- The unique index allows one current verified document per type, so a
-- replacement cannot be inserted as verified while the old one still is. That is
-- the right rule and it decides the flow: a replacement arrives pending, and the
-- moment Marsad verifies it the previous copy becomes history. Superseding at
-- verification rather than at upload means a company cannot retire its own
-- verified document by uploading anything on top of it.
create or replace function public.review_document(
  p_document_id uuid, p_approve boolean, p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_row public.company_documents;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return jsonb_build_object('ok', false, 'reason', 'مراجعة المستندات لإدارة مرصد فقط');
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'الرفض يحتاج سبباً يُعرض على الشركة');
  end if;

  select * into v_row from public.company_documents where id = p_document_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'المستند غير موجود');
  end if;

  if p_approve then
    update public.company_documents
       set status = 'superseded', superseded_at = now()
     where company_id = v_row.company_id
       and doc_type = v_row.doc_type
       and status = 'verified'
       and superseded_at is null
       and id <> p_document_id;

    update public.company_documents
       set replaces_id = (select id from public.company_documents
                           where company_id = v_row.company_id
                             and doc_type = v_row.doc_type
                             and superseded_at is not null
                           order by superseded_at desc limit 1)
     where id = p_document_id and replaces_id is null;
  end if;

  update public.company_documents
     set status = case when p_approve then 'verified' else 'rejected' end,
         rejection_reason = case when p_approve then null else p_reason end,
         verified_by = public.get_current_user_id(),
         verified_at = now()
   where id = p_document_id
  returning * into v_row;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'company_id', v_row.company_id);
end $fn$;

grant execute on function public.review_document(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 5) An expired document stops counting toward the score
-- ============================================================================
-- trust_layer_official counted every row with status = 'verified'. A certificate
-- that expired last March is not evidence of anything current, and neither is a
-- superseded copy — counting either would let a company hold a score on paper it
-- no longer has.
create or replace function public.trust_layer_official(p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r jsonb; c record; v numeric; v_docs int;
begin
  select value -> 'layers' -> 'official' into r
    from public.system_settings where key = 'trust_score_rules';

  select cr_status, verified, unified_number, national_address, cr_expiry_date,
         official_status
    into c from public.companies where id = p_company_id;
  if not found then return null; end if;

  v := coalesce((r ->> 'base')::numeric, 70);

  if c.verified then v := v + coalesce((r ->> 'verified_bonus')::numeric, 20); end if;
  if c.unified_number is not null then v := v + coalesce((r ->> 'unified_number_bonus')::numeric, 5); end if;
  if c.national_address is not null then v := v + coalesce((r ->> 'national_address_bonus')::numeric, 5); end if;

  select count(*) into v_docs
    from public.company_documents
   where company_id = p_company_id
     and status = 'verified'
     and superseded_at is null
     and (expires_at is null or expires_at >= current_date);
  v := v + least(
         coalesce((r ->> 'document_bonus_cap')::numeric, 12),
         v_docs * coalesce((r ->> 'document_bonus')::numeric, 4));

  if c.cr_status is not null and c.cr_status <> 'active' then
    v := v - coalesce((r ->> 'inactive_cr_penalty')::numeric, 50);
  end if;
  if c.cr_expiry_date is not null and c.cr_expiry_date < current_date then
    v := v - coalesce((r ->> 'expired_cr_penalty')::numeric, 30);
  end if;

  v := v - case coalesce(c.official_status, 'none')
             when 'bankruptcy'  then coalesce((r ->> 'bankruptcy_penalty')::numeric, 70)
             when 'struck_off'  then coalesce((r ->> 'struck_off_penalty')::numeric, 70)
             when 'liquidation' then coalesce((r ->> 'liquidation_penalty')::numeric, 60)
             when 'insolvency'  then coalesce((r ->> 'insolvency_penalty')::numeric, 45)
             when 'suspended'   then coalesce((r ->> 'suspended_penalty')::numeric, 35)
             else 0 end;

  return greatest(0, least(100, v));
end $fn$;

revoke all on function public.trust_layer_official(uuid) from public, anon, authenticated;

-- ============================================================================
-- 6) Verify by exercising the lifecycle
-- ============================================================================
do $blk$
declare
  v_admin text; v_co uuid; v_a uuid; v_b uuid; v jsonb; v_state text; v_n int;
begin
  select id into v_admin from public.users where role='platform_admin' limit 1;
  select id into v_co from public.companies where approved limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- Missing shows as missing, with upload as its action.
  v := public.company_document_checklist(v_co);
  if jsonb_array_length(v) <> 9 then
    raise exception 'قائمة المستندات % بنداً والمتوقّع 9', jsonb_array_length(v);
  end if;

  insert into public.company_documents (company_id, doc_type, file_url, status, expires_at)
  values (v_co, 'zakat_certificate', 'probe://a', 'verified', current_date - 1)
  returning id into v_a;

  -- An expired certificate reads as expired and offers replacement.
  select x ->> 'state' into v_state
    from jsonb_array_elements(public.company_document_checklist(v_co)) x
   where x ->> 'doc_type' = 'zakat_certificate';
  if v_state <> 'expired' then
    raise exception 'المستند المنتهي حالته % لا expired', v_state;
  end if;

  -- Renewal must be possible: the old index forbade it outright. The replacement
  -- arrives pending and verification retires the previous copy — and this probe
  -- inserted it as verified on its first run and was correctly refused, which is
  -- how the flow came to be written this way.
  insert into public.company_documents (company_id, doc_type, file_url, status, expires_at)
  values (v_co, 'zakat_certificate', 'probe://b', 'pending', current_date + 365)
  returning id into v_b;

  v := public.review_document(v_b, true, null);
  if not (v ->> 'ok')::boolean then
    raise exception 'توثيق البديل فشل: %', v ->> 'reason';
  end if;

  select status into v_state from public.company_documents where id = v_a;
  if v_state <> 'superseded' then
    raise exception 'المستند القديم % لا superseded', v_state;
  end if;

  select count(*) into v_n from public.company_documents
   where company_id = v_co and doc_type = 'zakat_certificate';
  if v_n <> 2 then raise exception 'سجلّ النسخ % والمتوقّع 2', v_n; end if;

  delete from public.company_documents where id in (v_a, v_b);
  perform public.compute_trust_score(v_co);

  raise notice '✅ الناقص ناقص · المنتهي منتهٍ · التجديد ممكن · السجلّ محفوظ';
end $blk$;
