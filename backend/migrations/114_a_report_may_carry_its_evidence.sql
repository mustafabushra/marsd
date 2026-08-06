-- Migration: 114_a_report_may_carry_its_evidence.sql
-- Purpose: the declaration says «لديّ مستندات تثبتها» and there was nowhere to
--          put them.
--
-- ============================================================================
-- What was missing
-- ============================================================================
-- Before submitting a report the reporter signs:
--
--     «أقر بأن جميع المعلومات المقدمة صحيحة، وأن لديّ مستندات تثبتها،
--      وأتحمل المسؤولية القانونية…»
--
-- `report_documents` exists, with correct policies, and is empty — 0 rows. No
-- screen writes to it, and there is no storage bucket for the files to live in.
-- So a reporter accepts legal responsibility for evidence the product gives
-- them no way to hand over, and a reviewer decides on an accusation with the
-- accuser's proof out of reach.
--
-- ============================================================================
-- Who may see an attachment
-- ============================================================================
-- The reporter and Marsad. Not the company being reported, and not other
-- companies reading its trust report.
--
-- This is not caution for its own sake. Migration 107 removed the reporter's
-- name from the timeline because a platform whose reporters can be identified
-- by the companies they reported on stops receiving honest reports. An invoice
-- or a contract carries names, letterheads and signatures — handing those to the
-- reported company undoes 107 completely, through the attachment instead of
-- through the field.
--
-- The table's own policies already say exactly this. What did not exist was the
-- bucket, so the files had no home and the rules had nothing to govern.

-- ============================================================================
-- 1. Somewhere for the files
-- ============================================================================
-- Private. A public bucket serves any object to anyone holding the URL, and
-- these are the most sensitive objects in the product.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-documents', 'report-documents', false,
  10 * 1024 * 1024,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- 2. Who may put a file there, read it, and take it back
-- ============================================================================
-- Keyed on the path. Every object is stored under the report it belongs to:
--
--     {report_id}/{uuid}-{original name}
--
-- so the first folder segment is the report, and the report says whose it is.
-- The comparison is `r.id::text = segment` rather than casting the segment to
-- uuid: a path that is not a uuid would make the cast throw, and a policy that
-- errors is a policy that denies for the wrong reason.
--
-- The row in report_documents cannot be the check for uploads, because the file
-- goes to storage first and the row is written after it.

drop policy if exists report_documents_upload on storage.objects;
create policy report_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-documents'
    and exists (
      select 1 from public.reports r
       where r.id::text = (storage.foldername(name))[1]
         and r.reporter_tenant_id = public.get_current_tenant_id()
    )
  );

drop policy if exists report_documents_read on storage.objects;
create policy report_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-documents'
    and exists (
      select 1 from public.reports r
       where r.id::text = (storage.foldername(name))[1]
         and (
           r.reporter_tenant_id = public.get_current_tenant_id()
           or coalesce(public.is_reviewer(), false)
         )
    )
  );

-- Only while the report is still a draft. Once it has been submitted the
-- evidence is part of what Marsad is being asked to judge, and evidence that can
-- be withdrawn after the fact is not evidence.
drop policy if exists report_documents_remove on storage.objects;
create policy report_documents_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-documents'
    and (
      coalesce(public.is_platform_admin(), false)
      or exists (
        select 1 from public.reports r
         where r.id::text = (storage.foldername(name))[1]
           and r.reporter_tenant_id = public.get_current_tenant_id()
           and r.status = 'draft'
      )
    )
  );

-- ============================================================================
-- 3. What a reviewer needs to see, in one read
-- ============================================================================
-- The review screen has a report id and needs the files with it. Going through
-- the table directly would work — its SELECT policy is already right — but the
-- signed URL has to be minted per object anyway, and a function keeps the
-- «who may look» answer in one place next to the others.
create or replace function public.report_attachments(p_report_id uuid)
returns table (
  id uuid,
  s3_key text,
  file_name text,
  mime_type text,
  file_size integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.s3_key::text, d.file_name::text, d.mime_type::text,
         d.file_size, d.created_at
    from public.report_documents d
    join public.reports r on r.id = d.report_id
   where d.report_id = p_report_id
     and public.get_current_user_id() is not null
     and (
       r.reporter_tenant_id = public.get_current_tenant_id()
       or coalesce(public.is_reviewer(), false)
     )
   order by d.created_at;
$$;

comment on function public.report_attachments(uuid) is
  'مرفقات تقرير — للمُبلِّغ ولإدارة مرصد فقط. الشركة المُبلَّغ عنها لا تراها: المرفق يحمل اسم المُبلِّغ وتوقيعه، وكشفه يُبطل ما فعله الترحيل 107.';

revoke all on function public.report_attachments(uuid) from public, anon;
grant execute on function public.report_attachments(uuid) to authenticated;

-- ============================================================================
-- 4. Prove it
-- ============================================================================
do $blk$
declare
  v_reporter  text;
  v_tenant    uuid;
  v_other     text;
  v_report    uuid;
  v_target    uuid;
  v_n         int;
  v_admin     text;
begin
  begin
    select u.id, u.tenant_id into v_reporter, v_tenant
      from public.users u
     where u.role in ('company_admin', 'company_member') and u.tenant_id is not null
     limit 1;
    select id into v_admin from public.users where role = 'platform_admin' limit 1;
    select id into v_target from public.companies limit 1;

    if v_reporter is null or v_target is null then
      raise notice 'لا بيانات كافية للفحص';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    -- A report of this tenant's, and its attachment.
    insert into public.reports (reporter_tenant_id, target_company_id, status,
                                dealt_at, payment_commitment, delay_days)
    values (v_tenant, v_target, 'draft', now(), 'full', 0)
    returning id into v_report;

    insert into public.report_documents (report_id, s3_key, file_name, mime_type, file_size, uploaded_by)
    values (v_report, v_report::text || '/probe.pdf', 'probe.pdf', 'application/pdf', 1234, v_reporter);

    set local role authenticated;

    -- The reporter sees its own evidence.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_reporter, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.report_attachments(v_report);
    if v_n <> 1 then raise exception 'المُبلِّغ لا يرى مرفقه: % صف', v_n; end if;

    -- Marsad sees it.
    if v_admin is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      select count(*) into v_n from public.report_attachments(v_report);
      if v_n <> 1 then raise exception 'إدارة مرصد لا ترى المرفق — المراجعة بلا دليل'; end if;
    end if;

    -- Nobody else does. Including a company from another tenant, which is the
    -- case that would undo 107.
    select u.id into v_other from public.users u
     where u.tenant_id is distinct from v_tenant
       and u.role in ('company_admin', 'company_member')
     limit 1;
    if v_other is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
      select count(*) into v_n from public.report_attachments(v_report);
      if v_n <> 0 then raise exception 'شركة أخرى ترى المرفق: % صف', v_n; end if;
    end if;

    -- And no session at all sees nothing.
    perform set_config('request.jwt.claims', null, true);
    select count(*) into v_n from public.report_attachments(v_report);
    if v_n <> 0 then raise exception 'المرفق مقروء بلا جلسة'; end if;

    reset role;
    raise notice '✅ المرفق للمُبلِّغ ولمرصد فقط، والحاوية خاصة';
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
