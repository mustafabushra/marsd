# كيفية إعداد حساب الإدارة (Admin) لمرصد

## النظام الحالي

**مرصد** لديها نظام auth ثنائي:

1. **Company Users (الشركات)**
   - تسجيل دخول عادي عبر `/login`
   - ترى: Company Dashboard مع sidebar قائمة الشركات
   - لا ترى: admin buttons

2. **Admin Users (مرصد - الإدارة)**
   - تسجيل دخول عبر `/admin-login`
   - ترى: Admin Dashboard مع sidebar قائمة الإدارة
   - الزر الأحمر "الإدارة" يظهر لهم

---

## خطوات إنشاء Admin Account

### الطريقة 1: إعادة استخدام حساب موجود (الأفضل)

1. **اذهب إلى Clerk Dashboard**
   - https://dashboard.clerk.com

2. **اختر Users**

3. **ابحث عن المستخدم** الذي تريد جعله admin

4. **اضغط عليه** وادخل العلامة (User ID)

5. **في صفحة التفاصيل:**
   - ابحث عن **"Unsafe Metadata"** أو **"Public Metadata"**
   - أضف:
   ```json
   {
     "role": "admin"
   }
   ```

6. **اضغط Save**

7. **المستخدم يسجل خروج ودخول** (جديد)

8. **الآن:**
   - الزر الأحمر "الإدارة" يظهر في navbar
   - اضغط عليه → يروح لـ `/admin`
   - Admin Dashboard ينفتح

---

### الطريقة 2: إنشاء Admin Account جديد

1. **اذهب إلى Clerk Dashboard** → Users → + New

2. **أنشئ user جديد**
   - Email: admin@marsad.sa (أو أي بريد)
   - Password: أي كلمة مرور قوية

3. **بعد الإنشاء، اضغط على المستخدم الجديد**

4. **أضف Public Metadata:**
   ```json
   {
     "role": "admin"
   }
   ```

5. **Save**

6. **الآن المستخدم يقدر يدخل عبر `/admin-login`**

---

## الفلو الكامل للأدمن

```
1. ذهاب لـ https://marsd.com (Landing Page)
   ↓
2. اضغط زر "الإدارة" (أحمر)
   ↓
3. ينقلك لـ /admin-login
   ↓
4. Clerk SignIn يظهر
   ↓
5. أكتب email + password
   ↓
6. Clerk يتحقق + يرسلك لـ /admin
   ↓
7. AdminShell يفتح (sidebar مع جميع خيارات الإدارة)
   ↓
8. تشوف Admin Dashboard
```

---

## الفرق بين Dashboard الشركة والأدمن

| الميزة | Company Dashboard | Admin Dashboard |
|--------|------------------|-----------------|
| **الوصول** | `/dashboard` | `/admin` |
| **تسجيل الدخول** | `/login` | `/admin-login` |
| **Sidebar** | قائمة الشركة | قائمة الإدارة |
| **الزر في navbar** | أخضر "لوحة التحكم" | أحمر "الإدارة" |
| **الوظائف** | بحث، تقارير، watchlist | مراجعة، إحصائيات، إدارة |

---

## المتطلبات

- ✅ Clerk Account (تم إعداده)
- ✅ Supabase Database (تم الربط)
- ✅ publicMetadata.role = "admin" على Clerk

---

## الحالات الخاصة

### إذا ما ظهر الزر الأحمر:
1. تحقق من `publicMetadata.role` في Clerk
2. جرّب تسجيل خروج ودخول جديد
3. افتح DevTools وشوف console

### إذا ما قدرت تدخل /admin:
1. تأكد أن `publicMetadata.role = "admin"` موجود
2. جرّب `/admin-login` بدل أي طريقة أخرى
3. استخدم نفس البريد والباسورد المسجل في Clerk

---

## أسئلة شائعة

**Q: كم عدد admins يمكن يكون؟**
A: غير محدود - أي user يقدر يكون admin.

**Q: هل Company Users يشوفون admin button؟**
A: لا - يختفي تماماً إلا للـ admins.

**Q: كيف أحذف admin؟**
A: اذهب لـ Clerk → ابحث عن المستخدم → احذف `role: "admin"` من metadata.

**Q: هل Admin يقدر يدخل Company Dashboard؟**
A: ممكن، لكن يجب يروح `/admin` للإدارة.

---

## التالي

بعد إعداد Admin:
1. ادخل لـ Admin Dashboard
2. شوف القائمة الكاملة للخيارات
3. ابدأ إدارة المنصة
