-- Migration: 177_free_text_needs_a_ceiling.sql
--
-- سبعة وخمسون عموداً نصّياً بلا أي حدّ طول.
--
-- الواجهة تحدّ ما تحدّه، لكن حدّ الواجهة اقتراحٌ لمن يفتح الشاشة. وطلبٌ يُصاغ
-- بيد ضد PostgREST يكتب ما يشاء: ميغابايتات في reports.description، أو
-- disputes.reason، أو support_tickets.details. لا يحتاج ذلك ثغرةً — يحتاج
-- جلسةً صالحة وحلقةً.
--
-- والأثر ليس التخزين وحده: صفٌّ بحجم ميغابايت يمرّ في كل استعلام يقرأه، وفي
-- كل رد JSON، وفي كل شاشة تعرضه.
--
-- ============================================================================
-- الحدود مُسمّاة لا مُعمّمة
-- ============================================================================
-- «قاعدة عامة واحدة على كل الحقول» كانت ستضع 500 حرف على وصف تقرير و500 على
-- اسم مدينة. وأسوأ: قاعدةٌ تقول «كل ما فيه name حدّه 200» تضع 200 على
-- previous_names — وهو قائمة أسماء سابقة لا اسماً واحداً، فتنكسر عند خامس اسم.
--
-- فالحدود هنا مكتوبة عموداً عموداً في جدول أدناه، ومَن ليس فيه يأخذ حدّاً
-- افتراضياً حسب وظيفته. كلّ حدّ قُوبل بأطول قيمة قائمة فعلاً قبل كتابته.
--
-- ============================================================================
-- ما كشفه القياس قبل الكتابة
-- ============================================================================
-- أعمدة اسمها \u200E_url\u200E تحمل ملفات لا روابط: كل قيمة غير فارغة في
-- companies.cr_file_url و registration_requests.cr_document_url هي
-- \u200Edata:image/png;base64,…\u200E بطول 1,509,746 حرفاً. وهذا مقصود:
-- CompanyOnboarding.jsx يسقط إلى base64 حين يفشل الرفع إلى الدلو،
-- و src/lib/api.ts يسمح صراحةً بـ 21 م.ب.
--
-- فحدُّ 2048 على تلك الأعمدة كان سيكسر مساراً يعمل. حدُّها هنا = 21 م.ب
-- بالضبط، أي أن القاعدة تسند ما تعلنه الشيفرة بدل أن تناقضه.
--
-- ============================================================================
-- NOT VALID، عمداً
-- ============================================================================
-- لا صفّ قائم يتجاوز أيّ حدّ هنا — فُحص العمود عموداً. لكن قاعدةً تُبنى من هذه
-- المهاجرات قد تُملأ باستيراد، وقيدٌ يفشل عند التركيب يوقف النشر كلّه. القيود
-- تحرس كل كتابة جديدة، والتحقّق من القديم أمرٌ واحد متى أُريد.
--
-- ولا تُقيَّد المحارف: نصّ عربي حرّ فيه أقواس وشرطات ونقاط، وقيدٌ على شكله
-- يرفض اسماً صحيحاً. الحماية من الحقن بالاستعلامات المُعامَلة وبالتهريب عند
-- العرض — لا بمنع محرف عند التخزين.

