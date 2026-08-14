-- Migration: 179_nothing_reaches_storage_unscanned.sql
--
-- دلو حجر، وسجلّ لما فُحص وبِمَ حُكم عليه.
--
-- ============================================================================
-- ما هذا وما ليس هو
-- ============================================================================
-- هذه بوّابة فحص مستندات، لا مضادّ فيروسات. الفرق ليس لفظياً:
--
--   مضادّ الفيروسات يجيب سؤالاً مفتوحاً — «أخبيثٌ هذا الملف؟»
--   والبوّابة تجيب سؤالاً مغلقاً — «أهذا مستندٌ سليم البنية من النوع المطلوب؟»
--
-- والثاني قابل للتنفيذ: شهادة سجل تجاري لا سبب مشروع لأن تحوي JavaScript، ولا
-- إجراءً تلقائياً، ولا ملفاً مضمَّناً. رفض ذلك سياسةٌ إيجابياتها الكاذبة قريبة
-- من الصفر. أمّا كشف البرمجية الخبيثة المجهولة فوعدٌ لا نستطيع الوفاء به، ولا
-- يُقال إننا نفيه.
--
-- ============================================================================
-- لماذا دلو منفصل لا عمود حالة
-- ============================================================================
-- «مرفوعٌ ولم يُفحص بعد» حالةٌ لا تُؤتمن على عمود: صفٌّ يشير إلى ملف في الدلو
-- الدائم موجودٌ فعلاً، ورابطٌ موقَّع له يُصدر، وشاشةٌ تعرضه — قبل أن يقرأ
-- الفاحص بايتةً واحدة. والعمود يحمي من الخطأ لا من التسلسل.
--
-- فالفصل مكانيّ: الملف يصل إلى `quarantine` ولا شيء في المنتج يقرأ منه. ولا
-- يبلغ الدلو الدائم إلا بعد حكم، ومن الخادم بمفتاح خدمة.
--
-- ============================================================================
-- من يستطيع ماذا في دلو الحجر
-- ============================================================================
-- الرفع فقط، وفي مجلّد باسم صاحبه. لا قراءة ولا حذف ولا تعديل — حتى لمن رفع.
-- من يقرأ ما رفعه يستطيع أن يُخدَع بمشاركة رابطه، ومن يحذف يستطيع محو أثر
-- محاولة. القراءة والحذف لمفتاح الخدمة وحده.

-- ============================================================================
-- ١) الدلو
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quarantine', 'quarantine', false, 22020096,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quarantine_upload on storage.objects;
create policy quarantine_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quarantine'
    -- المجلّد الأول هو معرّف الرافع. لا يكتب أحد في مجلّد غيره.
    and (storage.foldername(name))[1] = public.get_current_user_id()
  );

-- لا سياسة SELECT ولا UPDATE ولا DELETE على هذا الدلو، عمداً. غيابها ليس
-- سهواً: RLS يمنع ما لا تسمح به سياسة، ومفتاح الخدمة وحده يتجاوز RLS.

-- ============================================================================
-- ٢) سجلّ الفحص
-- ============================================================================
create table if not exists public.file_scans (
  id               uuid primary key default gen_random_uuid(),
  sha256           text not null,
  quarantine_path  text not null,
  target_bucket    text not null,
  target_path      text,
  declared_mime    text,
  detected_type    text,
  size_bytes       bigint not null,
  -- pending  وصل ولم يُحكم عليه
  -- clean    مرّ ورُقّي
  -- rejected رُفض بسبب مُسمّى
  -- error    تعذّر الفحص — ويبقى في الحجر، لا يُرقّى
  verdict          text not null default 'pending',
  reasons          jsonb not null default '[]'::jsonb,
  scanner_version  text not null,
  actor            text,
  created_at       timestamptz not null default now(),
  scanned_at       timestamptz
);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'file_scans_verdict_check') then
    alter table public.file_scans add constraint file_scans_verdict_check
      check (verdict in ('pending', 'clean', 'rejected', 'error'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'file_scans_sha256_format') then
    alter table public.file_scans add constraint file_scans_sha256_format
      check (sha256 ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'file_scans_size_range') then
    alter table public.file_scans add constraint file_scans_size_range
      check (size_bytes > 0 and size_bytes <= 22020096);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'file_scans_paths_maxlen') then
    alter table public.file_scans add constraint file_scans_paths_maxlen
      check (char_length(quarantine_path) <= 500
             and (target_path is null or char_length(target_path) <= 500)
             and char_length(target_bucket) <= 100
             and (declared_mime is null or char_length(declared_mime) <= 100)
             and (detected_type is null or char_length(detected_type) <= 100)
             and char_length(scanner_version) <= 40
             and (actor is null or char_length(actor) <= 255));
  end if;
end $c$;

