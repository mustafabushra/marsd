# Vercel Environment Variables Setup Required

## المشكلة الحالية
الشاشة بيضاء على `https://marsd-peach.vercel.app/` لأن environment variables ناقصة.

## الحل - أضف هذه المتغيرات إلى Vercel:

### في Vercel Dashboard:
1. اذهب إلى: https://vercel.com/dashboard → marsd → Settings → Environment Variables

### أضف المتغيرات التالية:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y2xldmVyLWd1cHB5LTY0LmNsZXJrLmFjY291bnRzLmRldiQ
VITE_SUPABASE_URL=https://ccvmggffzdyomymvonvf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_RnSUWnkLYvDfs2HKGefznQ_iDN8uG5Y
```

### Private env vars (optional for now):
```
CLERK_SECRET_KEY=sk_test_eMLDpCI9lzOUwqCkl49WWHxjrRhVoSLs6WTr4ryZhY
CLERK_API_URL=https://api.clerk.com
CLERK_FRONTEND_API=https://clever-guppy-64.clerk.accounts.dev
```

## ملاحظات مهمة:
- متغيرات تبدأ بـ `VITE_` يجب أن تكون public (للفرونت‑إند)
- متغيرات بدون `VITE_` تكون private (إذا كان عندك server)
- اترك `.env.production` كما هي لـ local development

## بعد إضافة المتغيرات:
1. Vercel سيعيد البناء تلقائياً
2. تحقق من: https://vercel.com/marsd-peach/deployments
3. تحقق من البناء الجديد هل نجح أم لا

## إذا لم تعرف القيم:
- Clerk: اذهب إلى https://dashboard.clerk.com
- Supabase: اذهب إلى https://app.supabase.com