do $mig$
declare
  r record;
  v_limit int;
  v_name  text;
  -- الحدود المُسمّاة: جدول ما لا يصحّ تخمينه.
  named constant text[][] := array[
    -- عمود يحمل ملفاً لا رابطاً — الحدّ من src/lib/api.ts سطر 574.
    ['companies',             'cr_file_url',           '22020096'],
    ['tenants',               'cr_file_url',           '22020096'],
    -- قوائم لا مفردات: أسماء سابقة وأنشطة وكلمات مفتاحية.
    ['companies',             'previous_names',        '2000'],
    ['companies',             'sub_activities',        '2000'],
    ['companies',             'keywords',              '2000'],
    ['companies',             'company_traits',        '2000'],
    -- مفردات تصنيف قصيرة.
    ['companies',             'cr_type',               '100'],
    ['companies',             'cr_version',            '100'],
    ['companies',             'company_type',          '100'],
    ['companies',             'official_status_source','200'],
    ['company_requests',      'kind',                  '100'],
    ['company_requests',      'status',                '100'],
    ['support_tickets',       'kind',                  '100'],
    ['support_tickets',       'status',                '100'],
    -- ترويسة المتصفح تطول أحياناً بلا أن تكون إساءة.
    ['support_tickets',       'user_agent',            '1000'],
    -- بيانات تواصل.
    ['partner_applications',  'contact_email',         '255'],
    ['partner_applications',  'contact_phone',         '40'],
    -- معرّف Clerk نصّي.
    ['claim_requests',        'user_id',               '255']
  ];
  i int;
  hit boolean;
begin
  for r in
    select c.table_name t, c.column_name col
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.data_type in ('text', 'character varying')
       and c.character_maximum_length is null
       and c.table_name in (
         'companies', 'reports', 'disputes', 'company_requests', 'tenants',
         'claim_requests', 'support_tickets', 'partner_applications',
         'clarification_requests', 'company_data_requests')
       and c.column_name <> 'id'
     order by 1, 2
  loop
    v_limit := null;
    hit := false;
    for i in 1 .. array_length(named, 1) loop
      if named[i][1] = r.t and named[i][2] = r.col then
        v_limit := named[i][3]::int;
        hit := true;
        exit;
      end if;
    end loop;

    if not hit then
      -- الافتراضي حسب وظيفة الحقل، لا حدّ واحد للجميع.
      v_limit := case
        when r.col ~ 'url|link'                                 then 2048
        when r.col ~ 'description|details|resolution$|body'      then 5000
        when r.col ~ 'reason|note|notes|comment'                 then 1000
        when r.col ~ '_by$|_by_user_id$|assigned_to'             then 255
        when r.col ~ 'name|city|region|district|street|address'  then 200
        else 500
      end;
    end if;

    v_name := format('%s_%s_maxlen', r.t, r.col);
    execute format('alter table public.%I drop constraint if exists %I', r.t, v_name);
    execute format(
      'alter table public.%I add constraint %I check (%I is null or char_length(%I) <= %s) not valid',
      r.t, v_name, r.col, r.col, v_limit);
  end loop;
end $mig$;

-- ============================================================================
-- الروابط: بروتوكول لا يُنفَّذ
-- ============================================================================
-- javascript: و vbscript: و file: مخزَّنةً في عمود يُعرض كرابط هي الطريق
-- الأقصر إلى XSS مخزَّن. ولا استعمال مشروع لأيّها هنا — ولا قيمة قائمة تحمل
-- أيّاً منها (فُحص).
--
-- أما data: فمستعملة فعلاً ولا تُمنع. لكن ليست كلّ data: سواء:
-- data:text/html و data:image/svg+xml تُنفّذان سكربتاً عند فتحهما، بينما
-- data:image/png لا. فالمسموح هنا هو نفس ما يسمح به DocumentViewer
-- (SAFE_DATA) — صور نقطية و PDF. القاعدة تسند الواجهة بدل أن تكرّر ثغرتها.
do $urls$
declare
  r record;
  v_name text;   -- الحدّ الأعلى للطول وُضع أعلاه؛ هنا الشكل فقط.
begin
  for r in
    select c.table_name t, c.column_name col
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.data_type in ('text', 'character varying')
       and c.column_name ~ '(url|website)$'
       and c.table_name in ('companies', 'tenants', 'disputes', 'support_tickets',
                            'company_documents', 'registration_requests', 'export_jobs')
     order by 1, 2
  loop
    v_name := format('%s_%s_scheme', r.t, r.col);
    execute format('alter table public.%I drop constraint if exists %I', r.t, v_name);
    execute format(
      'alter table public.%I add constraint %I check ('
      || '%I is null'
      || ' or (%I !~* ''^[[:space:]]*(javascript|vbscript|file)[[:space:]]*:'''
      || '     and (%I !~* ''^[[:space:]]*data:'''
      || '          or %I ~* ''^data:(image/(png|jpe?g|gif|webp|bmp)|application/pdf)[;,]''))'
      || ') not valid',
      r.t, v_name, r.col, r.col, r.col, r.col);
  end loop;
