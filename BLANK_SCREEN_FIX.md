# الشاشة البيضاء — السبب والحل

## المشكلة
عند دخول https://marsd-peach.vercel.app/ الشاشة بيضاء تماماً.

## السبب
ClerkProvider يرمي error:
```javascript
if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}
```

المتغيرات لم تُعين في **Vercel dashboard** (يختلف عن `.env.production` المحلي).

## الحل الفوري

### الخطوة 1: اذهب إلى Vercel
https://vercel.com/dashboard

### الخطوة 2: اختر المشروع
`marsd` أو `marsd-peach`

### الخطوة 3: Settings → Environment Variables

### الخطوة 4: أضف المتغيرات

| المتغير | القيمة |
|--------|--------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_Y2xldmVyLWd1cHB5LTY0LmNsZXJrLmFjY291bnRzLmRldiQ` |
| `VITE_SUPABASE_URL` | `https://ccvmggffzdyomymvonvf.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_RnSUWnkLYvDfs2HKGefznQ_iDN8uG5Y` |

### الخطوة 5: Save

Vercel سيعيد البناء تلقائياً.

### الخطوة 6: تحقق من البناء
https://vercel.com/marsd-peach/deployments

## النتيجة المتوقعة

✅ البناء ينجح  
✅ الشاشة البيضاء تختفي  
✅ يظهر الـ landing page  
✅ يمكن تسجيل الدخول عبر Clerk  

## ملاحظات

- `.env.production` للـ local development فقط
- Vercel لا تقرأ ملفات `.env*` 
- يجب أن تعين المتغيرات في Vercel dashboard مباشرة
