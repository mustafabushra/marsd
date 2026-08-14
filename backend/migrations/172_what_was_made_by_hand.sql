-- Migration: 172_what_was_made_by_hand.sql
--
-- كائنات موجودة في قاعدة الإنتاج ولا تذكرها أي مهاجرة.
--
-- مشروعٌ يُنقل إلى حساب شركة تُعاد قاعدته من ملفات المهاجرات وحدها. فكل كائن
-- أُنشئ يدوياً — في لوحة Supabase أو باستعلام عابر — يغيب عن البيئة الجديدة،
-- ولا يشتكي أحد حتى تُفتح الشاشة التي تحتاجه: فهرس مفقود يعني بحثاً بطيئاً
-- لا خطأً، ومشغّل مفقود يعني سجلّ تدقيق ينقص صفوفاً بصمت.
--
-- استُخرجت تعريفاتها من القاعدة الحيّة لا من الذاكرة، وكُتبت هنا بصيغة
-- تتحمّل التكرار: create or replace للدوال، و if not exists للفهارس
-- والامتدادات، و drop if exists قبل المشغّلات لأن Postgres لا يعرف
-- create or replace trigger قبل الإصدار الرابع عشر.
--
-- لا تُنشئ هذه المهاجرة شيئاً جديداً على الإنتاج — كلّه موجود. وظيفتها أن
-- تجعل قاعدةً فارغة تصل إلى الحالة نفسها.


-- ============================ الامتدادات ============================
create extension if not exists "pg_stat_statements";
create extension if not exists "supabase_vault";

-- ============================== الدوال ==============================

