-- Migration: 178_three_address_columns_that_accept_anything.sql
--
-- ثلاثة أعمدة تحمل عناوين بريد ولا تفحص شكلها.
--
--   pending_invites.email            دعوةٌ تمنح صلاحية داخل مستأجر
--   partner_applications.contact_email
--   export_jobs.send_to_email        وجهةُ إرسال تقرير مُصدَّر
--
-- بينما users.email و tenants.email محروسان منذ migration 173، و
-- companies.official_email منذ 177. الأعمدة الثلاثة بقيت خارج ذلك بلا سبب،
-- وأثقلها pending_invites: الدعوة منحُ صلاحية، وقيمةٌ ليست بريداً فيها تعني
-- دعوةً معلّقة لا تصل ولا تُقبل ولا يعرف أحد لماذا.
--
-- والنمط نفسه المستعمل في 173 و177 — لا نمط ثالث يفترق عنهما عند أول تعديل:
--   محرف واحد فأكثر بلا مسافة ولا @  ثم  @  ثم  مضيف فيه نقطة وامتداد حرفي
--
-- وهو تحقّق بنيوي لا قاطع. القاطع أن يصل البريد، ولا تعرفه قاعدة بيانات.
--
-- NOT VALID: الصفوف القائمة فُحصت وكلّها صالحة (أو فارغة)، لكن القيد يُضاف
-- كما تُضاف نظائره — يحرس الجديد، والتحقّق من القديم أمرٌ واحد متى أُريد.

do $mig$
declare
  r record;
  v_name text;
  v_bad  int;
begin
  for r in
    select * from (values
      ('pending_invites',      'email'),
      ('partner_applications', 'contact_email'),
      ('export_jobs',          'send_to_email')
    ) as t(tbl, col)
  loop
    -- لا يُضاف قيدٌ يجعل صفّاً قائماً غير قابل للتعديل بصمت.
    execute format(
      'select count(*) from public.%I where %I is not null and %I <> ''''
         and %I !~ ''^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$''',
      r.tbl, r.col, r.col, r.col) into v_bad;
    if v_bad > 0 then
      raise notice '⚠ %.%: % صفّاً قائماً لا يطابق — القيد يحرس الجديد فقط',
        r.tbl, r.col, v_bad;
    end if;

    v_name := format('%s_%s_format', r.tbl, r.col);
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, v_name);
    execute format(
      'alter table public.%I add constraint %I check ('
      || '%I is null or %I = '''' or %I ~ ''^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$'''
      || ') not valid',
      r.tbl, v_name, r.col, r.col, r.col);
  end loop;
end $mig$;

-- تحقّق: القيد يرفض ما ليس بريداً، ويقبل ما هو بريد.
do $blk$
declare
  v_t uuid;
  v_n int;
begin
  select count(*) into v_n from pg_constraint
   where contype = 'c' and connamespace = 'public'::regnamespace
     and conname in ('pending_invites_email_format',
                     'partner_applications_contact_email_format',
                     'export_jobs_send_to_email_format');
  if v_n <> 3 then raise exception 'رُكّب % من 3 قيود', v_n; end if;
  raise notice '✅ 3 قيود صيغة بريد';

  select id into v_t from public.tenants limit 1;
  if v_t is null then raise notice '(لا مستأجرين — تُخطّى اختبارات القيم)'; return; end if;

  begin
    insert into public.pending_invites (tenant_id, email, role, invited_by)
    values (v_t, 'not-an-email', 'company_member', 'test');
    raise exception 'قُبل بريد دعوة غير صالح';
  exception when check_violation then
    raise notice '✅ رُفضت دعوة ببريد غير صالح';
  end;

  insert into public.pending_invites (tenant_id, email, role, invited_by)
  values (v_t, 'someone@example.com', 'company_member', 'test');
  raise notice '✅ قُبلت دعوة ببريد صالح';

  raise exception 'تراجع مقصود بعد التحقّق';
exception when others then
  if sqlerrm <> 'تراجع مقصود بعد التحقّق' then raise; end if;
  raise notice '↩ تراجعت بيانات الاختبار';
end $blk$;
