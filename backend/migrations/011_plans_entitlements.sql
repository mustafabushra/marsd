-- Migration: 011_plans_entitlements.sql
-- Purpose: make plans the single source of truth for what a tenant may do.
--
-- The tables for this already existed and were never populated: plans.limits
-- (jsonb) and plans.features (text[]) were designed exactly for entitlements,
-- but nothing wrote to them and nothing read them, so /admin/plans showed three
-- hard-coded rows that vanished on reload and no limit was ever enforced.
--
-- After this migration the four plans exist as data. Only Free is active;
-- Basic, Pro and Enterprise are seeded complete and switched off, so turning one
-- on later is a boolean in the admin panel, not a code change.
--
-- Idempotent: safe to run more than once.

-- ============================================================================
-- 1) Columns plans needs to be addressable and manageable
-- ============================================================================

-- A stable key. Code must never reference a plan by generated uuid or by its
-- Arabic display name, both of which are free to change from the admin panel.
alter table public.plans add column if not exists code varchar(50);
alter table public.plans add column if not exists description text;
alter table public.plans add column if not exists sort_order integer default 0;

-- Which plans earn entitlements by contributing data. This is per plan, and
-- deliberately not hard-coded to "free": the rates live in system_settings, the
-- eligibility lives here, and both are editable without a deploy.
alter table public.plans add column if not exists give_to_get_enabled boolean default false;

-- Marks the plan handed to a tenant that has never subscribed.
alter table public.plans add column if not exists is_default boolean default false;

update public.plans set code = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
where code is null;

create unique index if not exists idx_plans_code on public.plans(code);
create unique index if not exists idx_plans_single_default on public.plans(is_default) where is_default;

-- ============================================================================
-- 2) The four plans
-- ============================================================================
-- limits: -1 means unlimited. Keys are read by useEntitlements(); adding a key
-- here without the matching check in the app changes nothing, and removing one
-- makes that limit unlimited rather than zero — absent must never mean denied.

insert into public.plans (code, name, description, price_monthly, limits, features, active, is_default, give_to_get_enabled, sort_order)
values
  (
    'free',
    'المجانية',
    'ابدأ بلا تكلفة، ووسّع حدودك بالمساهمة ببيانات موثقة',
    0,
    '{"searches_per_month": 10, "reports_per_month": 5, "companies_per_month": 5, "users": 2, "watchlist_items": 10, "compare_items": 2}'::jsonb,
    array[]::text[],
    true,   -- the only plan open for now
    true,   -- and the one every new tenant lands on
    true,   -- the only plan that earns by contributing
    1
  ),
  (
    'basic',
    'الأساسية',
    'للفرق الصغيرة التي تحتاج بحثاً أوسع وتقارير أكثر',
    499,
    '{"searches_per_month": 100, "reports_per_month": 50, "companies_per_month": 50, "users": 5, "watchlist_items": 50, "compare_items": 4}'::jsonb,
    array['compare', 'export'],
    false,
    false,
    false,
    2
  ),
  (
    'pro',
    'الاحترافية',
    'للمنشآت التي تعتمد على مرصد في قرارات التعامل اليومية',
    1499,
    '{"searches_per_month": 1000, "reports_per_month": -1, "companies_per_month": -1, "users": 20, "watchlist_items": 500, "compare_items": 6}'::jsonb,
    array['compare', 'export', 'bulk_import', 'api_access', 'advanced_analytics'],
    false,
    false,
    false,
    3
  ),
  (
    'enterprise',
    'المؤسسية',
    'بلا حدود، مع دعم مخصص وتكامل مع أنظمتك',
    0,   -- quoted per contract; 0 renders as "تواصل معنا"
    '{"searches_per_month": -1, "reports_per_month": -1, "companies_per_month": -1, "users": -1, "watchlist_items": -1, "compare_items": -1}'::jsonb,
    array['compare', 'export', 'bulk_import', 'api_access', 'advanced_analytics', 'priority_support', 'custom_reports', 'sso'],
    false,
    false,
    false,
    4
  )
