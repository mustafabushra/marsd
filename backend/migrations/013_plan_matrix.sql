-- Migration: 013_plan_matrix.sql
-- Purpose: put the agreed plan matrix into the database.
--
-- The principle behind it: contribution is the asset, consumption is the
-- product. Adding companies and filing reports build the registry Marsad sells
-- access to, so capping them monthly throttles the thing being sold. What is
-- metered instead is what consumes the registry — searching it, comparing
-- within it, watching it, being alerted by it.
--
-- Reports are unlimited but not unmoderated. The control moves from a monthly
-- total to a ceiling on reports awaiting review at once: a contributor files as
-- many as they like over time, while no single tenant can flood the review queue
-- and make it unusable for everyone else. Nothing earns credit until it is
-- approved.
--
-- Idempotent.

-- ============================================================================
-- 1) Two feature keys the matrix needs
-- ============================================================================
-- The full trust report is the strongest lever in the matrix: a free member can
-- see that a score exists without seeing what it is built from.

update public.system_settings
set value = value
  || '{"full_trust_report": "مؤشر الثقة الكامل"}'::jsonb
  || '{"alerts": "التنبيهات"}'::jsonb,
    updated_at = now()
where key = 'feature_catalog';

-- ============================================================================
-- 2) The matrix
-- ============================================================================
-- limits: -1 is unlimited, an absent key is unlimited.
-- pending_reports is a concurrency ceiling, not a period allowance — it is the
-- only limit here that is not consumed and reset.

update public.plans set
  limits = '{"searches_per_month": 10, "reports_per_month": -1, "companies_per_month": -1, "pending_reports": 5, "users": 2, "watchlist_items": 3, "compare_items": 0}'::jsonb,
  features = array[]::text[],
  updated_at = now()
where code = 'free';

update public.plans set
  limits = '{"searches_per_month": 200, "reports_per_month": -1, "companies_per_month": -1, "pending_reports": 15, "users": 3, "watchlist_items": 50, "compare_items": 0}'::jsonb,
  features = array['full_trust_report'],
  updated_at = now()
where code = 'basic';

-- 5000 rather than unlimited, and marketed as unlimited. The registry is the
-- product; an uncapped seat is a supported way to copy it wholesale. No genuine
-- customer approaches this number and every bulk reader hits it.
update public.plans set
  limits = '{"searches_per_month": 5000, "reports_per_month": -1, "companies_per_month": -1, "pending_reports": 50, "users": 10, "watchlist_items": 500, "compare_items": 6}'::jsonb,
  features = array['full_trust_report', 'compare', 'alerts'],
  updated_at = now()
where code = 'pro';

update public.plans set
  limits = '{"searches_per_month": -1, "reports_per_month": -1, "companies_per_month": -1, "pending_reports": -1, "users": -1, "watchlist_items": -1, "compare_items": -1}'::jsonb,
  features = array['full_trust_report', 'compare', 'alerts', 'api_access'],
  updated_at = now()
where code = 'enterprise';

-- ============================================================================
-- 3) What the plans now say, in the descriptions members read
-- ============================================================================

update public.plans set description = 'ساهم ببيانات موثقة ووسّع حدودك — إضافة الشركات وإرسال التقارير بلا حد'
where code = 'free';
update public.plans set description = 'مؤشر الثقة الكامل و200 عملية بحث شهرياً لفريقك'
where code = 'basic';
update public.plans set description = 'مقارنة وتنبيهات وبحث موسّع للمنشآت التي تعتمد على مرصد يومياً'
where code = 'pro';
update public.plans set description = 'بلا حدود، مع وصول عبر API ودعم مخصص'
where code = 'enterprise';

-- ============================================================================
-- 4) The earning ceiling, stated where the rates are
-- ============================================================================
-- Unlimited reports meet credits that widen limits: without a ceiling, filing
-- enough reports turns the free plan into an unlimited one and the paid tiers
-- lose their meaning from that direction. 200 a month is generous — 210
-- searches at the free plan's rate — and finite.

update public.system_settings
set value = jsonb_set(value, '{monthly_earn_cap}', '200'::jsonb),
    description = 'كم تُكسب كل مساهمة موثقة من نقاط، وكم تُكلّف كل عملية إضافية، وسقف ما يمكن كسبه شهرياً. يُطبَّق السقف في lib/entitlements.js — تغييره هنا يسري دون نشر.',
    updated_at = now()
where key = 'give_to_get_rules';

comment on column public.plans.limits is 'Per-period ceilings, except pending_reports which is concurrent. -1 is unlimited; an absent key is unlimited, never zero.';
