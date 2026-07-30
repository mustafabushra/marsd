-- Migration: 068_documents_and_official_sources.sql
-- Purpose: give the report's missing sections a source — documents a company
--          uploads and Marsad verifies, and official status Marsad records.
--
-- ============================================================================
-- What was missing and why it mattered
-- ============================================================================
-- Four sections of the report lean on evidence that does not exist: the official
-- layer has nothing to weigh beyond a CR status, the data-quality panel counts 9
-- CR files across 27 companies, and the confidence section — the strongest idea
-- in the report — can only say "لا مستندات رسمية مرفقة". AddReport still carries
-- `evidenceCount = 0 // documents arrive in Phase B`.
--
-- Those sections are the ones that make the report credible, so this is the
-- piece that changes the product rather than decorating it.
--
-- Two sources, deliberately separate:
--
--   The company supplies documents. It holds them, and asking Marsad to source
--   a company's own commercial registration is backwards.
--
--   Marsad records official status. Insolvency, suspension, a struck-off
--   registration — a company must never be able to set or clear these about
--   itself, which is the whole reason they are worth reading.
--
-- Corrected fields already have a path: company_data_requests carries add_data
-- and edit_data through admin approval, and the tax id, entity type and founding
-- date go through it. No second mechanism is invented for them here.

-- ============================================================================
-- 1) Documents
-- ============================================================================
create table if not exists public.company_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  -- Who uploaded it. Null for a document Marsad added itself.
  uploaded_by_tenant_id uuid references public.tenants(id) on delete set null,
  uploaded_by_user_id   text,
  doc_type         varchar(40) not null,
  file_url         text not null,
  file_name        text,
  note             text,
  status           varchar(20) not null default 'pending',
  verified_by      text,
  verified_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),

  constraint company_documents_type_check check (doc_type in (
    'commercial_registration',  -- السجل التجاري
    'tax_certificate',          -- الشهادة الضريبية
    'national_address',         -- العنوان الوطني
    'chamber_membership',       -- عضوية الغرفة التجارية
    'bank_letter',              -- خطاب بنكي
    'license',                  -- ترخيص النشاط
    'other')),
  constraint company_documents_status_check check (status in (
    'pending', 'verified', 'rejected'))
);

comment on table public.company_documents is
  'مستندات الشركة — ترفعها الشركة وتتحقّق منها إدارة مرصد؛ المستند الموثَّق وحده يدخل المؤشر';

create index if not exists idx_company_documents_company on public.company_documents (company_id);
create index if not exists idx_company_documents_status  on public.company_documents (status)
  where status = 'pending';
create index if not exists idx_company_documents_tenant  on public.company_documents (uploaded_by_tenant_id);

-- One verified document of each type per company. A second verified tax
-- certificate is not more evidence, and counting it would let a company raise
-- its own official layer by uploading the same paper twice.
create unique index if not exists idx_company_documents_one_verified
  on public.company_documents (company_id, doc_type)
  where status = 'verified';

alter table public.company_documents enable row level security;

-- A company sees documents on its own record, and any it uploaded.
drop policy if exists company_documents_select on public.company_documents;
create policy company_documents_select on public.company_documents
  for select to authenticated
  using (
    coalesce(public.is_platform_admin() or public.is_reviewer(), false)
    or uploaded_by_tenant_id = public.get_current_tenant_id()
    or company_id = (select company_id from public.tenants
                      where id = public.get_current_tenant_id())
  );

-- Uploading is attributed. A row that names another tenant as its uploader
-- would put a document in someone else's history.
drop policy if exists company_documents_insert on public.company_documents;
create policy company_documents_insert on public.company_documents
  for insert to authenticated
  with check (
    public.get_current_user_id() is not null
    and uploaded_by_tenant_id = public.get_current_tenant_id()
    and status = 'pending'
  );

-- Only Marsad decides. A company that could set status = 'verified' would be
-- verifying itself, and the badge would mean nothing.
drop policy if exists company_documents_update on public.company_documents;
create policy company_documents_update on public.company_documents
  for update to authenticated
  using (coalesce(public.is_platform_admin() or public.is_reviewer(), false))
  with check (coalesce(public.is_platform_admin() or public.is_reviewer(), false));

-- Withdrawing a document is the uploader's right, while it is still pending.
drop policy if exists company_documents_delete on public.company_documents;
create policy company_documents_delete on public.company_documents
  for delete to authenticated
  using (
    coalesce(public.is_platform_admin(), false)
    or (uploaded_by_tenant_id = public.get_current_tenant_id() and status = 'pending')
  );

