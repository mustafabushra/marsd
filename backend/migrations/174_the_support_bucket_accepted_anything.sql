-- Migration: 174_the_support_bucket_accepted_anything.sql
--
-- دلو مرفقات الدعم الفني بلا حدّ حجم وبلا قائمة أنواع.
--
-- الدلوان الآخران محروسان: company-documents عند ٢١ م.ب وثلاثة أنواع، و
-- report-documents عند ١٠ م.ب وأربعة. أما support-attachments فيقبل أي حجم
-- وأي نوع — والواجهة تحدّه بعشرة ميغابايت، لكن حدّ الواجهة اقتراحٌ لمن يفتح
-- الشاشة لا قيدٌ على من يصوغ الطلب.
--
-- أي أن حساباً واحداً يستطيع رفع ملف بأي حجم، وأي محتوى، إلى تخزين المشروع.
--
-- الحدّ هنا عشرة ميغابايت مطابقةً لما تعد به الشاشة، والأنواع هي نفسها التي
-- تعد بها: PDF وصورة. ولا يوسّع هذا شيئاً — يجعل ما هو مكتوب في الواجهة
-- صحيحاً في الخادم.
--
-- ============================================================================
-- وما لا يفعله
-- ============================================================================
-- allowed_mime_types يفحص الترويسة التي يرسلها العميل، لا محتوى الملف. فهو
-- يمنع الخطأ ولا يمنع من يكتب application/pdf فوق ملف تنفيذي. فحص التوقيع
-- الفعلي في src/lib/fileSafety.js، ويجري قبل الرفع فيردّ الملف قبل أن يصل.
-- الطبقتان مطلوبتان: هذه تحكم ما وصل، وتلك تمنع الوصول.

update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array[
         'application/pdf',
         'image/png',
         'image/jpeg',
         'image/webp'
       ]
 where id = 'support-attachments';

-- تحقّق: الدلاء الثلاثة كلّها خاصّة ومحدودة الحجم ومقيَّدة النوع.
do $blk$
declare
  r record;
  v_bad text[] := '{}';
begin
  for r in select id, public, file_size_limit, allowed_mime_types
             from storage.buckets loop
    if r.public then
      v_bad := v_bad || (r.id || ': عام');
    end if;
    if r.file_size_limit is null then
      v_bad := v_bad || (r.id || ': بلا حدّ حجم');
    end if;
    if r.allowed_mime_types is null then
      v_bad := v_bad || (r.id || ': بلا قائمة أنواع');
    end if;
  end loop;

  if array_length(v_bad, 1) > 0 then
    raise exception 'دلاء غير محروسة: %', array_to_string(v_bad, ' · ');
  end if;
  raise notice '✅ كل الدلاء خاصّة ومحدودة الحجم ومقيَّدة النوع';
end $blk$;
