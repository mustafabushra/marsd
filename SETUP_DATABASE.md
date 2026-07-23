# 🗄️ إعداد قاعدة بيانات Supabase

## المشكلة
خطأ `404: NOT_FOUND` عند تحديث الصفحة — الجداول غير موجودة في Supabase

## الحل: تطبيق SQL Migrations

### الخطوة 1: افتح Supabase Console
1. اذهب إلى: https://app.supabase.com
2. اختر المشروع: `ccvmggffzdyomymvonvf`
3. اضغط على **SQL Editor** (الشريط الأيسر)

### الخطوة 2: أنسخ الـ SQL script
انسخ محتوى: `database/create_schema.sql`

### الخطوة 3: الصق في Supabase
1. في SQL Editor، اضغط **New Query**
2. الصق الكود كاملاً
3. اضغط **Run**

### الخطوة 4: تحقق من النجاح
بعد تشغيل الـ query:
- ✅ يجب أن ترى "Query successful" أعلى الصفحة
- ✅ افتح **Table Editor** (الشريط الأيسر)
- ✅ يجب أن ترى الجداول الجديدة:
  - companies
  - tenants
  - users
  - reports
  - notifications
  - watchlist_items
  - business_requests
  - registration_requests
  - claim_requests
  - trust_scores
  - credits_ledger
  - subscriptions
  - plans
  - audit_logs

### الخطوة 5: إضافة بيانات تجريبية (اختياري)

إذا أردت بيانات تجريبية لـ testing:

```sql
-- إضافة خطة مجانية
INSERT INTO plans (name, description, price, features, limits) 
VALUES (
  'مجاني',
  'خطة مجانية محدودة',
  0,
  '{"reports": 5, "watchlist": true, "search": true}',
  '{"monthly_reports": 5, "company_views": 10}'
);

-- إضافة شركة تجريبية
INSERT INTO companies (
  name, 
  cr_number, 
  sector, 
  city, 
  status, 
  source
) VALUES (
  'شركة تجريبية',
  '1234567890',
  'التكنولوجيا',
  'الرياض',
  'approved',
  'community'
);
```

## ✅ جاهز!
الآن عندما تحدّث الصفحة، يجب أن تعمل بدون `404: NOT_FOUND`

## استكشاف الأخطاء

إذا لم تعمل:

### 1. تحقق من الجداول
افتح **Table Editor** وتأكد أن الجداول موجودة

### 2. شاهد رسالة الخطأ
- اضغط F12 في المتصفح
- افتح Console tab
- ابحث عن رسالة الخطأ بالكامل

### 3. تحقق من RLS Policies
إذا كان الخطأ `403 FORBIDDEN` (وليس 404):
- يعني الجداول موجودة لكن RLS تمنع الوصول
- ننتظر تطبيق RLS policies في خطوة لاحقة

## الخطوات التالية
1. ✅ تطبيق الـ Schema (أنت هنا)
2. ⏳ تطبيق RLS Policies (لاحقاً)
3. ⏳ تطبيق Business Logic Functions (لاحقاً)
