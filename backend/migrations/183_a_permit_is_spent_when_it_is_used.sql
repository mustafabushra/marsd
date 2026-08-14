-- Migration: 183_a_permit_is_spent_when_it_is_used.sql
--
-- إغلاق سلسلة: تصريحٌ لا يُستهلك + كتاباتٌ متزامنة لا تتسلسل.
--
-- ============================================================================
-- ما كشفته مجموعة الهجوم
-- ============================================================================
-- migration 180 جعل الحكم النظيف تصريحَ رفع. لكنه تصريحٌ:
--
--   لا يُستهلك   — يبقى صالحاً عشر دقائق مهما استُعمل
--   لا يعرف محتوى — يفحص الدلو والمسار والفاعل والوقت، لا ما يُرفع
--
-- وحدهما كانا محتملَين. لكن قياساً ثالثاً أظهر أن الكتابات المتزامنة على نفس
-- المفتاح **لا تتسلسل**: ثلاث من خمس جولات تسابقت، وفي أسوأها نجحت ثلاث
-- رفعات من ثلاث والباقي آخر الواصلين. و upsert:false يحمي من كتابة ثانية
-- تسلسلية فقط.
--
-- فاجتمعت الثلاثة في طريق: من ينال حكماً نظيفاً لمسار يسابق رفع البوّابة
-- نفسه ببايتات من عنده، فيستقرّ محتواه في المسار الذي يشير إليه صفّ
-- company_documents — أي بايتات لم تمرّ بالفاحص في دلو دائم.
--
-- ============================================================================
-- الإصلاح: التصريح يُنفَق عند استعماله
-- ============================================================================
-- عمود consumed_at، ومُشغّل على storage.objects ينفقه عند أول كتابة ناجحة
-- ويرفض الكتابة التي لا تجد تصريحاً غير منفَق.
--
-- والتسلسل يأتي من Postgres نفسه: `update ... where consumed_at is null` يأخذ
-- قفل صفّ. فمعاملتان متزامنتان تصطفّان عليه — الأولى تنفقه، والثانية تنتظر
-- ثم ترى أنه أُنفق فتُصيب صفر صفّاً فتُرفَع. لا يحتاج الأمر قفلاً صريحاً ولا
-- مستوى عزل أعلى.
--
-- ============================================================================
-- ولماذا مُشغّل لا سياسة
-- ============================================================================
-- السياسة تعبيرٌ يُقرأ ولا يكتب، فلا تستطيع أن تُنفق شيئاً. والمُشغّل يكتب،
-- فيصير الاستهلاك والتحقّق فعلاً واحداً ذرّياً.
--
-- ويسري على مفتاح الخدمة أيضاً — وهو مقصود: مسار الهاتف (handoff-upload)
-- يرفع بمفتاح خدمة، وهو يُنشئ حكمه قبل الرفع كما تفعل البوّابة. فلا استثناء
-- لأحد، ولا طريق يلتفّ.

-- ============================================================================
-- ١) الأعمدة
-- ============================================================================
alter table public.file_scans add column if not exists consumed_at timestamptz;

-- حجم ما يُخزَّن فعلاً — وهو غير size_bytes: المخرَج المُعقَّم يختلف طوله عن
-- الوارد (إعادة ترميز PNG تُغيّره دائماً).
alter table public.file_scans add column if not exists stored_size_bytes bigint;

create index if not exists file_scans_target_idx
  on public.file_scans (target_bucket, target_path)
  where verdict = 'clean' and consumed_at is null;

-- ============================================================================
-- ٢) التصريح يشترط ألّا يكون منفَقاً
-- ============================================================================
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
       and s.actor = public.get_current_user_id()
       and s.scanned_at > now() - interval '10 minutes'
       and s.consumed_at is null
  )
$$;

grant execute on function public.file_scan_permits(text, text) to authenticated;

-- ============================================================================
-- ٣) الاستهلاك عند الكتابة
-- ============================================================================
create or replace function public.consume_file_scan_permit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n    int;
  v_size bigint;
