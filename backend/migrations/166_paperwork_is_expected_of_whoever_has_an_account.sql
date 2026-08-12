-- Paperwork is expected of whoever has an account
-- ============================================================================
--
-- One WHERE clause in admin_model_health. The other five checks are carried
-- through unchanged, from the live definition rather than retyped — a first
-- attempt at this rewrote the function from memory and silently dropped four
-- of them. Postgres refused it only because the column names were wrong too.

CREATE OR REPLACE FUNCTION public.admin_model_health()
 RETURNS TABLE(key text, label text, n bigint, status text, detail text, target text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not coalesce(public.has_permission('audit.view')
                  or public.has_permission('platform.admin'), false) then
    raise exception 'صحّة النموذج لإدارة مرصد';
  end if;

  return query

  -- Scoped to companies that have an account.
  --
  -- This was scoped to source = 'community', and the reason was sound: a
  -- Ministry import is active and has no documents by design — it is the
  -- register, not an application, and without a scope the monitor lights up red
  -- across the whole register, which is how a health check teaches people to
  -- ignore it.
  --
  -- But that is the wrong axis. What makes documents expected is not where the
  -- record came from, it is whether anybody is answering for the company. An
  -- unclaimed register row has nobody to file anything. The moment somebody
  -- claims it and becomes its admin it has an owner and an obligation — and
  -- scoped by source it stayed invisible, which is the one case where silence
  -- is wrong.
  select 'active_without_documents'::text,
         'شركة لها حساب وبلا مستند مُدقَّق'::text,
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end::text,
         case when count(*) > 0 then 'شركات لها مسؤول ولم يُدقَّق لها مستند' end::text,
         '/admin/companies'::text
    from public.companies c
   where c.status = 'active'
     and exists (select 1 from public.tenants t where t.company_id = c.id)
     and not exists (select 1 from public.company_documents d
                      where d.company_id = c.id and d.status = 'verified'
                        and d.superseded_at is null)

  union all
  select 'double_written_requests', 'طلب مكتوب في الجدولين', count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         case when count(*) > 0 then 'تسجيل له صفّان مستقلّان' end,
         '/admin/work'
    from public.registration_requests rr
   where rr.status = 'pending'
     and not exists (select 1 from public.company_requests cr
                      where cr.company_id = rr.company_id and cr.kind = 'registration')

  union all
  select 'account_without_company', 'حساب بلا شركة', count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'warning' end,
         case when count(*) > 0 then 'حسابات لا ترتبط بشركة' end,
         '/admin/tenants'
    from public.tenants t
   where t.company_id is null and t.status = 'active'

  union all
  select 'stale_open_requests', 'طلب مفتوح أكثر من ١٤ يوماً', count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'warning' end,
         case when count(*) > 0 then 'طلبات تجاوزت أسبوعين دون قرار' end,
         '/admin/work?scope=late'
    from public.company_requests r
   where r.status in ('submitted', 'under_review', 'resubmitted')
     and r.submitted_at < now() - interval '14 days'

  union all
  select 'partial_published_dataset', 'مجموعة سجلّ منشورة ناقصة', count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         (select string_agg(format('%s: %s من %s', j.snapshot_period,
                                   j.rows_loaded, j.expected_rows), ' · ')
            from public.import_jobs j
           where j.dataset_id = public.published_registry_dataset()
             and j.rows_loaded < j.expected_rows),
         '/admin/registry-import'
    from public.import_jobs j
   where j.dataset_id = public.published_registry_dataset()
     and coalesce(j.expected_rows, 0) > 0 and j.rows_loaded < j.expected_rows

  union all
  select 'status_disagreement', 'تعارض بين الحالة والأعمدة المشتقّة', count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end,
         case when count(*) > 0 then 'approved لا يطابق status' end,
         '/admin/system-health'
    from public.companies c
   where c.approved is distinct from (c.status = 'active');
end;
$function$
;