-- Verification stamps itself, the same way company verification does.
create or replace function public.guard_document_verification()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
    new.verified_by := coalesce(new.verified_by, public.get_current_user_id());
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  if new.status = 'rejected' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'رفض المستند يحتاج سبباً يُعرض على الشركة';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_guard_document_verification on public.company_documents;
create trigger trg_guard_document_verification
  before update on public.company_documents
  for each row execute function public.guard_document_verification();

-- A verified document changes the official layer, so the score follows it.
create or replace function public.recompute_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.compute_trust_score(coalesce(new.company_id, old.company_id));
  return null;
end $fn$;

drop trigger if exists trg_recompute_on_document on public.company_documents;
create trigger trg_recompute_on_document
  after insert or update or delete on public.company_documents
  for each row execute function public.recompute_on_document_change();

-- ============================================================================
-- 2) Official status — Marsad's to record, nobody else's
-- ============================================================================
alter table public.companies
  add column if not exists official_status        varchar(30) default 'none',
  add column if not exists official_status_note   text,
  add column if not exists official_status_at     timestamptz,
  add column if not exists official_status_source text;

do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_official_status_check') then
    alter table public.companies
      add constraint companies_official_status_check check (official_status in (
        'none',            -- لا شيء مسجَّل
        'insolvency',      -- تعثّر مالي
        'bankruptcy',      -- إفلاس
        'liquidation',     -- تصفية
        'suspended',       -- إيقاف نشاط
        'struck_off'));    -- شطب السجل
  end if;
end $blk$;

comment on column public.companies.official_status is
  'حالة رسمية تسجّلها إدارة مرصد — لا تستطيع الشركة تعيينها ولا مسحها عن نفسها';

-- The existing profile guard protects identity and verification columns from a
-- company editing its own record. These four join that list: a company that
-- could clear its own bankruptcy flag makes the flag worthless.
create or replace function public.guard_official_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if (new.official_status        is distinct from old.official_status
   or new.official_status_note   is distinct from old.official_status_note
   or new.official_status_at     is distinct from old.official_status_at
   or new.official_status_source is distinct from old.official_status_source)
     and not coalesce(public.is_platform_admin(), false)
     and public.get_current_user_id() is not null then
    raise exception 'الحالة الرسمية تُسجَّل من إدارة مرصد فقط';
  end if;

  if new.official_status is distinct from old.official_status
     and coalesce(new.official_status, 'none') <> 'none' then
    new.official_status_at     := coalesce(new.official_status_at, now());
    new.official_status_source := coalesce(new.official_status_source, 'إدارة مرصد');
  end if;
  return new;
end $fn$;

drop trigger if exists trg_guard_official_status on public.companies;
create trigger trg_guard_official_status
  before update on public.companies
  for each row execute function public.guard_official_status();

-- ============================================================================
-- 3) The official layer reads them
-- ============================================================================
update public.system_settings
   set value = jsonb_set(value, '{layers,official}',
        (value -> 'layers' -> 'official')
        || jsonb_build_object(
             'document_bonus', 4,          -- per verified document
             'document_bonus_cap', 12,
             'insolvency_penalty', 45,
             'bankruptcy_penalty', 70,
             'liquidation_penalty', 60,
             'struck_off_penalty', 70,
             'suspended_penalty', 35))
 where key = 'trust_score_rules';

create or replace function public.trust_layer_official(p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r jsonb;
  c record;
  v numeric;
  v_docs int;
begin
  select value -> 'layers' -> 'official' into r
    from public.system_settings where key = 'trust_score_rules';

  select cr_status, verified, unified_number, national_address, cr_expiry_date,
         official_status
    into c from public.companies where id = p_company_id;
  if not found then return null; end if;

  v := coalesce((r ->> 'base')::numeric, 70);

  if c.verified then
    v := v + coalesce((r ->> 'verified_bonus')::numeric, 20);
  end if;
  if c.unified_number is not null then
    v := v + coalesce((r ->> 'unified_number_bonus')::numeric, 5);
  end if;
  if c.national_address is not null then
    v := v + coalesce((r ->> 'national_address_bonus')::numeric, 5);
  end if;

  -- Verified documents only. A pending upload is a claim, and counting it would
  -- let a company raise its own official layer by uploading anything.
  select count(*) into v_docs
    from public.company_documents
   where company_id = p_company_id and status = 'verified';
  v := v + least(
         coalesce((r ->> 'document_bonus_cap')::numeric, 12),
         v_docs * coalesce((r ->> 'document_bonus')::numeric, 4));

  if c.cr_status is not null and c.cr_status <> 'active' then
    v := v - coalesce((r ->> 'inactive_cr_penalty')::numeric, 50);
  end if;
  if c.cr_expiry_date is not null and c.cr_expiry_date < current_date then
    v := v - coalesce((r ->> 'expired_cr_penalty')::numeric, 30);
  end if;

  -- The heaviest signal on the platform, and the only one no company can write.
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
-- 4) Reading and acting on documents
-- ============================================================================
create or replace function public.company_documents_for(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if public.get_current_user_id() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'doc_type', d.doc_type, 'file_name', d.file_name,
           'status', d.status, 'created_at', d.created_at,
           'verified_at', d.verified_at, 'rejection_reason', d.rejection_reason,
           -- The file itself only to the people entitled to open it.
           'file_url', case when coalesce(public.is_platform_admin() or public.is_reviewer(), false)
                              or d.uploaded_by_tenant_id = public.get_current_tenant_id()
                            then d.file_url else null end)
         order by d.created_at desc), '[]'::jsonb)
    into v
    from public.company_documents d
   where d.company_id = p_company_id;
  return v;