begin
  -- الحجر خارج هذا: لا حكم عليه بعد، وهو موضع الملفّات قبل الفحص.
  if new.bucket_id not in ('company-documents', 'report-documents', 'support-attachments') then
    return new;
  end if;

  v_size := nullif(new.metadata ->> 'size', '')::bigint;

  -- ذرّية: القراءة والإنفاق في عبارة واحدة تأخذ قفل الصفّ.
  update public.file_scans s
     set consumed_at = now()
   where s.target_bucket = new.bucket_id
     and s.target_path = new.name
     and s.verdict = 'clean'
     and s.consumed_at is null
     -- ربطٌ بالحجم حين يُعرف الطرفان. ليس ربطاً بالمحتوى — لكنه يُلزم من
     -- يحاول التبديل بأن يصوغ بايتاته بطول المخرَج المُعقَّم بالضبط.
     and (s.stored_size_bytes is null or v_size is null or s.stored_size_bytes = v_size);
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'لا تصريح فحص صالح لهذا المسار'
      using errcode = 'check_violation',
            detail = format('%s/%s', new.bucket_id, new.name);
  end if;

  return new;
end $$;

drop trigger if exists trg_consume_file_scan_permit on storage.objects;
create trigger trg_consume_file_scan_permit
  before insert on storage.objects
  for each row execute function public.consume_file_scan_permit();

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_user text;
  v_id   uuid;
  v_ok   boolean;
  v_err  text;
begin
  select id into v_user from public.users where status = 'active' order by id limit 1;
  if v_user is null then raise notice '(لا مستخدمين — تُخطّى)'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  insert into public.file_scans
    (sha256, quarantine_path, target_bucket, target_path, size_bytes, stored_size_bytes,
     scanner_version, actor, verdict, scanned_at)
  values (repeat('c', 64), 'q/x', 'company-documents', 'verify/183.pdf', 100, 100,
          'test', v_user, 'clean', now())
  returning id into v_id;

  select public.file_scan_permits('company-documents', 'verify/183.pdf') into v_ok;
  if not v_ok then raise exception 'التصريح غير صالح قبل الاستعمال'; end if;
  raise notice '✅ التصريح صالح قبل الاستعمال';

  -- كتابةٌ أولى: تنفقه.
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('company-documents', 'verify/183.pdf', v_user, '{"size":100}'::jsonb);
  raise notice '✅ الكتابة الأولى نجحت';

  if (select consumed_at from public.file_scans where id = v_id) is null then
    raise exception 'التصريح لم يُنفَق';
  end if;
  raise notice '✅ وأُنفق التصريح';

  select public.file_scan_permits('company-documents', 'verify/183.pdf') into v_ok;
  if v_ok then raise exception 'التصريح ما زال صالحاً بعد الإنفاق'; end if;
  raise notice '✅ ولم يعد صالحاً';

  -- كتابةٌ ثانية على نفس المسار: لا تصريح.
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('company-documents', 'verify/183b.pdf', v_user, '{"size":100}'::jsonb);
    raise exception 'قُبلت كتابة بلا تصريح';
  exception when check_violation then
    raise notice '✅ رُفضت كتابة بلا تصريح';
  end;

  -- الحجر لا يتأثّر.
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('quarantine', format('%s/free.png', v_user), v_user, '{"size":10}'::jsonb);
  raise notice '✅ والحجر يقبل بلا تصريح كما يجب';

  -- حجم مخالف يُردّ.
  insert into public.file_scans
    (sha256, quarantine_path, target_bucket, target_path, size_bytes, stored_size_bytes,
     scanner_version, actor, verdict, scanned_at)
  values (repeat('d', 64), 'q/y', 'company-documents', 'verify/183c.pdf', 100, 100,
          'test', v_user, 'clean', now());
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('company-documents', 'verify/183c.pdf', v_user, '{"size":999}'::jsonb);
    raise exception 'قُبل حجم مخالف';
  exception when check_violation then
    raise notice '✅ ورُفض حجم يخالف المُسجَّل';
  end;

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  get stacked diagnostics v_err = message_text;
  if v_err <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