-- التجزئة تُبحث كثيراً: لمنع رفعٍ مكرّر لِما رُفض، ولسمعة التجزئة لاحقاً.
create index if not exists file_scans_sha256_idx on public.file_scans (sha256);
create index if not exists file_scans_verdict_idx on public.file_scans (verdict, created_at desc);
create index if not exists file_scans_actor_idx on public.file_scans (actor, created_at desc);

alter table public.file_scans enable row level security;

-- يُقرأ للمراجعة، ولا يُكتب إلا بمفتاح خدمة. سجلٌّ يستطيع صاحب المحاولة
-- تعديله ليس سجلّاً.
drop policy if exists file_scans_admin_read on public.file_scans;
create policy file_scans_admin_read on public.file_scans
  for select to authenticated
  using (public.is_platform_admin());

-- ============================================================================
-- ٣) ما رُفض من قبل يُعرف بتجزئته
-- ============================================================================
-- ليست «سمعة تجزئة» — تلك مرحلة لاحقة بقوائم خارجية. هذه ذاكرةُ البوّابة
-- نفسها: ملفٌ حكمنا عليه بالرفض أمس لا يُعاد فحصه اليوم، ولا يُرقّى.
create or replace function public.file_hash_verdict(p_sha256 text)
returns table (verdict text, reasons jsonb, seen_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.verdict, s.reasons, s.created_at
    from public.file_scans s
   where s.sha256 = p_sha256
     and s.verdict = 'rejected'
   order by s.created_at desc
   limit 1
$$;

revoke all on function public.file_hash_verdict(text) from public, anon, authenticated;

-- ============================================================================
-- ٤) الأثر
-- ============================================================================
-- الرفض حدثٌ أمني: من حاول، وبماذا، ومتى. ويُكتب في نفس السجلّ الذي لا
-- يُحذف ولا يُعدَّل (راجع migration 176).
create or replace function public.log_file_scan_verdict()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.verdict in ('rejected', 'error')
     and (tg_op = 'INSERT' or old.verdict is distinct from new.verdict) then
    -- الأسماء بنفس عُرف الجدول: snake_case بلا نقاط.
    insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
    values (
      new.actor,
      case new.verdict when 'rejected' then 'file_rejected' else 'file_scan_error' end,
      'file_scan',
      new.id::text,
      jsonb_build_object(
        'sha256', new.sha256,
        'detected_type', new.detected_type,
        'declared_mime', new.declared_mime,
        'size_bytes', new.size_bytes,
        'target_bucket', new.target_bucket,
        'reasons', new.reasons));
  end if;
  return new;
end $$;

drop trigger if exists trg_log_file_scan on public.file_scans;
create trigger trg_log_file_scan
  after insert or update of verdict on public.file_scans
  for each row execute function public.log_file_scan_verdict();

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_n int;
  v_id uuid;
  v_logs int;
begin
  select count(*) into v_n from storage.buckets where id = 'quarantine' and not public;
  if v_n <> 1 then raise exception 'دلو الحجر غير موجود أو ليس خاصاً'; end if;
  raise notice '✅ دلو الحجر خاصّ';

  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and qual like '%quarantine%' or with_check like '%quarantine%';
  raise notice '✅ سياسات الحجر: % (الرفع فقط)', v_n;

  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
     and coalesce(qual, '') like '%quarantine%';
  if v_n > 0 then raise exception 'يوجد سياسة قراءة على دلو الحجر'; end if;
  raise notice '✅ لا قراءة من الحجر لغير مفتاح الخدمة';

  -- سجلّ يقبل الصحيح ويرفض المشوّه.
  begin
    insert into public.file_scans (sha256, quarantine_path, target_bucket, size_bytes, scanner_version)
    values ('غير-تجزئة', 'a/b', 'company-documents', 10, 'v1');
    raise exception 'قُبلت تجزئة مشوّهة';
  exception when check_violation then
    raise notice '✅ رُفضت تجزئة مشوّهة';
  end;

  begin
    insert into public.file_scans (sha256, quarantine_path, target_bucket, size_bytes, scanner_version, verdict)
    values (repeat('a', 64), 'a/b', 'company-documents', 10, 'v1', 'maybe');
    raise exception 'قُبل حكم غير معروف';
  exception when check_violation then
    raise notice '✅ رُفض حكم خارج القائمة';
  end;

  select count(*) into v_logs from public.audit_logs where action = 'file_rejected';
  insert into public.file_scans
    (sha256, quarantine_path, target_bucket, size_bytes, scanner_version, verdict, reasons, actor)
  values (repeat('b', 64), 'u/x.pdf', 'company-documents', 1024, 'v1', 'rejected',
          '["pdf_active_content"]'::jsonb, 'user_test')
  returning id into v_id;

  select count(*) into v_n from public.audit_logs where action = 'file_rejected';
  if v_n <> v_logs + 1 then raise exception 'الرفض لم يترك أثراً'; end if;
  raise notice '✅ الرفض يكتب قيد تدقيق';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