end $fn$;

grant execute on function public.company_documents_for(uuid) to authenticated;

create or replace function public.review_document(
  p_document_id uuid,
  p_approve     boolean,
  p_reason      text default null
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

  update public.company_documents
     set status = case when p_approve then 'verified' else 'rejected' end,
         rejection_reason = case when p_approve then null else p_reason end,
         verified_by = public.get_current_user_id(),
         verified_at = now()
   where id = p_document_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'المستند غير موجود');
  end if;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'company_id', v_row.company_id);
exception when unique_violation then
  -- The partial unique index refuses a second verified document of the same
  -- type, which is the intended answer rather than an error to hide.
  return jsonb_build_object('ok', false, 'reason', 'يوجد مستند موثَّق من هذا النوع بالفعل');
end $fn$;

grant execute on function public.review_document(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 5) The report counts verified documents, not files on a column
-- ============================================================================
-- 066's version is renamed rather than duplicated: the wrapper adds two fields
-- and copying two hundred lines to change them is how the two drift apart.
alter function public.company_report_full(uuid) rename to company_report_full_base;
revoke all on function public.company_report_full_base(uuid) from public, anon, authenticated;

create or replace function public.company_report_full(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  v := public.company_report_full_base(p_company_id);
  if v = '{}'::jsonb then return v; end if;

  return jsonb_set(
    jsonb_set(v, '{quality,documents}',
      to_jsonb((select count(*) from public.company_documents
                 where company_id = p_company_id and status = 'verified'))),
    '{identity,official_status}',
    to_jsonb((select jsonb_build_object(
                'status', coalesce(official_status, 'none'),
                'at',     official_status_at,
                'note',   official_status_note,
                'source', official_status_source)
                from public.companies where id = p_company_id)));
end $fn$;

grant execute on function public.company_report_full(uuid) to authenticated;
revoke all on function public.company_report_full(uuid) from public, anon;

-- ============================================================================
-- 6) Verify by exercising it
-- ============================================================================
do $blk$
declare
  v_admin  text;
  v_co     uuid;
  v_before numeric;
  v_after  numeric;
  v_doc    uuid;
  v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select id into v_co from public.companies where approved limit 1;

  v_before := public.trust_layer_official(v_co);

  insert into public.company_documents (company_id, doc_type, file_url, file_name, status)
  values (v_co, 'tax_certificate', 'probe://x', 'probe', 'pending')
  returning id into v_doc;

  -- Pending must not move the score. A claim is not evidence.
  if public.trust_layer_official(v_co) is distinct from v_before then
    raise exception 'مستند معلَّق حرّك الطبقة الرسمية';
  end if;

  update public.company_documents set status = 'verified' where id = v_doc;
  v_after := public.trust_layer_official(v_co);
  if v_after <= v_before then
    raise exception 'مستند موثَّق لم يرفع الطبقة الرسمية (% ← %)', v_before, v_after;
  end if;

  -- An official status must outweigh it and must be admin-only.
  update public.companies set official_status = 'bankruptcy' where id = v_co;
  if public.trust_layer_official(v_co) >= v_after then
    raise exception 'الإفلاس لم يخفض الطبقة الرسمية';
  end if;

  -- Undo everything this check created.
  delete from public.company_documents where id = v_doc;
  update public.companies
     set official_status = 'none', official_status_at = null,
         official_status_source = null, official_status_note = null
   where id = v_co;
  perform public.compute_trust_score(v_co);

  raise notice '✅ المستند الموثَّق يرفع · المعلَّق لا يحرّك · الإفلاس يخفض';
end $blk$;