-- approve_report_and_award_credits
CREATE OR REPLACE FUNCTION public.approve_report_and_award_credits(p_report_id uuid, p_reviewer_id uuid, p_credit_amount integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_reporter_tenant_id UUID;
  v_target_company_id UUID;
  v_approved_count INTEGER;
  v_result JSONB;
BEGIN
  -- Get report details
  SELECT reporter_tenant_id, target_company_id
  INTO v_reporter_tenant_id, v_target_company_id
  FROM public.reports
  WHERE id = p_report_id;
  
  IF v_reporter_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  
  -- Update report status
  UPDATE public.reports
  SET status = 'approved', approved_at = now()
  WHERE id = p_report_id;
  
  -- Award credits
  INSERT INTO public.credits_ledger (tenant_id, report_id, amount, reason)
  VALUES (v_reporter_tenant_id, p_report_id, p_credit_amount, 'report_approved');
  
  -- Count approved reports for company
  SELECT COUNT(*)
  INTO v_approved_count
  FROM public.reports
  WHERE target_company_id = v_target_company_id
  AND status = 'approved';
  
  -- Update or create trust score
  INSERT INTO public.trust_scores (company_id, approved_reports, computed_at)
  VALUES (v_target_company_id, v_approved_count, now())
  ON CONFLICT (company_id) DO UPDATE SET
    approved_reports = v_approved_count,
    computed_at = now();
  
  -- Create notification for reporter
  INSERT INTO public.notifications (user_id, type, payload)
  SELECT id, 'report_approved', jsonb_build_object(
    'report_id', p_report_id,
    'company_name', c.name,
    'message', 'تم اعتماد تقريرك وحصلت على ' || p_credit_amount || ' نقطة'
  )
  FROM public.users u
  CROSS JOIN public.companies c
  WHERE u.tenant_id = v_reporter_tenant_id
  AND c.id = v_target_company_id
  LIMIT 1;
  
  v_result := jsonb_build_object(
    'success', true,
    'credits_awarded', p_credit_amount,
    'message', 'Report approved and credits awarded'
  );
  
  RETURN v_result;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$
;

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'company_member',
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

-- log_report_change
CREATE OR REPLACE FUNCTION public.log_report_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO report_audit_log (
    report_id, action, old_values, new_values, created_at
  ) VALUES (
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'submitted'
      WHEN NEW.status != OLD.status THEN 'status_changed'
      ELSE 'updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    row_to_json(NEW),
    CURRENT_TIMESTAMP
  );
  RETURN NEW;
END;
$function$
;

-- rls_auto_enable
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- update_companies_search_vector
CREATE OR REPLACE FUNCTION public.update_companies_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_vector := 
    to_tsvector('simple', COALESCE(NEW.name, '')) ||
    to_tsvector('simple', COALESCE(NEW.commercial_name, '')) ||
    to_tsvector('simple', COALESCE(NEW.cr_number, '')) ||
    to_tsvector('simple', COALESCE(NEW.sector, '')) ||
    to_tsvector('simple', COALESCE(NEW.city, '')) ||
    to_tsvector('simple', COALESCE(NEW.keywords, '')) ||
    to_tsvector('simple', COALESCE(NEW.previous_names, ''));
  RETURN NEW;
END;
$function$
;

-- ============================= المشغّلات =============================

drop trigger if exists company_audit_trigger on public.companies;
CREATE TRIGGER company_audit_trigger AFTER INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION log_company_change();

drop trigger if exists on_report_approved_trigger on public.reports;
CREATE TRIGGER on_report_approved_trigger AFTER UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION on_report_approved();

drop trigger if exists report_audit_trigger on public.reports;
CREATE TRIGGER report_audit_trigger AFTER INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION log_report_change();

-- ============================== الفهارس ==============================
create index if not exists idx_claim_requests_company ON public.claim_requests USING btree (company_id);
create index if not exists idx_claim_requests_status ON public.claim_requests USING btree (status);
create index if not exists idx_claim_requests_user ON public.claim_requests USING btree (user_id);
create index if not exists idx_companies_city ON public.companies USING btree (city);
create index if not exists idx_companies_cr_trgm ON public.companies USING gin (cr_number gin_trgm_ops);
create index if not exists idx_companies_name_trgm ON public.companies USING gin (name gin_trgm_ops);
create index if not exists idx_companies_search_vector ON public.companies USING gin (search_vector);
create index if not exists idx_companies_sector ON public.companies USING btree (sector);
create index if not exists idx_companies_status ON public.companies USING btree (status);
create index if not exists idx_company_audit_action ON public.company_audit_log USING btree (action);
create index if not exists idx_company_audit_company_id ON public.company_audit_log USING btree (company_id);
create index if not exists idx_company_audit_created_at ON public.company_audit_log USING btree (created_at DESC);
create index if not exists idx_credits_ledger_created_at ON public.credits_ledger USING btree (created_at);
create index if not exists idx_notifications_tenant ON public.notifications USING btree (tenant_id);
create index if not exists idx_notifications_tenant_id ON public.notifications USING btree (tenant_id);
create index if not exists idx_registration_requests_company ON public.registration_requests USING btree (company_id);
create index if not exists idx_registration_requests_status ON public.registration_requests USING btree (status);
create index if not exists idx_registration_requests_user ON public.registration_requests USING btree (user_id);
create index if not exists idx_report_audit_action ON public.report_audit_log USING btree (action);
create index if not exists idx_report_audit_created_at ON public.report_audit_log USING btree (created_at DESC);
create index if not exists idx_report_audit_report_id ON public.report_audit_log USING btree (report_id);
create index if not exists idx_system_settings_key ON public.system_settings USING btree (key);
create index if not exists idx_tenants_company_id ON public.tenants USING btree (company_id);
create index if not exists idx_users_clerk_id ON public.users USING btree (id);
create index if not exists idx_users_company ON public.users USING btree (company_id);
create index if not exists idx_users_company_id ON public.users USING btree (company_id);
create index if not exists idx_watchlist_tenant ON public.watchlist_items USING btree (tenant_id);

-- تحقّق: كل ما ذُكر أعلاه موجود فعلاً بعد التشغيل.
do $blk$
declare v_missing text[] := '{}';
begin
  if to_regprocedure('public.approve_report_and_award_credits') is null and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_report_and_award_credits') then v_missing := v_missing || 'approve_report_and_award_credits'; end if;
  if to_regprocedure('public.handle_new_user') is null and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user') then v_missing := v_missing || 'handle_new_user'; end if;
  if to_regprocedure('public.log_report_change') is null and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='log_report_change') then v_missing := v_missing || 'log_report_change'; end if;
  if to_regprocedure('public.rls_auto_enable') is null and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable') then v_missing := v_missing || 'rls_auto_enable'; end if;
  if to_regprocedure('public.update_companies_search_vector') is null and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_companies_search_vector') then v_missing := v_missing || 'update_companies_search_vector'; end if;
  if to_regclass('public.idx_claim_requests_company') is null then v_missing := v_missing || 'idx_claim_requests_company'; end if;
  if to_regclass('public.idx_claim_requests_status') is null then v_missing := v_missing || 'idx_claim_requests_status'; end if;
  if to_regclass('public.idx_claim_requests_user') is null then v_missing := v_missing || 'idx_claim_requests_user'; end if;
  if to_regclass('public.idx_companies_city') is null then v_missing := v_missing || 'idx_companies_city'; end if;
  if to_regclass('public.idx_companies_cr_trgm') is null then v_missing := v_missing || 'idx_companies_cr_trgm'; end if;
  if to_regclass('public.idx_companies_name_trgm') is null then v_missing := v_missing || 'idx_companies_name_trgm'; end if;
  if to_regclass('public.idx_companies_search_vector') is null then v_missing := v_missing || 'idx_companies_search_vector'; end if;
  if to_regclass('public.idx_companies_sector') is null then v_missing := v_missing || 'idx_companies_sector'; end if;
  if to_regclass('public.idx_companies_status') is null then v_missing := v_missing || 'idx_companies_status'; end if;
  if to_regclass('public.idx_company_audit_action') is null then v_missing := v_missing || 'idx_company_audit_action'; end if;
  if to_regclass('public.idx_company_audit_company_id') is null then v_missing := v_missing || 'idx_company_audit_company_id'; end if;
  if to_regclass('public.idx_company_audit_created_at') is null then v_missing := v_missing || 'idx_company_audit_created_at'; end if;
  if to_regclass('public.idx_credits_ledger_created_at') is null then v_missing := v_missing || 'idx_credits_ledger_created_at'; end if;
  if to_regclass('public.idx_notifications_tenant') is null then v_missing := v_missing || 'idx_notifications_tenant'; end if;
  if to_regclass('public.idx_notifications_tenant_id') is null then v_missing := v_missing || 'idx_notifications_tenant_id'; end if;
  if to_regclass('public.idx_registration_requests_company') is null then v_missing := v_missing || 'idx_registration_requests_company'; end if;
  if to_regclass('public.idx_registration_requests_status') is null then v_missing := v_missing || 'idx_registration_requests_status'; end if;
  if to_regclass('public.idx_registration_requests_user') is null then v_missing := v_missing || 'idx_registration_requests_user'; end if;
  if to_regclass('public.idx_report_audit_action') is null then v_missing := v_missing || 'idx_report_audit_action'; end if;
  if to_regclass('public.idx_report_audit_created_at') is null then v_missing := v_missing || 'idx_report_audit_created_at'; end if;
  if to_regclass('public.idx_report_audit_report_id') is null then v_missing := v_missing || 'idx_report_audit_report_id'; end if;
  if to_regclass('public.idx_system_settings_key') is null then v_missing := v_missing || 'idx_system_settings_key'; end if;
  if to_regclass('public.idx_tenants_company_id') is null then v_missing := v_missing || 'idx_tenants_company_id'; end if;
  if to_regclass('public.idx_users_clerk_id') is null then v_missing := v_missing || 'idx_users_clerk_id'; end if;
  if to_regclass('public.idx_users_company') is null then v_missing := v_missing || 'idx_users_company'; end if;
  if to_regclass('public.idx_users_company_id') is null then v_missing := v_missing || 'idx_users_company_id'; end if;
  if to_regclass('public.idx_watchlist_tenant') is null then v_missing := v_missing || 'idx_watchlist_tenant'; end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'كائنات لم تُنشأ: %', array_to_string(v_missing, ', ');
  end if;
  raise notice '✅ الكائنات الـ% كلّها موجودة', 37;
end $blk$;

