-- Marsad: Demo/Test Data Seed
-- SQL: demo_data.sql
-- Purpose: Populate test database with realistic multi-tenant data
-- Note: Run AFTER 001_initial_schema.sql and 002_rls_policies.sql
-- Security: This data is for testing only - use in development/staging only

-- ============================================================================
-- STEP 1: Insert Plans (Subscription plans)
-- ============================================================================

INSERT INTO plans (id, name, price_monthly, limits, features, active)
VALUES
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'مجاني', 0,
   '{"views": 50, "users": 1, "watchlists": 1}'::jsonb,
   ARRAY['Basic company search', 'Limited reports'], true),
  ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'أساسي', 99.00,
   '{"views": 500, "users": 3, "watchlists": 2}'::jsonb,
   ARRAY['Full company search', 'Report submission', 'Watchlist alerts'], true),
  ('550e8400-e29b-41d4-a716-446655440002'::uuid, 'احترافي', 299.00,
   '{"views": 2000, "users": 10, "watchlists": 5}'::jsonb,
   ARRAY['Priority support', 'Custom reports', 'API access', 'Advanced analytics'], true),
  ('550e8400-e29b-41d4-a716-446655440003'::uuid, 'مؤسسات', 999.00,
   '{"views": 10000, "users": 50, "watchlists": 20}'::jsonb,
   ARRAY['Dedicated account manager', 'Custom integration', 'SLA', 'Audit logs'], true);

-- ============================================================================
-- STEP 2: Insert Tenants (Subscriber Companies)
-- ============================================================================

INSERT INTO tenants (id, name, cr_number, email, phone, city, sector, status)
VALUES
  ('10000000-0000-0000-0000-000000000001'::uuid, 'شركة الخليج للإنشاءات', '1234567890', 'contact@khalij.sa', '+966501234567', 'الرياض', 'مقاولات', 'active'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'الشركة العربية للتجارة', '2345678901', 'info@arbc.com', '+966502345678', 'جدة', 'تجارة عامة', 'active'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'شركة الرؤية للاستشارات', '3456789012', 'admin@alroyah.co', '+966503456789', 'الدمام', 'استشارات', 'active'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'النخبة للخدمات اللوجستية', '4567890123', 'ops@alnokba.sa', '+966504567890', 'الخبر', 'لوجستيات', 'active'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'صناعات الحديد المتقدمة', '5678901234', 'sales@hadid.com', '+966505678901', 'الرياض', 'صناعة', 'active');

-- ============================================================================
-- STEP 3: Insert Subscriptions (Link tenants to plans)
-- ============================================================================

