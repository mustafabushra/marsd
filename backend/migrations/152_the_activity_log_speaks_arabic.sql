-- The activity log speaks Arabic
-- ============================================================================
--
-- The Command Center printed `registration_cleanup_ran` and
-- `registry_import_cancelled` at a person, in an Arabic screen. The same fault
-- the request timeline had, in a second place — which is the argument for the
-- vocabulary living in the database rather than in whichever component happens
-- to render it.
--
-- Nothing here touches a table. It is one immutable function and one `create or
-- replace` on a stable reader, so it is safe to apply while the registry COPY
-- is streaming: no locks are taken on anything the import is writing.

create or replace function public.activity_action_types()
returns table (action text, ar text, en text, area text)
language sql
immutable
as $fn$
  select * from (values
    -- Companies
    ('company_approved',              'اعتماد شركة',                'Company approved',        'companies'),
    ('company_suspended',             'تعليق شركة',                 'Company suspended',       'companies'),
    ('company_reactivated',           'رفع تعليق شركة',             'Company reactivated',     'companies'),
    ('company_add_requested',         'طلب إضافة شركة',             'Company add requested',   'companies'),
    ('company_added_from_registry',   'إضافة شركة من السجل التجاري','Added from registry',     'companies'),
    ('company_verification_withdrawn','سحب توثيق شركة',             'Verification withdrawn',  'companies'),
    ('company_report_viewed',         'فتح تقرير شركة',             'Trust report viewed',     'companies'),

    -- Requests
    ('company_request_approved',      'اعتماد تسجيل شركة',          'Registration approved',   'work'),
    ('company_request_rejected',      'رفض تسجيل شركة',             'Registration rejected',   'work'),
    ('document_verified',             'تدقيق مستند',                'Document verified',       'work'),

    -- Reports
    ('report_submitted',              'تقديم تقرير',                'Report submitted',        'reports'),
    ('report_approved',               'اعتماد تقرير',               'Report approved',         'reports'),

    -- Registry and imports
    ('registry_import_started',       'بدء استيراد السجل التجاري',  'Import started',          'data'),
    ('registry_import_published',     'نشر مجموعة السجل التجاري',   'Dataset published',       'data'),
    ('registry_dataset_published',    'نشر مجموعة السجل التجاري',   'Dataset published',       'data'),
    ('registry_dataset_rolled_back',  'التراجع عن مجموعة سجلّ',     'Dataset rolled back',     'data'),
    ('registry_import_failed',        'فشل استيراد السجل التجاري',  'Import failed',           'data'),
    ('registry_import_cancelled',     'إلغاء استيراد السجل التجاري','Import cancelled',        'data'),

    -- Housekeeping
    ('registration_cleanup_ran',      'تشغيل الكنس الليلي',         'Nightly cleanup ran',     'system'),
    ('registration_number_reclaimed', 'استرداد رقم سجل',            'CR number reclaimed',     'system'),

    -- Accounts, billing, platform
    ('user_invited',                  'دعوة مستخدم',                'User invited',            'accounts'),
    ('platform_role_granted',         'منح صلاحية منصة',            'Platform role granted',   'accounts'),
    ('platform_role_revoked',         'سحب صلاحية منصة',            'Platform role revoked',   'accounts'),
    ('subscription_changed',          'تغيير اشتراك',               'Subscription changed',    'billing'),
    ('added_to_watchlist',            'إضافة لقائمة المراقبة',      'Added to watchlist',      'companies'),
    ('removed_from_watchlist',        'إزالة من قائمة المراقبة',    'Removed from watchlist',  'companies'),
    ('company_add_suspended_on',      'إيقاف إضافة الشركات',        'Company adding suspended','platform'),
    ('company_add_suspended_off',     'رفع إيقاف إضافة الشركات',    'Company adding resumed',  'platform'),
    ('data_exported',                 'تصدير بيانات',               'Data exported',           'platform')
  ) as t(action, ar, en, area);
$fn$;

grant execute on function public.activity_action_types() to authenticated;

/**
 * Who did what, in words.
 *
 * The raw key is still returned. A screen shows the Arabic; an investigation
 * needs the exact string that was written, and losing it to make the display
 * nicer would make the audit log worse at the one job it has.
 */
-- The return type gains two columns, and Postgres will not replace a
-- signature in place. Dropped and recreated inside the same transaction, so
-- there is no moment where the screen has no function to call.
drop function if exists public.admin_activity_feed(int);

create function public.admin_activity_feed(p_limit int default 25)
returns table (
  at         timestamptz,
  actor      text,
  actor_role text,
  action     text,
  label      text,
  area       text,
  entity     text,
  entity_id  text,
  meta       jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.has_permission('audit.view'), false) then
    raise exception 'سجلّ النشاط يحتاج صلاحية';
  end if;

  return query
  select l.created_at,
         coalesce(u.email::text, case when l.actor_id is null then 'النظام' end),
         coalesce(l.actor_role::text, u.role::text),
         l.action::text,
         coalesce(t.ar, l.action::text),
         coalesce(t.area, 'other'),
         l.entity::text, l.entity_id, l.meta
    from public.audit_logs l
    left join public.users u on u.id = l.actor_id
    left join public.activity_action_types() t on t.action = l.action::text
   order by l.created_at desc
   limit least(greatest(coalesce(p_limit, 25), 1), 200);
end;
$fn$;

-- ============================================================================
-- No action without a word for it
-- ============================================================================
-- The dictionary and the data have to agree, and the only way to know they do
-- is to check. If anything already written has no entry, this migration does
-- not apply — because the alternative is discovering it on screen, in front of
-- somebody, in English.

do $$
declare
  v_missing text;
begin
  select string_agg(distinct l.action::text, '، ') into v_missing
    from public.audit_logs l
   where not exists (select 1 from public.activity_action_types() t
                      where t.action = l.action::text);

  if v_missing is not null then
    raise exception 'أفعال بلا ترجمة في القاموس: %', v_missing;
  end if;
end;
$$;
