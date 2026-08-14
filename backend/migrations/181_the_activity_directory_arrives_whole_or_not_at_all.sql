-- Migration: 181_the_activity_directory_arrives_whole_or_not_at_all.sql
--
-- استيراد دليل الأنشطة: كلّه أو لا شيء، وبأثر.
--
-- ============================================================================
-- ما كان يحدث
-- ============================================================================
-- شاشة «دليل الأنشطة الاقتصادية» تكتب من المتصفّح مباشرةً، على دفعات من
-- خمسمئة صفّ. فإذا فشلت الدفعة الثالثة بقيت الأوليان مكتوبتين: دليلٌ نصفه
-- جديد ونصفه قديم، ولا أحد يعرف أين الحدّ.
--
-- ولم يكن يترك أثراً. من استورد، ومتى، وكم صفّاً، وبأيّ ملف — لا شيء من ذلك
-- مسجَّل، بينما هذا الجدول يُغذّي كل قائمة أنشطة في المنتج.
--
-- ولم يكن يتحقّق من شيء على الخادم. التحقّق كلّه في المتصفّح، ومن يفتح أدوات
-- المطوّر يكتب ما يشاء في جدولٍ مرجعي عامّ.
--
-- ============================================================================
-- الذرّية ليست خياراً هنا
-- ============================================================================
-- دالة PL/pgSQL تعمل داخل معاملة واحدة. فإن رُفع استثناء في الصفّ الأخير
-- تراجعت الكتابة كلّها — وهذا هو المطلوب حرفياً: «لا تُستبدَل البيانات
-- الحالية إلا بعد نجاح التحقّق والاستيراد بالكامل».
--
-- ولذلك يجري التحقّق من **كل** الصفوف قبل كتابة أوّلها.

-- ============================================================================
-- ١) قيود الجدول — ما كان يقبل أي شيء
-- ============================================================================
alter table public.reference_activities drop constraint if exists reference_activities_code_format;
alter table public.reference_activities
  add constraint reference_activities_code_format
  check (code ~ '^[0-9]{2,8}$') not valid;

alter table public.reference_activities drop constraint if exists reference_activities_name_len;
alter table public.reference_activities
  add constraint reference_activities_name_len
  check (char_length(name_ar) between 1 and 300
         and (name_en is null or char_length(name_en) <= 300)) not valid;

alter table public.reference_activities drop constraint if exists reference_activities_level_matches;
alter table public.reference_activities
  add constraint reference_activities_level_matches
  check (level = char_length(code)) not valid;

alter table public.reference_activities drop constraint if exists reference_activities_source_len;
alter table public.reference_activities
  add constraint reference_activities_source_len
  check (char_length(source) <= 60) not valid;

-- ============================================================================
-- ٢) الاستيراد
-- ============================================================================
--
-- `p_rows`  مصفوفة JSON: [{ code, name_ar, name_en?, level?, parent_code? }]
-- `p_mode`  'merge'   يُحدِّث ما ورد ويترك ما لم يرد
--           'replace' يُعطّل كل ما لم يرد في الملف (active = false)
--
-- و`replace` تُعطّل ولا تحذف: كودُ نشاط قد يكون مُشاراً إليه في صفّ شركة
-- كُتب قبل سنة، وحذفُه يُفقد معناه بأثر رجعي. التعطيل يُخفيه من القوائم
-- ويُبقي تفسيره.
create or replace function public.import_reference_activities(
  p_rows jsonb,
  p_mode text default 'merge',
  p_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      text := public.get_current_user_id();
  v_n          int;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_deactivated int := 0;
  v_bad        text;
  v_dupe       text;
begin
  -- ---- من يُصرَّح له ------------------------------------------------------
  -- الدالة SECURITY DEFINER فتتجاوز RLS، ولذلك تفحص الصلاحية بنفسها. دالةٌ
  -- تتجاوز الحراسة ولا تحرس هي الثغرة التي تُصنع بحسن نيّة.
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'هذا الإجراء لمسؤولي المنصة فقط';
  end if;

  if p_mode not in ('merge', 'replace') then
    raise exception 'وضع استيراد غير معروف: %', p_mode;
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'لم تصل صفوف صالحة';
  end if;

  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then raise exception 'لا صفوف للاستيراد'; end if;
  if v_n > 20000 then raise exception 'عدد الصفوف % يتجاوز الحدّ المسموح', v_n; end if;

  -- ---- التحقّق من الكلّ قبل كتابة الأوّل ----------------------------------
  -- التحقّق في المتصفّح مجاملة تُريح المستخدم. وهذا هو الذي لا يُتجاوَز:
  -- من ينادي الدالة بصفوف مصنوعة يُردّ هنا.
  create temp table _incoming on commit drop as
  select
    nullif(trim(r->>'code'), '')      as code,
    nullif(trim(r->>'name_ar'), '')   as name_ar,
    nullif(trim(r->>'name_en'), '')   as name_en
  from jsonb_array_elements(p_rows) r;

  select code into v_bad from _incoming where code is null or name_ar is null limit 1;
  if found then raise exception 'صفٌّ بكود أو وصف فارغ'; end if;

  select code into v_bad from _incoming where code !~ '^[0-9]{2,8}$' limit 1;
  if v_bad is not null then
    raise exception 'كود غير صالح: % — الكود من رقمين إلى ثمانية', v_bad;
  end if;

  select code into v_bad from _incoming where char_length(name_ar) > 300 limit 1;
  if v_bad is not null then raise exception 'وصف أطول من ٣٠٠ حرف عند الكود %', v_bad; end if;

  select code into v_dupe from _incoming group by code having count(*) > 1 limit 1;
  if v_dupe is not null then
    raise exception 'كود مكرّر في الملف: % — لكل نشاط صفٌّ واحد', v_dupe;
  end if;

  -- ---- الكتابة ------------------------------------------------------------
  select count(*) into v_updated
    from _incoming i join public.reference_activities a on a.code = i.code;
  v_inserted := v_n - v_updated;

  insert into public.reference_activities (code, name_ar, name_en, level, parent_code, active, source)
  select i.code,
         i.name_ar,
         i.name_en,
         char_length(i.code),
         case when char_length(i.code) > 2
              then left(i.code, char_length(i.code) - 2) end,
         true,
         'admin_import'
    from _incoming i
  on conflict (code) do update
     set name_ar     = excluded.name_ar,
         name_en     = coalesce(excluded.name_en, public.reference_activities.name_en),
         level       = excluded.level,
         parent_code = excluded.parent_code,
         active      = true,
         source      = excluded.source;

  if p_mode = 'replace' then
    update public.reference_activities a
       set active = false
     where a.active
       and not exists (select 1 from _incoming i where i.code = a.code);
    get diagnostics v_deactivated = row_count;
  end if;

  -- ---- الأثر --------------------------------------------------------------
  -- جدولٌ يُغذّي كل قائمة أنشطة في المنتج، ولم يكن يُعرف من غيّره.
  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_actor, 'activity_directory_imported', 'reference_activities', p_mode,
          jsonb_build_object(
            'mode', p_mode,
            'file_name', left(coalesce(p_file_name, ''), 200),
            'rows_received', v_n,
            'inserted', v_inserted,
            'updated', v_updated,
            'deactivated', v_deactivated));

  return jsonb_build_object(
    'rows_received', v_n,
    'inserted', v_inserted,
    'updated', v_updated,
    'deactivated', v_deactivated,
    'mode', p_mode);
