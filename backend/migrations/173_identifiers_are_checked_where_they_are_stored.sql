-- Migration: 173_identifiers_are_checked_where_they_are_stored.sql
--
-- الرقم الموحّد ورقم السجل والجوّال بلا أي قيد شكل في القاعدة.
--
-- التحقّق الوحيد من الرقم الموحّد كان تعبيراً نمطياً داخل مُسجِّل استخراج
-- OCR — أي أداة تخمين لا بوّابة إدخال. وكل مسار آخر — استيراد، أو RPC، أو
-- طلب يُصاغ بيد ضد PostgREST — يكتب ما يشاء.
--
-- والخلط بين الرقمين تحديداً ليس خطأً تجميلياً: كلاهما عشرة أرقام، والموحّد
-- وحده يبدأ بـ 70. رقمٌ في الحقل الخطأ يربط تقريراً بشركة أخرى.
--
-- ============================================================================
-- NOT VALID، عمداً
-- ============================================================================
-- القيود تُضاف NOT VALID: تحرس كل كتابة جديدة ولا تفحص الصفوف القائمة عند
-- الإضافة. الصفوف اليوم نظيفة — فُحصت قبل الكتابة، خمسة أرقام سجل وثلاثة
-- موحّدة وجوّال واحد، كلّها مطابقة — لكن قاعدةً تُبنى من هذه المهاجرات قد
-- تُملأ باستيراد قديم، وقيدٌ يفشل عند التركيب يوقف النشر كلّه.
--
-- والتحقّق من القديم يبقى ممكناً بأمر واحد متى أُريد:
--   alter table public.companies validate constraint companies_cr_number_format;
--
-- ============================================================================
-- ما لا يُقيَّد
-- ============================================================================
-- الأسماء والعناوين والملاحظات تبقى حرّة: قيدٌ على نصّ عربي حرّ يرفض اسماً
-- صحيحاً فيه قوس أو شرطة، والحماية منه تكون بالتهريب عند العرض لا بالمنع عند
-- التخزين. المُقيَّد هنا ما له شكل واحد معروف.

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
alter table public.companies
  drop constraint if exists companies_cr_number_format;
alter table public.companies
  add constraint companies_cr_number_format
  check (cr_number is null or cr_number ~ '^[0-9]{10}$') not valid;

alter table public.companies
  drop constraint if exists companies_unified_number_format;
alter table public.companies
  add constraint companies_unified_number_format
  check (unified_number is null or unified_number ~ '^70[0-9]{8}$') not valid;

alter table public.companies
  drop constraint if exists companies_phone_format;
alter table public.companies
  add constraint companies_phone_format
  check (phone is null or phone ~ '^05[0-9]{8}$') not valid;

-- طول الاسم: حدٌّ أعلى يمنع حقلاً يُملأ بميغابايت، لا يقيّد الاسم نفسه.
alter table public.companies
  drop constraint if exists companies_name_length;
alter table public.companies
  add constraint companies_name_length
  check (name is null or char_length(name) between 1 and 300) not valid;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
alter table public.tenants
  drop constraint if exists tenants_phone_format;
alter table public.tenants
  add constraint tenants_phone_format
  check (phone is null or phone ~ '^05[0-9]{8}$') not valid;

alter table public.tenants
  drop constraint if exists tenants_email_format;
alter table public.tenants
  add constraint tenants_email_format
  check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter table public.users
  drop constraint if exists users_email_format;
alter table public.users
  add constraint users_email_format
  check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;

-- تحقّق: القيود ترفض الشكل الخاطئ وتقبل الصحيح، والصفوف القائمة سليمة.
do $blk$
declare
  v_bad int;
  v_co  uuid;
begin
  -- الصفوف القائمة: تُفحص هنا ولو كان القيد NOT VALID، فنعرف إن كان
  -- validate ممكناً اليوم.
  select count(*) into v_bad from public.companies
   where (cr_number is not null and cr_number !~ '^[0-9]{10}$')
      or (unified_number is not null and unified_number !~ '^70[0-9]{8}$')
      or (phone is not null and phone !~ '^05[0-9]{8}$');
  if v_bad > 0 then
    raise notice '⚠ % صفّاً قائماً لا يطابق — القيود تحرس الجديد فقط', v_bad;
  else
    raise notice '✅ كل الصفوف القائمة مطابقة — validate ممكن متى أُريد';
  end if;

  select id into v_co from public.companies limit 1;
  if v_co is null then return; end if;

  -- رقم موحّد لا يبدأ بـ 70 يجب أن يُرفض.
  begin
    update public.companies set unified_number = '1010983229' where id = v_co;
    raise exception 'قُبل رقم موحّد لا يبدأ بـ 70';
  exception when check_violation then
    raise notice '✅ رُفض رقم موحّد لا يبدأ بـ 70';
  end;

  -- جوّال بصيغة خاطئة يجب أن يُرفض.
  begin
    update public.companies set phone = '+966509918852' where id = v_co;
    raise exception 'قُبل جوّال غير موحَّد الصيغة';
  exception when check_violation then
    raise notice '✅ رُفض جوّال غير موحَّد الصيغة';
  end;

  -- والصحيح يُقبل.
  update public.companies set unified_number = '7099999999', phone = '0501234567'
   where id = v_co;
  raise notice '✅ قُبل الشكل الصحيح';
  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
end $blk$;
