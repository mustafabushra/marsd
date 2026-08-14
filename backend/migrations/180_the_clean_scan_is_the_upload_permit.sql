-- Migration: 180_the_clean_scan_is_the_upload_permit.sql
--
-- البوّابة تصير إجبارية.
--
-- ============================================================================
-- المشكلة التي تحلّها هذه المهاجرة
-- ============================================================================
-- migration 179 أنشأ الحجر، والشيفرة تمرّ به الآن. لكن الدلاء الدائمة ما زالت
-- تقبل الكتابة المباشرة من أي مستخدم مسجَّل — فالبوّابة عُرفٌ في الشيفرة لا
-- قاعدةٌ في القاعدة. ومن يفتح أدوات المطوّر ويستدعي `storage.upload` يتجاوزها
-- في سطر واحد.
--
-- ============================================================================
-- لماذا لا يُسحب حقّ الرفع ببساطة
-- ============================================================================
-- لأن البوّابة ترفع **بهويّة المستخدم نفسه**، لا بمفتاح الخدمة. وذلك مقصود:
-- `report-documents` لا يقبل الكتابة إلا في مجلّد تقريرٍ يملكه مستأجر الكاتب،
-- و`support-attachments` إلا في مجلّد تذكرة فتحها هو. مفتاح الخدمة يتجاوز ذلك
-- كلّه، ولو رفعت البوّابة به لَوَجب أن تُعاد كتابة كل قاعدة تصريح من جديد —
-- ونسخةٌ ثانية تفترق عن الأولى، فتصير البوّابةُ التي أُضيفت للأمان هي الثغرة.
--
-- فسحبُ حقّ الرفع من المستخدم يُعطّل البوّابة نفسها.
--
-- ============================================================================
-- الحل: الحكم النظيف هو التصريح
-- ============================================================================
-- يبقى حقّ الرفع، ويُضاف إليه شرط: أن يوجد في `file_scans` صفٌّ بحكم `clean`
-- لهذا الدلو، وهذا المسار، وهذا الفاعل، عمره أقل من عشر دقائق.
--
-- والمستخدم لا يستطيع اصطناع ذلك الصفّ: لا سياسة INSERT على `file_scans`
-- إطلاقاً، ولا يكتب فيه إلا مفتاح الخدمة من داخل `api/scan-document.js` بعد
-- أن يقرأ البايتات ويحكم عليها.
--
-- فالنتيجة أن كل شرط تصريح قائم يبقى كما هو، ويُضاف إليه شرطٌ واحد: أن يكون
-- الملف قد فُحص. والشرطان يجتمعان بـAND، فلا يُوسّع أحدهما الآخر.
--
-- ============================================================================
-- لماذا دالة SECURITY DEFINER لا استعلام مباشر داخل السياسة
-- ============================================================================
-- السياسة تُنفَّذ بدور `authenticated`، و`file_scans` عليه RLS لا يسمح لغير
-- مسؤول المنصّة بالقراءة. فاستعلامٌ مباشر داخل السياسة يرى صفراً من الصفوف
-- دائماً، فتُغلق الدلاء أمام الجميع — عطلٌ يبدو أمناً.

create or replace function public.file_scan_permits(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.file_scans s
     where s.target_bucket = p_bucket
       and s.target_path = p_path
       and s.verdict = 'clean'
       -- الفاعل نفسه: بدونه يستطيع أيٌّ أن يكتب في مسارٍ فُحص لغيره.
       and s.actor = public.get_current_user_id()
       -- تصريحٌ لا ينتهي يصير مفتاحاً دائماً.
       and s.scanned_at > now() - interval '10 minutes'
  )
$$;

grant execute on function public.file_scan_permits(text, text) to authenticated;

-- ============================================================================
-- الدلاء الثلاثة
-- ============================================================================
-- تُعاد كتابة كل سياسة رفع بشرطها الأصلي **مضافاً إليه** شرط الفحص. الشرط
-- الأصلي منقول كما هو من migration سابق، لا مُعاد صياغته: صياغةٌ جديدة قد
-- توسّع بلا قصد.

drop policy if exists company_documents_upload on storage.objects;
create policy company_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and public.get_current_user_id() is not null
    and public.file_scan_permits('company-documents', name)
  );

drop policy if exists report_documents_upload on storage.objects;
create policy report_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-documents'
    and exists (
      select 1 from public.reports r
       where r.id::text = (storage.foldername(name))[1]
         and r.reporter_tenant_id = public.get_current_tenant_id())
    and public.file_scan_permits('report-documents', name)
  );

drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and exists (
      select 1 from public.support_tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.created_by = public.get_current_user_id())
    and public.file_scan_permits('support-attachments', name)
  );

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_user   text;
  v_ok     boolean;
  v_scan   uuid;
begin
  select id into v_user from public.users where status = 'active' limit 1;
  if v_user is null then raise notice '(لا مستخدمين — تُخطّى اختبارات التصريح)'; return; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- بلا صفّ فحص: لا تصريح.
  select public.file_scan_permits('company-documents', 'x/y.pdf') into v_ok;
  if v_ok then raise exception 'صُرّح بلا فحص'; end if;
  raise notice '✅ لا تصريح بلا فحص';

  insert into public.file_scans
    (sha256, quarantine_path, target_bucket, target_path, size_bytes,
     scanner_version, actor, verdict, scanned_at)
  values (repeat('a', 64), 'q/a', 'company-documents', 'x/y.pdf', 10,
          'test', v_user, 'clean', now())
  returning id into v_scan;

  select public.file_scan_permits('company-documents', 'x/y.pdf') into v_ok;
  if not v_ok then raise exception 'لم يُصرَّح رغم وجود حكم نظيف'; end if;
  raise notice '✅ الحكم النظيف يُصرّح';

  -- مسار آخر لا يُصرَّح به.
  select public.file_scan_permits('company-documents', 'x/other.pdf') into v_ok;
  if v_ok then raise exception 'صُرّح لمسار لم يُفحص'; end if;
  raise notice '✅ التصريح مقصور على مساره';

  -- دلو آخر لا يُصرَّح به.
  select public.file_scan_permits('report-documents', 'x/y.pdf') into v_ok;
  if v_ok then raise exception 'صُرّح لدلو آخر'; end if;
  raise notice '✅ والتصريح مقصور على دلوه';

  -- فاعل آخر لا يُصرَّح له.
  perform set_config('request.jwt.claims', json_build_object('sub', 'user_someone_else')::text, true);
  select public.file_scan_permits('company-documents', 'x/y.pdf') into v_ok;
  if v_ok then raise exception 'صُرّح لفاعل آخر'; end if;
  raise notice '✅ والتصريح مقصور على فاعله';

  -- وتصريحٌ قديم لا يُقبل.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  update public.file_scans set scanned_at = now() - interval '11 minutes' where id = v_scan;
  select public.file_scan_permits('company-documents', 'x/y.pdf') into v_ok;
  if v_ok then raise exception 'قُبل تصريح منتهٍ'; end if;
  raise notice '✅ والتصريح ينتهي بعد عشر دقائق';

  -- كل سياسات الرفع تشترط الفحص.
  if (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'
         and with_check like '%file_scan_permits%') <> 3 then
    raise exception 'ليست كل سياسات الرفع مشروطة بالفحص';
  end if;
  raise notice '✅ ثلاث سياسات رفع، كلّها مشروطة بالفحص';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
