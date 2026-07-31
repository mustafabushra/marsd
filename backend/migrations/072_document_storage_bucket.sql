-- Migration: 072_document_storage_bucket.sql
-- Purpose: create the storage bucket the code has been trying to use since
--          before any of this, so documents stop being base64 text in a column.
--
-- ============================================================================
-- What is actually happening today
-- ============================================================================
-- CompanyOnboarding does this, and has for a long time:
--
--   supabase.storage.from('company-documents').upload(`cr-files/${name}`, crFile)
--
-- There is no bucket by that name. The upload fails every time and a base64
-- fallback catches it silently, so nine registration documents are sitting in
-- companies.cr_file_url as 9.1 MB of text. The code was written for storage; the
-- bucket was never created; the fallback has been carrying the product.
--
-- That is also what makes the size limit unanswerable. At 15 MB a file becomes
-- roughly 20 MB of text in a row, and the admin queue selects file_url with the
-- list — ten pending documents would be a 200 MB response. With a bucket the row
-- holds a short path and the bytes are fetched only when someone opens one.
--
-- ============================================================================
-- Nothing breaks
-- ============================================================================
-- The existing rows are left exactly as they are. file_url already holds either
-- a data: URL or a path, and the screens render both — so this changes where new
-- files go without touching a single stored document. Migrating the nine is a
-- separate decision, and doing it inside the change that creates the bucket
-- would mean one failure taking both.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-documents',
  'company-documents',
  false,                      -- never public: these are a company's papers
  21 * 1024 * 1024,           -- 15 MB of file, with room for multipart overhead
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public            = false;

-- ============================================================================
-- Who may put a file in it, and who may read one
-- ============================================================================
-- The bucket mirrors the table it serves. A signed-in user may upload; reading
-- is for Marsad's staff and for the tenant that uploaded the file. The bucket is
-- private, so a URL alone grants nothing — every read goes through these checks.

drop policy if exists company_documents_upload on storage.objects;
create policy company_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and public.get_current_user_id() is not null
  );

drop policy if exists company_documents_read on storage.objects;
create policy company_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-documents'
    and (
      coalesce(public.is_platform_admin() or public.is_reviewer(), false)
      or exists (
        select 1 from public.company_documents d
         where d.file_url = storage.objects.name
           and d.uploaded_by_tenant_id = public.get_current_tenant_id())
      -- The registration document is uploaded before its company_documents row
      -- exists, so the uploader is trusted for their own objects.
      or owner_id = public.get_current_user_id()
    )
  );

-- Withdrawing a pending document removes its file too. Marsad may remove any.
drop policy if exists company_documents_remove on storage.objects;
create policy company_documents_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-documents'
    and (
      coalesce(public.is_platform_admin(), false)
      or owner_id = public.get_current_user_id()
    )
  );

-- ============================================================================
-- Verify
-- ============================================================================
do $blk$
declare
  v_limit bigint;
  v_pub   boolean;
  v_pol   int;
begin
  select file_size_limit, public into v_limit, v_pub
    from storage.buckets where id = 'company-documents';
  if v_limit is null then
    raise exception 'الحاوية لم تُنشأ';
  end if;
  if v_pub then
    raise exception 'الحاوية عامة — مستندات الشركات لا تكون عامة';
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'company_documents_%';
  if v_pol < 3 then
    raise exception 'سياسات التخزين ناقصة: % من 3', v_pol;
  end if;

  raise notice '✅ الحاوية خاصة · حد % م.ب · % سياسات',
    round(v_limit / 1024.0 / 1024), v_pol;
end $blk$;