INSERT INTO subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'active', now(), now() + interval '30 days'),
  ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'active', now(), now() + interval '30 days'),
  ('20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, '550e8400-e29b-41d4-a716-446655440003'::uuid, 'active', now(), now() + interval '30 days'),
  ('20000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'active', now(), now() + interval '30 days'),
  ('20000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'active', now(), now() + interval '30 days');

-- ============================================================================
-- STEP 4: Insert Users (Tenant employees)
-- ============================================================================

INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, status, email_verified)
VALUES
  -- شركة الخليج للإنشاءات
  ('30000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'admin@khalij.sa', '$2a$10$hashedpassword1', 'محمد', 'الفايز', 'company_admin', 'active', true),
  ('30000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'user1@khalij.sa', '$2a$10$hashedpassword2', 'فاطمة', 'السعيد', 'company_member', 'active', true),
  ('30000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'user2@khalij.sa', '$2a$10$hashedpassword3', 'علي', 'محمود', 'company_member', 'active', true),

  -- الشركة العربية للتجارة
  ('30000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'admin@arbc.com', '$2a$10$hashedpassword4', 'سارة', 'الأحمد', 'company_admin', 'active', true),
  ('30000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'user3@arbc.com', '$2a$10$hashedpassword5', 'خالد', 'النعيم', 'company_member', 'active', true),

  -- شركة الرؤية للاستشارات
  ('30000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'admin@alroyah.co', '$2a$10$hashedpassword6', 'أحمد', 'الدعيس', 'company_admin', 'active', true),
  ('30000000-0000-0000-0000-000000000007'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'user4@alroyah.co', '$2a$10$hashedpassword7', 'ليلى', 'العتيبي', 'company_member', 'active', true),

  -- النخبة للخدمات اللوجستية
  ('30000000-0000-0000-0000-000000000008'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, 'admin@alnokba.sa', '$2a$10$hashedpassword8', 'نور', 'الخريف', 'company_admin', 'active', true),
  ('30000000-0000-0000-0000-000000000009'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, 'user5@alnokba.sa', '$2a$10$hashedpassword9', 'عمر', 'المقرن', 'company_member', 'active', true),

  -- صناعات الحديد المتقدمة
  ('30000000-0000-0000-0000-000000000010'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, 'admin@hadid.com', '$2a$10$hashedpassword10', 'هند', 'السويلم', 'company_admin', 'active', true),
  ('30000000-0000-0000-0000-000000000011'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, 'user6@hadid.com', '$2a$10$hashedpassword11', 'يوسف', 'الحميدي', 'company_member', 'active', true),

  -- Platform Reviewer
  ('30000000-0000-0000-0000-000000000099'::uuid, NULL, 'reviewer@marsad.sa', '$2a$10$hashedpassword99', 'محمد', 'المراجع', 'reviewer', 'active', true);

-- ============================================================================
-- STEP 5: Insert Companies (Companies being reviewed)
-- ============================================================================

INSERT INTO companies (id, name, cr_number, sector, city, founded_year, cr_status, source, approved)
VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, 'شركة الفرسان العملاقة', '1111111111', 'مقاولات', 'الرياض', 2010, 'active', 'community', true),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'مجموعة الثروة التجارية', '2222222222', 'تجارة عامة', 'جدة', 2008, 'active', 'official', true),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'الصرح للاستشارات الهندسية', '3333333333', 'استشارات', 'الدمام', 2015, 'active', 'community', true),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'شركة الوثبة للمقاولات', '4444444444', 'مقاولات', 'الرياض', 2012, 'active', 'community', true),
  ('40000000-0000-0000-0000-000000000005'::uuid, 'التكامل الصناعي الحديث', '5555555555', 'صناعة', 'الخبر', 2011, 'active', 'official', true),
  ('40000000-0000-0000-0000-000000000006'::uuid, 'الحوار للخدمات اللوجستية', '6666666666', 'لوجستيات', 'الرياض', 2013, 'active', 'community', true),
  ('40000000-0000-0000-0000-000000000007'::uuid, 'جسور التنمية للاستشارات', '7777777777', 'استشارات', 'جدة', 2016, 'active', 'community', true),
  ('40000000-0000-0000-0000-000000000008'::uuid, 'الريادة للمشاريع والتطوير', '8888888888', 'تطوير عقاري', 'الرياض', 2009, 'active', 'official', true);

-- ============================================================================
-- STEP 6: Insert Company Profiles (Tenant claims)
-- ============================================================================

INSERT INTO company_profiles (id, tenant_id, company_id, claimed_at)
VALUES
  ('50000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, now()),
  ('50000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000002'::uuid, now()),
  ('50000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000003'::uuid, now());

-- ============================================================================
-- STEP 7: Insert Reports (Business transaction reports)
-- ============================================================================

INSERT INTO reports (
  id, reporter_tenant_id, target_company_id, status,
  deal_amount_range, payment_commitment, delay_days, defaulted,
  dealt_at, submitted_at, approved_at, created_at
)
VALUES
  -- شركة الخليج للإنشاءات -> شركة الفرسان العملاقة
  ('60000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'approved',
   '100k-500k', 'full', 0, false, now() - interval '30 days', now() - interval '25 days', now() - interval '20 days', now() - interval '30 days'),

  -- شركة الخليج للإنشاءات -> الصرح للاستشارات
  ('60000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000003'::uuid, 'draft',
   '50k-100k', 'partial', 0, false, now() - interval '10 days', NULL, NULL, now() - interval '10 days'),

  -- الشركة العربية للتجارة -> التكامل الصناعي الحديث
  ('60000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000005'::uuid, 'approved',
   '500k+', 'full', 5, false, now() - interval '45 days', now() - interval '40 days', now() - interval '15 days', now() - interval '45 days'),

  -- شركة الرؤية للاستشارات -> شركة الوثبة للمقاولات
  ('60000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000004'::uuid, 'pending_review',
   '100k-500k', 'late', 30, false, now() - interval '60 days', now() - interval '5 days', NULL, now() - interval '60 days'),

  -- النخبة للخدمات اللوجستية -> الحوار للخدمات اللوجستية
  ('60000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, '40000000-0000-0000-0000-000000000006'::uuid, 'approved',
   '50k-100k', 'full', 0, false, now() - interval '20 days', now() - interval '18 days', now() - interval '10 days', now() - interval '20 days'),

  -- صناعات الحديد المتقدمة -> جسور التنمية للاستشارات
  ('60000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, '40000000-0000-0000-0000-000000000007'::uuid, 'draft',
   '500k+', 'partial', 0, false, now() - interval '5 days', NULL, NULL, now() - interval '5 days');

-- ============================================================================
-- STEP 8: Insert Review Actions (Approvals/rejections)
-- ============================================================================

INSERT INTO review_actions (id, report_id, reviewer_id, action, reason, created_at)
VALUES
  ('70000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000099'::uuid, 'approve', NULL, now() - interval '20 days'),
  ('70000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000099'::uuid, 'approve', NULL, now() - interval '15 days'),
  ('70000000-0000-0000-0000-000000000003'::uuid, '60000000-0000-0000-0000-000000000005'::uuid, '30000000-0000-0000-0000-000000000099'::uuid, 'approve', NULL, now() - interval '10 days');

-- ============================================================================
-- STEP 9: Insert Trust Scores
-- ============================================================================

INSERT INTO trust_scores (id, company_id, score, risk_band, tier, approved_reports, breakdown, computed_at)
VALUES
  ('80000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 75, 'low', 'preliminary', 1,
   '{"official": 0, "community": 75, "formal_data_weight": 0.3, "community_weight": 0.7}'::jsonb, now()),

  ('80000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000002'::uuid, 82, 'low', 'full', 1,
   '{"official": 100, "community": 65, "formal_data_weight": 0.3, "community_weight": 0.7}'::jsonb, now()),

  ('80000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000003'::uuid, 68, 'medium', 'preliminary', 0,
   '{"official": 0, "community": 68, "formal_data_weight": 0.3, "community_weight": 0.7}'::jsonb, now()),

  ('80000000-0000-0000-0000-000000000004'::uuid, '40000000-0000-0000-0000-000000000004'::uuid, 55, 'high', 'preliminary', 1,
   '{"official": 0, "community": 55, "formal_data_weight": 0.3, "community_weight": 0.7}'::jsonb, now()),

  ('80000000-0000-0000-0000-000000000005'::uuid, '40000000-0000-0000-0000-000000000005'::uuid, 88, 'low', 'full', 1,
   '{"official": 100, "community": 76, "formal_data_weight": 0.3, "community_weight": 0.7}'::jsonb, now());

-- ============================================================================
-- STEP 10: Insert Watchlist Items
-- ============================================================================

INSERT INTO watchlist_items (id, tenant_id, company_id, list_name, created_by, created_at)
VALUES
  ('90000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000004'::uuid, 'الشركات المهمة', '30000000-0000-0000-0000-000000000001'::uuid, now()),
  ('90000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000005'::uuid, 'الشركات المهمة', '30000000-0000-0000-0000-000000000001'::uuid, now()),
  ('90000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'المنافسين', '30000000-0000-0000-0000-000000000004'::uuid, now());

-- ============================================================================
-- STEP 11: Insert Audit Logs
-- ============================================================================

INSERT INTO audit_logs (id, tenant_id, actor_id, actor_role, action, entity, entity_id, meta, ip_address, user_agent, created_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'company_admin', 'report:create', 'report', '60000000-0000-0000-0000-000000000001'::uuid, '{"deal_amount":"250000", "company":"الفرسان العملاقة"}'::jsonb, '192.168.1.100'::inet, 'Mozilla/5.0', now() - interval '30 days'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'company_admin', 'report:submit', 'report', '60000000-0000-0000-0000-000000000001'::uuid, '{"status":"pending_review"}'::jsonb, '192.168.1.100'::inet, 'Mozilla/5.0', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, NULL, '30000000-0000-0000-0000-000000000099'::uuid, 'reviewer', 'report:approve', 'report', '60000000-0000-0000-0000-000000000001'::uuid, '{"reason":"valid documentation"}'::jsonb, '10.0.0.50'::inet, 'Mozilla/5.0', now() - interval '20 days'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000004'::uuid, 'company_admin', 'user:login', 'user', '30000000-0000-0000-0000-000000000004'::uuid, '{"method":"email/password"}'::jsonb, '192.168.1.105'::inet, 'Chrome/90', now() - interval '2 days'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, 'company_admin', 'watchlist:add', 'watchlist_item', '90000000-0000-0000-0000-000000000001'::uuid, '{"company":"شركة الوثبة"}'::jsonb, '192.168.1.100'::inet, 'Safari/14', now() - interval '5 days');

-- ============================================================================
-- STEP 12: Insert Invoices
-- ============================================================================

INSERT INTO invoices (id, subscription_id, amount, vat, status, issued_at, due_at, paid_at, created_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 299.00, 44.85, 'paid', now() - interval '30 days', now() - interval '20 days', now() - interval '28 days', now() - interval '30 days'),
  ('b0000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 99.00, 14.85, 'paid', now() - interval '30 days', now() - interval '20 days', now() - interval '25 days', now() - interval '30 days'),
  ('b0000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 999.00, 149.85, 'pending', now(), now() + interval '30 days', NULL, now()),
  ('b0000000-0000-0000-0000-000000000004'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 299.00, 44.85, 'pending', now(), now() + interval '30 days', NULL, now());

-- ============================================================================
-- STEP 13: Insert View Quota Usage
-- ============================================================================

INSERT INTO view_quota_usage (id, tenant_id, period, views_count, created_at, updated_at)
VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-07', 325, now() - interval '5 days', now()),
  ('c0000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '2026-07', 425, now() - interval '3 days', now()),
  ('c0000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, '2026-07', 1250, now() - interval '1 day', now()),
  ('c0000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, '2026-07', 475, now() - interval '2 days', now()),
  ('c0000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, '2026-07', 350, now() - interval '4 days', now());

-- ============================================================================
-- STEP 14: Insert System Settings
-- ============================================================================

INSERT INTO system_settings (id, key, value, description)
VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'trust_score_calculation_version', '{"version": "2.1", "algorithm": "weighted_average"}'::jsonb, 'Trust score calculation algorithm version'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'max_users_per_company', '{"free": 1, "basic": 3, "pro": 10, "enterprise": 50}'::jsonb, 'Maximum users per tenant plan'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'notification_settings', '{"email_on_report_approved": true, "email_on_score_change": true, "sms_enabled": false}'::jsonb, 'Platform-wide notification settings'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'api_rate_limits', '{"requests_per_minute": 60, "requests_per_hour": 3600}'::jsonb, 'API rate limiting configuration');

-- ============================================================================
-- VERIFICATION QUERIES (Run after seed to verify data)
-- ============================================================================

-- Verify counts
-- SELECT 'Tenants' as entity, COUNT(*) FROM tenants
-- UNION ALL SELECT 'Users', COUNT(*) FROM users
-- UNION ALL SELECT 'Companies', COUNT(*) FROM companies
-- UNION ALL SELECT 'Reports', COUNT(*) FROM reports
-- UNION ALL SELECT 'Audit Logs', COUNT(*) FROM audit_logs;

-- End of seeds/demo_data.sql
