# Marsad Backend API

**منصة تقييم موثوقية الأعمال — B2B Business Trust Platform**

## 🚀 البدء السريع

### 1. تثبيت المتطلبات

```bash
cd backend
npm install
```

### 2. تشغيل قاعدة البيانات

```bash
# تشغيل PostgreSQL و Redis محلياً
docker-compose up -d

# انتظر حتى الخادم جاهز
docker-compose ps
```

### 3. إعداد قاعدة البيانات

```bash
# تشغيل الهجرات
npm run db:push

# أو إذا كنت تستخدم الهجرات التدريجية:
npm run db:migrate

# بذر البيانات التجريبية
npm run db:seed
```

### 4. تشغيل الخادم

```bash
# تطوير (مع Hot Reload)
npm run dev

# أو بناء وتشغيل في الإنتاج
npm run build
npm run start
```

الخادم سيعمل على: **http://localhost:3000**

---

## 📚 API Endpoints (الأساسية)

### التسجيل والمصادقة

```bash
# تسجيل شركة جديدة
POST /auth/register
{
  "name": "شركة الاختبار",
  "email": "test@marsad.sa",
  "password": "SecurePass123",
  "crNumber": "1010123456",
  "city": "الرياض",
  "sector": "تجارة"
}

# تسجيل الدخول
POST /auth/login
{
  "email": "test@marsad.sa",
  "password": "SecurePass123"
}

# تجديد التوكن
POST /auth/refresh
Headers: Authorization: Bearer <refresh_token>
```

### البحث والتقارير

```bash
# البحث عن شركات
GET /companies/search?q=نجد&page=1&limit=20
Headers: Authorization: Bearer <access_token>

# عرض تقرير الشركة
GET /companies/:companyId/report
Headers: Authorization: Bearer <access_token>

# رفع تقرير تعامل
POST /reports
Headers: Authorization: Bearer <access_token>
{
  "targetCompanyId": "uuid",
  "dealAmountRange": "100k-500k",
  "paymentCommitment": "full",
  "delayDays": 0,
  "defaulted": false,
  "dealtAt": "2026-07-10"
}
```

### المراجعة الإدارية (Admin فقط)

```bash
# جلب طابور المراجعة
GET /reports/review-queue?page=1
Headers: Authorization: Bearer <admin_token>

# الموافقة على تقرير
POST /reports/:reportId/approve
Headers: Authorization: Bearer <admin_token>

# رفض تقرير
POST /reports/:reportId/reject
Headers: Authorization: Bearer <admin_token>
{
  "reason": "بيانات غير كاملة"
}
```

---

## 🔐 بيانات الاختبار

بعد `npm run db:seed`:

| الحقل | القيمة |
|------|--------|
| **الشركة 1 - البريد** | `test1@marsad.sa` |
| **الشركة 2 - البريد** | `test2@marsad.sa` |
| **كلمة المرور** | `Test@1234` |

---

## 📊 Trust Score Engine

المعادلة الأساسية (من الوثيقة):

```
TrustScore = clamp(
  (0.30 × S_official) + (0.70 × S_community),
  0,
  100
)
```

### فئات المخاطر:
- **70-100**: مخاطر منخفضة (أخضر)
- **40-69**: مخاطر متوسطة (برتقالي)
- **0-39**: مخاطر مرتفعة (أحمر)

---

## 🏗️ البنية المعمارية

```
backend/
├── src/
│   ├── main.ts               # نقطة الدخول
│   ├── app.module.ts         # Module الرئيسي
│   ├── common/               # Guards، Decorators، Filters
│   ├── modules/
│   │   ├── auth/            # تسجيل ودخول
│   │   ├── companies/        # إدارة الشركات والبحث
│   │   ├── reports/          # إدارة التقارير والمراجعة
│   │   ├── trust-score/      # محرك مؤشر الثقة
│   │   └── admin/            # إدارة المنصة
│   └── prisma/              # قاعدة البيانات
├── prisma/
│   ├── schema.prisma        # تعريف الجداول (17 جدول)
│   └── seed.ts              # بيانات اختبار
└── docker-compose.yml       # PostgreSQL + Redis محلياً
```

---

## 🧪 الاختبار

```bash
# تشغيل الاختبارات
npm run test

# مع Coverage
npm run test:cov
```

---

## 📝 الهجرات

```bash
# إنشاء هجرة جديدة بعد تعديل schema.prisma
npm run db:migrate

# عرض Prisma Studio (واجهة GUI)
npm run db:studio
```

---

## 🐛 استكشاف الأخطاء

### قاعدة البيانات لا تتصل

```bash
# تحقق من حالة Docker
docker-compose ps

# أعد تشغيل الخدمات
docker-compose restart postgres
```

### خطأ في الهجرات

```bash
# احذف وأعد الهجرات
docker-compose down -v
docker-compose up -d
npm run db:migrate
npm run db:seed
```

---

## 📦 المتطلبات المستقبلية

- [ ] BullMQ Queue للمهام الخلفية
- [ ] Stripe/Moyasar Integration للدفع
- [ ] AWS S3 Upload للمستندات
- [ ] SES للبريد الإلكتروني
- [ ] Redis Caching للأداء
- [ ] GraphQL API
- [ ] Unit & Integration Tests

---

## 📞 الدعم

للمزيد من المعلومات، راجع:
- وثيقة المشروع: `../docs/PROJECT_DOCUMENT.md`
- خارطة الطريق: `../docs/ROADMAP.md`

---

**آخر تحديث:** 13 يوليو 2026  
**الحالة:** Development MVP - Phase 1
