-- Migration: 182_the_import_holds_no_state_between_calls.sql
--
-- إصلاح: `import_reference_activities` كانت تُنشئ جدولاً مؤقّتاً.
--
-- ============================================================================
-- ما الذي انكسر
-- ============================================================================
-- migration 181 استعملت `create temp table _incoming on commit drop`. والقيد
-- `on commit drop` يُسقط الجدول عند **الإيداع** لا عند انتهاء الدالة — فإن
-- نُوديت الدالة مرّتين داخل معاملة واحدة فشلت الثانية بـ:
--
--   relation "_incoming" already exists
--
-- ولم يظهر ذلك في تحقّق 181 لأنه ينادي الدالة نداءً ناجحاً واحداً. وظهر في
-- مجموعة الفحص حين نُوديت مرّاتٍ متتالية داخل معاملة — وهو ما يحدث في أي
-- اختبار، وفي أي مسار يجمع نداءين.
--
-- ============================================================================
-- الإصلاح: لا حالة أصلاً
-- ============================================================================
-- الجدول المؤقّت كان راحةً لا حاجة. الصفوف تُقرأ من `p_rows` في كل استعلام
-- عبر CTE، فلا شيء يُنشأ ولا شيء يبقى بين نداءين.
--
-- والتحقّق صار استعلاماً واحداً يُرجع أول مشكلة أو `null`: أوضح من ستّ
-- كتلٍ متتابعة، وأقصر.
--
-- وما عدا ذلك من 181 باقٍ كما هو: الصلاحية، والذرّية، والأثر، والوضعان.

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
  v_actor       text := public.get_current_user_id();
  v_n           int;
  v_inserted    int := 0;
  v_updated     int := 0;
  v_deactivated int := 0;
  v_problem     text;
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
  --
  -- والترتيب مقصود: الفراغ أولاً لأن الكود الفارغ يُفشل بقيّة الفحوص برسائل
  -- أقلّ وضوحاً.
  with rows_in as (
    select nullif(btrim(r->>'code'), '')    as code,
           nullif(btrim(r->>'name_ar'), '') as name_ar
      from jsonb_array_elements(p_rows) r
  )
  select coalesce(
    (select 'صفٌّ بكود أو وصف فارغ'
       from rows_in where code is null or name_ar is null limit 1),
    (select format('كود غير صالح: %s — الكود من رقمين إلى ثمانية أرقام', code)
       from rows_in where code !~ '^[0-9]{2,8}$' limit 1),
    (select format('وصف أطول من ٣٠٠ حرف عند الكود %s', code)
       from rows_in where char_length(name_ar) > 300 limit 1),
    (select format('كود مكرّر في الملف: %s — لكل نشاط صفٌّ واحد', code)
       from rows_in group by code having count(*) > 1 limit 1)
  ) into v_problem;

  if v_problem is not null then raise exception '%', v_problem; end if;

  -- ---- الكتابة ------------------------------------------------------------
  with rows_in as (
    select distinct btrim(r->>'code') as code from jsonb_array_elements(p_rows) r
  )
  select count(*) into v_updated
    from rows_in i join public.reference_activities a on a.code = i.code;
  v_inserted := v_n - v_updated;

  with rows_in as (
    select btrim(r->>'code')                 as code,
           btrim(r->>'name_ar')              as name_ar,
           nullif(btrim(r->>'name_en'), '')  as name_en
      from jsonb_array_elements(p_rows) r
  )
  insert into public.reference_activities (code, name_ar, name_en, level, parent_code, active, source)
  select i.code,
         i.name_ar,
         i.name_en,
         char_length(i.code),
         case when char_length(i.code) > 2
              then left(i.code, char_length(i.code) - 2) end,
         true,
         'admin_import'
    from rows_in i
  on conflict (code) do update
     set name_ar     = excluded.name_ar,
         -- الإنجليزية تبقى إن لم تُرسَل: ملفٌ عربي لا يجب أن يمحو ترجمةً
         -- أُدخلت من مصدر آخر.
         name_en     = coalesce(excluded.name_en, public.reference_activities.name_en),
         level       = excluded.level,
         parent_code = excluded.parent_code,
         active      = true,
         source      = excluded.source;

  if p_mode = 'replace' then
    -- يُعطّل ولا يحذف: كود نشاط قد يكون مُشاراً إليه في صفّ شركة كُتب قبل
    -- سنة، وحذفُه يُفقد معناه بأثر رجعي.
    update public.reference_activities a
       set active = false
     where a.active
       and not exists (
         select 1 from jsonb_array_elements(p_rows) r
          where btrim(r->>'code') = a.code);
    get diagnostics v_deactivated = row_count;
  end if;

  -- ---- الأثر --------------------------------------------------------------
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
-- تحقّق — نداءان متتاليان في معاملة واحدة، وهو ما كان يفشل
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_a jsonb;
  v_b jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' order by id limit 1;
  if v_admin is null then raise notice '(لا مسؤول منصّة — تُخطّى)'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select public.import_reference_activities('[{"code":"9941","name_ar":"أ"}]'::jsonb) into v_a;
  select public.import_reference_activities('[{"code":"9942","name_ar":"ب"}]'::jsonb) into v_b;
  raise notice '✅ نداءان في معاملة واحدة — % ثم %', v_a->>'inserted', v_b->>'inserted';

  select public.import_reference_activities('[{"code":"9941","name_ar":"أ محدَّث"}]'::jsonb) into v_a;
  if (v_a->>'updated')::int <> 1 then raise exception 'التحديث لم يُحسب: %', v_a; end if;
  raise notice '✅ وإعادة الاستيراد تُحدِّث ولا تُدرج';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