on conflict (code) do update set
  name                = excluded.name,
  description         = excluded.description,
  price_monthly       = excluded.price_monthly,
  limits              = excluded.limits,
  features            = excluded.features,
  is_default          = excluded.is_default,
  give_to_get_enabled = excluded.give_to_get_enabled,
  sort_order          = excluded.sort_order,
  updated_at          = now();
  -- `active` is intentionally not overwritten: once an operator switches a plan
  -- on from the admin panel, re-running this migration must not switch it back.

-- ============================================================================
-- 3) Give-to-Get rates, and the catalogue of feature keys
-- ============================================================================
-- Rates are settings, not code. Changing what an approved report is worth is a
-- field in the admin panel.

insert into public.system_settings (key, value, description)
values
  (
    'give_to_get_rules',
    '{
      "earn": {
        "company_added":       {"points": 5,  "label": "إضافة شركة جديدة للسجل"},
        "company_completed":   {"points": 10, "label": "استكمال بيانات شركة"},
        "documents_uploaded":  {"points": 3,  "label": "رفع مستند موثق"},
        "report_approved":     {"points": 20, "label": "اعتماد تقرير أرسلته"}
      },
      "spend": {
        "search_unlock": {"points": 1, "label": "عملية بحث إضافية"}
      },
      "monthly_earn_cap": 200
    }'::jsonb,
    'كم تُكسب كل مساهمة موثقة من نقاط، وكم تُكلّف كل عملية إضافية. تنطبق على الباقات التي فُعّل فيها Give-to-Get.'
  ),
  (
    'feature_catalog',
    '{
      "compare":            "مقارنة الشركات",
      "export":             "تصدير البيانات",
      "bulk_import":        "الاستيراد الجماعي",
      "api_access":         "الوصول عبر API",
      "advanced_analytics": "تحليلات متقدمة",
      "priority_support":   "دعم ذو أولوية",
      "custom_reports":     "تقارير مخصصة",
      "sso":                "تسجيل دخول موحّد"
    }'::jsonb,
    'أسماء الميزات كما تظهر في لوحة الإدارة. المفتاح هو ما يفحصه التطبيق، والقيمة هي ما يقرأه البشر.'
  ),
  (
    'entitlements_enforcement',
    '{"enabled": true, "grace_percent": 0}'::jsonb,
    'مفتاح إيقاف عام لتطبيق الحدود. إيقافه يمنح الجميع وصولاً غير محدود دون تعديل الكود — للطوارئ فقط.'
  )
on conflict (key) do nothing;   -- never clobber values an operator has tuned

-- ============================================================================
-- 4) Put every existing tenant on the default plan
-- ============================================================================
-- subscriptions.tenant_id is unique, so a tenant already on a plan is skipped.
-- The far-future period end is what "does not expire" looks like in a column
-- declared not null.

insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
select t.id, p.id, 'active', now(), (now() + interval '100 years')
from public.tenants t
cross join (select id from public.plans where is_default limit 1) p
where not exists (select 1 from public.subscriptions s where s.tenant_id = t.id);

-- ============================================================================
-- 5) Indexes the entitlement lookup depends on
-- ============================================================================
-- Resolved on every gated action, so it must not table-scan.

create index if not exists idx_subscriptions_tenant on public.subscriptions(tenant_id);
create index if not exists idx_credits_ledger_tenant on public.credits_ledger(tenant_id);
create index if not exists idx_view_quota_tenant_period on public.view_quota_usage(tenant_id, period);

comment on column public.plans.code is 'Stable key the application checks. Display name and price are free to change; this is not.';
comment on column public.plans.limits is 'Per-period ceilings. -1 is unlimited. An absent key is unlimited, never zero.';
comment on column public.plans.features is 'Feature keys this plan unlocks. See system_settings.feature_catalog.';
