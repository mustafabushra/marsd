-- A document may arrive from a phone
-- ============================================================================
--
-- The commercial registration is a paper, or a PDF sitting in وثائق on somebody's
-- phone. To upload it from a laptop today they must e-mail it to themselves.
-- That is where verification stalls, and verification is what feeds the trust
-- score — so the friction is not cosmetic.
--
-- The laptop shows a QR code. The phone opens one page, uploads one file, and
-- the laptop updates itself. The phone is never asked to sign in: requiring a
-- password on a phone is the thing this feature exists to avoid.
--
-- ============================================================================
-- What a handoff is allowed to do
-- ============================================================================
-- A QR code on a screen is a credential held by whoever can see it. Somebody
-- who photographs the screen holds what the code holds. So the design is about
-- making that as close to nothing as possible:
--
--   five minutes         the window for photographing a screen is short
--   one use              consumed by the first completed upload
--   one company, one     it cannot be pointed at another company or another
--   document type        kind of document
--   upload only          it cannot read, list, or download anything at all
--   three signed URLs    a bounded number of attempts, for a dropped
--                        connection, not for a bulk uploader
--
-- The token itself is never stored. Only its SHA-256, so a copy of this table
-- yields nothing that can be used.
--
-- And the real backstop is not any of that: the document arrives `pending` and
-- a person at Marsad reviews it before it affects a score. The worst a leaked
-- code can do is put a file in front of a reviewer who will reject it.

-- pgcrypto lives in `extensions` on Supabase, not `public`.
--
-- Every function below pins `search_path` — a definer function that inherits
-- the caller's path can be pointed at a table the caller controls — and a path
-- of `public` alone cannot see `gen_random_bytes` or `digest`. The migration
-- installed cleanly and the functions compiled; they failed on the first call,
-- because a dry run type-checks a body without running it. Naming the schema
-- explicitly is what the probe caught.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.upload_handoffs (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text        not null unique,
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  company_id    uuid        not null references public.companies(id) on delete cascade,
  doc_type      text        not null,
  created_by    text        not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  issued_count  int         not null default 0,
  consumed_at   timestamptz,
  document_id   uuid        references public.company_documents(id) on delete set null
);

create index if not exists upload_handoffs_expires_idx
  on public.upload_handoffs (expires_at);

-- Nobody reads this table through the API. Not the browser, not the phone, not
-- an authenticated user. It is touched only by the three functions below, which
-- run as their definer, and by the server holding the service role.
alter table public.upload_handoffs enable row level security;
revoke all on public.upload_handoffs from anon, authenticated, public;

-- ============================================================================
-- Creating one
-- ============================================================================
-- Called by the signed-in laptop. Returns the raw token exactly once — it is
-- not stored and cannot be recovered afterwards.

create or replace function public.create_upload_handoff(p_doc_type text)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user       text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  v_tenant     uuid;
  v_company    uuid;
  v_recent     int;
  v_token      text;
begin
  if v_user is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select u.tenant_id, t.company_id
    into v_tenant, v_company
    from public.users u
    join public.tenants t on t.id = u.tenant_id
   where u.id = v_user;

  if v_company is null then
    raise exception 'لا توجد شركة مرتبطة بحسابك';
  end if;

  -- The doc_type has to be one this company is actually asked for. Without
  -- this the caller chooses the string, and a handoff could file a document
  -- under a type no reviewer is looking at.
  --
  -- The vocabulary is read out of the checklist rather than repeated here.
  -- Copying the nine types into this function would mean two lists that agree
  -- until somebody adds a tenth to one of them.
  if not exists (
    select 1 from public.company_document_types() t where t.doc_type = p_doc_type
  ) then
    raise exception 'نوع مستند غير معروف: %', p_doc_type;
  end if;

  -- A rate limit, because a QR code is cheap to generate and each one is a
  -- live credential. Ten in an hour is far above any real use.
  select count(*) into v_recent
    from public.upload_handoffs
   where created_by = v_user
     and created_at > now() - interval '1 hour';

  if v_recent >= 10 then
    raise exception 'عدد كبير من الطلبات — انتظر قليلاً';
  end if;

  v_token := encode(gen_random_bytes(32), 'base64');
  -- base64 in a URL: + / = are not safe there, and a token that survives one
  -- browser and not another is a bug that only shows up on somebody's phone.
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  insert into public.upload_handoffs (token_hash, tenant_id, company_id, doc_type, created_by, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_tenant, v_company, p_doc_type, v_user,
          now() + interval '5 minutes');

  return query select v_token, now() + interval '5 minutes';
end;
$$;

revoke all on function public.create_upload_handoff(text) from anon, public;
grant execute on function public.create_upload_handoff(text) to authenticated;

-- ============================================================================
-- Opening one, from the phone
-- ============================================================================
-- Returns what the phone page shows a person — which company, which document —
-- plus the company id, which the server needs to build the storage path and
-- which the phone never chooses for itself. The path is the one place a wrong
-- value would file a document against the wrong company, so it is derived here
-- and re-checked in `finish_upload_handoff` rather than trusted from a request.

