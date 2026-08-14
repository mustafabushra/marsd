-- Migration: 184_an_audit_entry_names_whoever_wrote_it.sql
--
-- إغلاق: تلفيق قيد تدقيق باسم غير كاتبه.
--
-- ============================================================================
-- ما كشفته مجموعة الهجوم
-- ============================================================================
-- مستخدمٌ مسجَّل عادي (company_admin، لا مسؤول منصّة) أدرج في audit_logs صفّاً
-- فاعله 'user_VICTIM'، **وخُزِّن كما طُلب**.
--
-- والسبب مركّب:
--
--   على الجدول سياستا INSERT مسموحتان، وسياسات الإدراج المسموحة تُجمع بـOR:
--     audit_logs_insert         تشترط actor_id = get_current_user_id() أو NULL
--     audit_logs_insert_policy  تشترط tenant_id = get_current_tenant_id() فقط
--   فالثانية لا تذكر الفاعل، فتُجيز ما تمنعه الأولى.
--
--   ومُشغّل stamp_audit_actor يملأ الفاعل حين يكون فارغاً ولا يُصحّحه حين
--   يُملأ — بتعليقٍ يقول «لا تُكتب فوقه أبداً».
--
-- ============================================================================
-- التعليق كان صحيحاً في نصفه
-- ============================================================================
-- «مسؤولٌ يتصرّف نيابةً عن شركة قد يُسجّل تلك الشركة موضوعاً للحدث» — وهذا
-- صحيح، وينطبق على tenant_id: الموضوع قد يكون غير الفاعل.
--
-- أمّا actor_id فليس موضوعاً بل **من فعل**. ولا حالة مشروعة يكون فيها الفاعل
-- غير صاحب الجلسة التي تكتب. فالنصف الأول من التعليق يبقى، والثاني يسقط.
--
-- ============================================================================
-- لماذا المُشغّل لا السياسة
-- ============================================================================
-- عشرات المواضع في الواجهة تُدرج في audit_logs مباشرةً (AddCompany و AddReport
-- و AdminBulkImport و AdminClaimRequests وغيرها). فتشديد السياسة يكسرها كلّها.
--
-- والمُشغّل يُصحّح بدل أن يمنع: القيمة تُستبدل قبل فحص السياسة وقبل التخزين،
-- فيمرّ الإدراج ويُسجَّل الفاعل الصحيح. لا شيء ينكسر، ولا يبقى طريق للتلفيق.
--
-- ويُصحَّح فقط حين توجد جلسة حقيقية: الدوال التي تعمل بمفتاح خدمة بلا توكن
-- (مسار الهاتف مثلاً، وفاعله 'handoff:...') لا هويّة لها تُستبدل بها، فتبقى
-- قيمتها كما كُتبت.

create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller text := public.get_current_user_id();
begin
  -- الفاعل من الجلسة، لا مما أُرسل. وهذا هو التغيير: كان يُملأ عند الفراغ
  -- فقط، فأمكن إرسال فاعل آخر ويُخزَّن كما أُرسل.
  if v_caller is not null then
    new.actor_id := v_caller;
  elsif new.actor_id is null then
    -- سياق خدمة بلا توكن: يبقى ما كُتب (قد يكون 'handoff:…' أو فارغاً).
    new.actor_id := null;
  end if;

  -- الموضوع قد يكون غير الفاعل: مسؤولٌ يتصرّف نيابةً عن شركة يُسجّل تلك
  -- الشركة. فهذا يُملأ عند الفراغ ولا يُكتب فوقه.
  if new.tenant_id is null then
    new.tenant_id := public.get_current_tenant_id();
  end if;

  if new.created_at is null then
    new.created_at := now();
  end if;

  return new;
end;
$function$;

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_user  text;
  v_other text;
  v_got   text;
  v_err   text;
begin
  select id into v_user from public.users
   where status = 'active' and role not in ('platform_admin') order by id limit 1;
  if v_user is null then
    select id into v_user from public.users where status = 'active' order by id limit 1;
  end if;
  if v_user is null then raise notice '(لا مستخدمين — تُخطّى)'; return; end if;

  select id into v_other from public.users where id <> v_user order by id limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- محاولة التلفيق.
  insert into public.audit_logs (actor_id, action, entity)
  values (coalesce(v_other, 'user_VICTIM'), 'forgery_attempt', 'test')
  returning actor_id into v_got;

  if v_got <> v_user then
    raise exception 'التلفيق نجح: طُلب % وخُزِّن %', coalesce(v_other, 'user_VICTIM'), v_got;
  end if;
  raise notice '✅ الفاعل صُحّح إلى صاحب الجلسة';

  -- والفراغ يُملأ كما كان.
  insert into public.audit_logs (actor_id, action, entity)
  values (null, 'null_actor', 'test') returning actor_id into v_got;
  if v_got <> v_user then raise exception 'الفاعل الفارغ لم يُملأ'; end if;
  raise notice '✅ والفاعل الفارغ يُملأ من الجلسة';

  -- سياق خدمة: بلا توكن، تبقى القيمة كما كُتبت.
  perform set_config('request.jwt.claims', '', true);
  insert into public.audit_logs (actor_id, action, entity)
  values ('handoff:شركة', 'service_context', 'test') returning actor_id into v_got;
  if v_got <> 'handoff:شركة' then
    raise exception 'سياق الخدمة فقد فاعله: %', v_got;
  end if;
  raise notice '✅ وسياق الخدمة يحتفظ بفاعله';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  get stacked diagnostics v_err = message_text;
  if v_err <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