end $urls$;

-- الأعمدة التي تحمل ملفاً مضمَّناً تحتاج سقفاً أيضاً، وهي خارج الجداول أعلاه.
alter table public.company_documents drop constraint if exists company_documents_file_url_maxlen;
alter table public.company_documents
  add constraint company_documents_file_url_maxlen
  check (file_url is null or char_length(file_url) <= 22020096) not valid;

alter table public.registration_requests drop constraint if exists registration_requests_cr_document_url_maxlen;
alter table public.registration_requests
  add constraint registration_requests_cr_document_url_maxlen
  check (cr_document_url is null or char_length(cr_document_url) <= 22020096) not valid;

-- ============================================================================
-- بريد الشركة الرسمي
-- ============================================================================
-- tenants.email و users.email محروسان منذ migration 173، و companies.official_email
-- بلا قيد — وهو الوحيد بينها الذي يُعرض في تقرير ثقة علني.
alter table public.companies drop constraint if exists companies_official_email_format;
alter table public.companies
  add constraint companies_official_email_format
  check (official_email is null or official_email = ''
         or official_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$') not valid;

-- ============================================================================
-- تحقّق
-- ============================================================================
do $blk$
declare
  v_co  uuid;
  v_n   int;
begin
  select count(*) into v_n from pg_constraint
   where contype = 'c' and connamespace = 'public'::regnamespace and conname ~ '_maxlen$';
  raise notice '✅ % قيد طول', v_n;

  select count(*) into v_n from pg_constraint
   where contype = 'c' and connamespace = 'public'::regnamespace and conname ~ '_scheme$';
  raise notice '✅ % قيد بروتوكول', v_n;

  select id into v_co from public.companies limit 1;
  if v_co is null then raise notice '(لا شركات — تُخطّى اختبارات القيم)'; return; end if;

  -- طول: review_reason حدّه 1000.
  begin
    update public.companies set review_reason = repeat('أ', 1001) where id = v_co;
    raise exception 'قُبل نصّ يتجاوز حدّ الطول';
  exception when check_violation then
    raise notice '✅ رُفض نصّ يتجاوز 1000 حرف';
  end;

  -- بريد.
  begin
    update public.companies set official_email = 'not-an-email' where id = v_co;
    raise exception 'قُبل بريد غير صالح';
  exception when check_violation then
    raise notice '✅ رُفض بريد رسمي غير صالح';
  end;

  -- بروتوكول يُنفَّذ.
  begin
    update public.companies set website = 'javascript:alert(1)' where id = v_co;
    raise exception 'قُبل javascript:';
  exception when check_violation then
    raise notice '✅ رُفض javascript: في حقل رابط';
  end;

  begin
    update public.companies set website = 'data:text/html,<script>alert(1)</script>' where id = v_co;
    raise exception 'قُبل data:text/html';
  exception when check_violation then
    raise notice '✅ رُفض data:text/html — وهو ما يُنفَّذ عند الفتح';
  end;

  begin
    update public.companies set website = 'data:image/svg+xml,<svg onload=alert(1)>' where id = v_co;
    raise exception 'قُبل data:image/svg+xml';
  exception when check_violation then
    raise notice '✅ رُفض data:image/svg+xml';
  end;

  -- وما يجب أن يمرّ، يمرّ: المسار الحيّ لم يُكسر.
  update public.companies
     set cr_file_url = 'data:image/png;base64,iVBORw0KGgo=' where id = v_co;
  raise notice '✅ قُبل data:image/png — مسار الاحتياط ما زال يعمل';

  update public.companies
     set official_email = 'info@example.com',
         website = 'https://example.com',
         review_reason = 'سبب مراجعة عادي'
   where id = v_co;
  raise notice '✅ قُبلت القيم الصحيحة';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