create or replace function public.open_upload_handoff(p_token text)
returns table (company_id uuid, company_name text, doc_label text, doc_type text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.upload_handoffs;
begin
  select * into v_row
    from public.upload_handoffs
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  if v_row.id is null then
    raise exception 'رابط غير صالح';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'استُخدم هذا الرابط بالفعل';
  end if;
  if v_row.expires_at < now() then
    raise exception 'انتهت صلاحية الرابط';
  end if;
  if v_row.issued_count >= 3 then
    raise exception 'محاولات كثيرة — أنشئ رمزاً جديداً';
  end if;

  update public.upload_handoffs
     set issued_count = issued_count + 1
   where id = v_row.id;

  -- The label comes from the same checklist the laptop is looking at, so the
  -- phone names the document the way the person was just asked for it.
  return query
    select c.id,
           c.name::text,
           coalesce(
             (select t.label from public.company_document_types() t
               where t.doc_type = v_row.doc_type),
             v_row.doc_type)::text,
           v_row.doc_type::text,
           v_row.expires_at
      from public.companies c
     where c.id = v_row.company_id;
end;
$$;

-- Only the server calls this. The phone has no key of its own and talks to the
-- serverless function, which holds the service role.
revoke all on function public.open_upload_handoff(text) from anon, authenticated, public;

-- ============================================================================
-- Finishing one
-- ============================================================================
-- Records the document and burns the token, in one transaction, so a token can
-- never file two documents.

create or replace function public.finish_upload_handoff(
  p_token     text,
  p_path      text,
  p_file_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.upload_handoffs;
  v_doc uuid;
begin
  select * into v_row
    from public.upload_handoffs
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     for update;

  if v_row.id is null then
    raise exception 'رابط غير صالح';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'استُخدم هذا الرابط بالفعل';
  end if;
  if v_row.expires_at < now() then
    raise exception 'انتهت صلاحية الرابط';
  end if;

  -- The path is built by the server from the handoff's own company id. This
  -- re-checks it, because a mismatch here would mean a document filed against
  -- a company the code was never issued for.
  if p_path not like v_row.company_id::text || '/%' then
    raise exception 'مسار لا يخص هذه الشركة';
  end if;

  insert into public.company_documents (
    company_id, uploaded_by_tenant_id, uploaded_by_user_id,
    doc_type, file_url, file_name, status
  ) values (
    v_row.company_id, v_row.tenant_id, v_row.created_by,
    v_row.doc_type, p_path, p_file_name, 'pending'
  )
  returning id into v_doc;

  update public.upload_handoffs
     set consumed_at = now(), document_id = v_doc
   where id = v_row.id;

  return v_doc;
end;
$$;

revoke all on function public.finish_upload_handoff(text, text, text) from anon, authenticated, public;

-- ============================================================================
-- The nine document types, named once
-- ============================================================================
-- The list lived inside `company_document_checklist` as an inline VALUES, which
-- was fine while one function needed it. The phone page needs it too — to tell
-- somebody they are photographing «السجل التجاري» rather than
-- «commercial_registration» — and the checklist cannot answer for it: the
-- checklist authorizes by caller and returns `[]` to anyone who is not the
-- company's tenant. The server is not the company's tenant, so the phone got
-- the raw key. The probe caught it; nothing on screen would have looked broken
-- enough to notice.
--
-- Copying the nine rows into a second place would have fixed the symptom and
-- created the thing worth avoiding: two lists that agree until somebody adds a
-- tenth type to one of them. So the list moves out into its own function and
-- the checklist reads from it. One list, two readers.
--
-- The vocabulary is not secret — it is the same nine labels printed on the
-- documents page — so this is readable by a signed-in user. It says what may be
-- asked for, never what any company has.

create or replace function public.company_document_types()
returns table (doc_type text, label text, required boolean, sort_order int)
language sql
immutable
set search_path = public, pg_temp
as $$
  select * from (values
    ('commercial_registration',   'السجل التجاري',              true,  1),
    ('articles_of_incorporation', 'عقد التأسيس',                false, 2),
    ('vat_certificate',           'شهادة ضريبة القيمة المضافة', true,  3),
    ('zakat_certificate',         'شهادة الزكاة',               true,  4),
    ('gosi_certificate',          'شهادة التأمينات الاجتماعية', false, 5),
    ('municipal_license',         'الرخصة البلدية',             false, 6),
    ('national_address',          'العنوان الوطني',             true,  7),
    ('chamber_membership',        'عضوية الغرفة التجارية',      false, 8),
    ('owner_id',                  'هوية المالك أو المفوَّض',    false, 9)
  ) as t(doc_type, label, required, sort_order)
$$;

revoke all on function public.company_document_types() from anon, public;
grant execute on function public.company_document_types() to authenticated;

-- The checklist, now reading the list instead of carrying it.
--
-- Everything else in this function is unchanged, deliberately: the authorization
-- guard, the derived state, the action, the version count, the lateral join that
-- picks the current document. Only the source of the nine rows moved. A probe
-- compares its output before and after on a real company, because «I only
-- changed the VALUES clause» is exactly the kind of claim that turns out to be
-- one column short.
create or replace function public.company_document_checklist(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $function$
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
    from public.company_document_types() t
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
end $function$;

-- DROP + CREATE re-applies Supabase's default privileges, which grant anon
-- EXECUTE. CREATE OR REPLACE does not, but this is re-stated rather than
-- assumed — the cost of being wrong is a public function.
revoke all on function public.company_document_checklist(uuid) from anon, public;
grant execute on function public.company_document_checklist(uuid) to authenticated;

-- ============================================================================
-- The laptop has to be told
-- ============================================================================
-- The panel subscribes to `company_documents` and closes itself when the row
-- appears. `company_documents` was not in the realtime publication, so that
-- subscription could never fire: the phone would say «وصل المستند» and the
-- laptop would keep showing a QR code for a document it already had, until
-- somebody reloaded the page.
--
-- Nothing on either screen looked broken. The phone was right, the laptop was
-- right about what it knew, and only a probe watching both at once could see
-- that they disagreed.
--
-- Realtime enforces RLS per subscriber, and this table has it enabled with a
-- select policy, so publishing it does not widen who can read a row — it widens
-- when they find out.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'company_documents'
  ) then
    alter publication supabase_realtime add table public.company_documents;
  end if;
end $$;
