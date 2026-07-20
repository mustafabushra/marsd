# ⚡ Quick Start — تشغيل فوري

## 30 ثانية للبدء

### 1️⃣ قاعدة البيانات

```bash
cd backend
docker-compose up -d
```

### 2️⃣ تثبيت + إعداد

```bash
npm install
npm run db:push
npm run db:seed
```

### 3️⃣ تشغيل

```bash
npm run dev
```

✅ **Done!** API متاح على `http://localhost:3000`

---

## 🧪 اختبر فوراً

### اختبر Auth

```bash
# تسجيل الدخول
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test1@marsad.sa",
    "password": "Test@1234"
  }'
```

**النتيجة:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "test1@marsad.sa",
    "role": "company_admin"
  }
}
```

### اختبر البحث

```bash
# احفظ التوكن
TOKEN="<access_token_from_above>"

# ابحث عن شركات
curl -X GET "http://localhost:3000/companies/search?q=نجد" \
  -H "Authorization: Bearer $TOKEN"
```

### اختبر المؤشر

```bash
# جلب تقرير الشركة
COMPANY_ID="..." # من نتائج البحث
curl -X GET "http://localhost:3000/companies/$COMPANY_ID/report" \
  -H "Authorization: Bearer $TOKEN"
```

**ستجد:**
```json
{
  "company": { "name": "نجد للمقاولات", ... },
  "trustScore": {
    "score": 80,
    "riskBand": "low",
    "approvedReports": 5
  }
}
```

---

## 📁 الملفات المهمة

| الملف | الغرض |
|------|-------|
| `backend/src/modules/trust-score/trust-score.service.ts` | محرك المؤشر ← اقرأ هنا |
| `backend/prisma/schema.prisma` | 17 جدول ← البيانات هنا |
| `backend/prisma/seed.ts` | بيانات اختبار ← run once |
| `backend/.env` | المتغيرات ← عدّل هنا |

---

## 🔥 أهم الـ Endpoints

| الطلب | الوصف |
|------|--------|
| `POST /auth/login` | تسجيل دخول |
| `GET /companies/search?q=...` | بحث |
| `GET /companies/:id/report` | تقرير الشركة |
| `POST /reports` | رفع تقرير |
| `GET /reports/review-queue` | طابور المراجعة (Admin) |
| `POST /reports/:id/approve` | موافقة (Admin) |

---

## ❓ مشاكل شائعة

### "Cannot connect to database"
```bash
docker-compose ps
docker-compose down -v
docker-compose up -d
sleep 10  # انتظر الاتصال
npm run db:push
```

### "Table does not exist"
```bash
npm run db:push
```

### "No seed data"
```bash
npm run db:seed
```

---

## 📚 المزيد

قراءة كاملة:
- `backend/README.md` — توثيق شامل
- `BACKEND_SCAFFOLD_COMPLETE.md` — ملخص اليوم
- `docs/PROJECT_DOCUMENT.md` — وثيقة المشروع

---

**That's it! 🚀 أنت الآن مطور في Marsad API!**
