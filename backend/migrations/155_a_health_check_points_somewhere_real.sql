-- A health check points somewhere real
-- ============================================================================
--
-- `admin_model_health` returned a `target` for every check, and four of the six
-- pointed at routes that do not exist: /admin/data, /admin/system,
-- /admin/accounts, and a filter the companies screen does not implement.
--
-- A number that is clickable to a 404 is worse than one that is not clickable:
-- it teaches whoever pressed it that the screen is broken rather than finished.

create or replace function public.admin_model_health()
returns table (key text, label text, n bigint, status text, detail text, target text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('audit.view')
                  or public.has_permission('platform.admin'), false) then
    raise exception 'صحّة النموذج لإدارة مرصد';
  end if;

  return query

  -- Scoped to `community`: a Ministry import is `active` and has no documents
  -- by design — it is the register, not an application. Without the scope this
  -- lights up red across the whole register, which is how a health monitor
  -- teaches people to ignore it.
  select 'active_without_documents'::text,
         'شركة معتمدة بلا مستند مُدقَّق'::text,
         count(*)::bigint,
         case when count(*) = 0 then 'healthy' else 'critical' end::text,
         case when count(*) > 0 then 'شركات مجتمعية نشطة ولم يُدقَّق لها مستند' end::text,
         '/admin/companies'::text
    from public.companies c
   where c.status = 'active' and c.source = 'community'
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
$fn$;