end $$;

revoke all on function public.import_reference_activities(jsonb, text, text) from public, anon;
grant execute on function public.import_reference_activities(jsonb, text, text) to authenticated;

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_out   jsonb;
  v_before int;
  v_logs  int;
begin
  select id into v_admin from public.users where role = 'platform_admin' order by id limit 1;
  if v_admin is null then raise notice '(لا مسؤول منصّة — تُخطّى الاختبارات)'; return; end if;

  select count(*) into v_before from public.reference_activities;
  select count(*) into v_logs from public.audit_logs where action = 'activity_directory_imported';

  -- غير المسؤول يُردّ.
  perform set_config('request.jwt.claims', json_build_object('sub', 'user_not_admin')::text, true);
  begin
    perform public.import_reference_activities('[{"code":"9911","name_ar":"اختبار"}]'::jsonb);
    raise exception 'قُبل استيراد من غير مسؤول';
  exception when others then
    if sqlerrm = 'قُبل استيراد من غير مسؤول' then raise; end if;
    raise notice '✅ رُدّ غير المسؤول';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- كود غير صالح يُبطل الدفعة كلّها.
  begin
    perform public.import_reference_activities(
      '[{"code":"9911","name_ar":"صالح"},{"code":"ab","name_ar":"غير صالح"}]'::jsonb);
    raise exception 'قُبل كود غير صالح';
  exception when others then
    if sqlerrm = 'قُبل كود غير صالح' then raise; end if;
    raise notice '✅ كود غير صالح يُبطل الدفعة';
  end;

  if (select count(*) from public.reference_activities where code = '9911') > 0 then
    raise exception 'كُتب صفّ من دفعة فاشلة — الاستيراد ليس ذرّياً';
  end if;
  raise notice '✅ ولم يُكتب شيء من الدفعة الفاشلة';

  -- تكرار يُبطل.
  begin
    perform public.import_reference_activities(
      '[{"code":"9912","name_ar":"أ"},{"code":"9912","name_ar":"ب"}]'::jsonb);
    raise exception 'قُبل كود مكرّر';
  exception when others then
    if sqlerrm = 'قُبل كود مكرّر' then raise; end if;
    raise notice '✅ الكود المكرّر يُبطل الدفعة';
  end;

  -- وصف فارغ يُبطل.
  begin
    perform public.import_reference_activities('[{"code":"9913","name_ar":""}]'::jsonb);
    raise exception 'قُبل وصف فارغ';
  exception when others then
    if sqlerrm = 'قُبل وصف فارغ' then raise; end if;
    raise notice '✅ الوصف الفارغ يُبطل الدفعة';
  end;

  -- والصحيح يمرّ.
  select public.import_reference_activities(
    '[{"code":"9914","name_ar":"نشاط اختبار","name_en":"Test"},
      {"code":"991401","name_ar":"نشاط فرعي"}]'::jsonb, 'merge', 'test.csv') into v_out;
  if (v_out->>'inserted')::int <> 2 then raise exception 'عدد المُدرَج خطأ: %', v_out; end if;
  raise notice '✅ الاستيراد الصحيح يمرّ — %', v_out;

  if (select level from public.reference_activities where code = '991401') <> 6 then
    raise exception 'المستوى لم يُشتقّ من طول الكود';
  end if;
  if (select parent_code from public.reference_activities where code = '991401') <> '9914' then
    raise exception 'الكود الأب لم يُشتقّ';
  end if;
  raise notice '✅ والمستوى والأب يُشتقّان من الكود';

  if (select count(*) from public.audit_logs
       where action = 'activity_directory_imported') <> v_logs + 1 then
    raise exception 'الاستيراد لم يترك أثراً';
  end if;
  raise notice '✅ والاستيراد يترك قيد تدقيق';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
