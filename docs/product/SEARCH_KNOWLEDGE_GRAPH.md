# 🧠 البحث في Knowledge Graph — نموذج البحث الصحيح

## النموذج الأساسي:

```
📋 ملايين التقارير الواردة من الشركات الخارجية
   ├─ شركة أ تقول: "شركة ب تأخرت 45 يوم"
   ├─ شركة ج تقول: "شركة ب تأخرت 60 يوم"
   └─ شركة د تقول: "شركة ب جودتهم سيئة"
        ↓
   🛡️ مرصد يجمعها في تقرير واحد مجمّع لشركة ب
        ├─ بدون كشف هوية المبلّغين
        └─ لمنع البلاغات الكيدية
        ↓
   🔍 البحث يبحث في التقارير المجمّعة
        ├─ ابحث عن "دفع متأخر" → شركات لديها تقارير عن دفع متأخر
        ├─ ابحث عن "شركة ب" → الشركة + التقارير المجمّعة عنها
        └─ النتيجة = الشركات + عدد التقارير + Trust Score
```

## المشكلة الأصلية:
```
❌ البحث الخاطئ: يبحث عن أسماء الشركات فقط (بدون محتوى التقارير)
✅ البحث الصحيح: يبحث في Knowledge Graph (التقارير المجمّعة = منتجات المعرفة)
```

---

## الآلية الجديدة:

### 1. عندما يكتب المستخدم "دفع متأخر":
```
البحث يبحث في:
├─ محتوى التقارير (نصوص الوصف)
├─ نوع التقرير (paid_late category)
├─ الشركات المرتبطة بهذه التقارير
└─ يعود بـ: [Report, Report, Report] مع الشركات المرتبطة
```

### 2. عندما يكتب "شركة الراجحي":
```
البحث يبحث في:
├─ اسم الشركة في قاعدة الشركات
├─ كل التقارير عن هذه الشركة
├─ تحليل التقارير (استخراج الإحصائيات)
└─ يعود بـ: [Company + [Reports] + Stats]
```

### 3. عندما يكتب "شركات بدون دفع":
```
البحث يبحث في:
├─ التقارير التي نوعها "دفع متأخر"
├─ استخراج الشركات من هذه التقارير
├─ ترتيب حسب عدد التقارير
└─ يعود بـ: [Company, Company, Company] مع عدد التقارير
```

---

## الهيكل الجديد للبحث:

```javascript
// البيانات المرجعة من البحث:
{
  query: "دفع متأخر",
  results: [
    {
      type: "report",  // ← المنتج
      id: "report_123",
      title: "تأخر في السداد",
      description: "الشركة تأخرت في السداد لمدة 45 يوم",
      company: {
        id: "comp_456",
        name: "الراجحي للمقاولات",
        trustScore: 84
      },
      relevance: 0.95,  // ← درجة المطابقة
      keywords: ["دفع", "متأخر", "45 يوم", "سداد"]
    },
    {
      type: "report",
      id: "report_789",
      ...
    }
  ],
  metadata: {
    totalResults: 12,
    searchTime: 245,  // ms
    indexedDocuments: 145,  // عدد التقارير المفهرسة
  }
}
```

---

## الفهرسة المطلوبة:

عند إضافة/تعديل تقرير، نفهرس:
```
1. محتوى النص (Description)
2. نوع التقرير (Type: paid_late, non-compliance, excellent, issues)
3. اسم الشركة (Company Name)
4. القطاع (Sector)
5. التواريخ (Report Date, Impact Period)
6. الكلمات المفتاحية المستخرجة (Keywords)
```

---

## تحسينات البحث المقترحة:

### البحث الحالي:
```sql
SELECT * FROM companies 
WHERE name ILIKE '%query%' 
OR cr_number ILIKE '%query%'
```

### البحث المحسّن (Knowledge Graph):
```sql
SELECT 
  r.id, r.title, r.description, r.type,
  c.id, c.name, c.trust_score,
  -- درجة المطابقة
  CASE 
    WHEN r.description ILIKE '%query%' THEN 0.95
    WHEN r.type::text ILIKE '%query%' THEN 0.85
    WHEN c.name ILIKE '%query%' THEN 0.90
    ELSE 0.5
  END AS relevance
FROM reports r
JOIN companies c ON r.target_company_id = c.id
WHERE 
  r.search_vector @@ plainto_tsquery('simple', 'query')
  OR c.name ILIKE '%query%'
  OR r.type::text ILIKE '%query%'
  OR r.description ILIKE '%query%'
ORDER BY relevance DESC, r.created_at DESC
LIMIT 20
```

---

## الخطوات التنفيذية:

### 1. تحديث قاعدة البيانات:
```sql
-- إضافة حقل FTS للتقارير
ALTER TABLE reports ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- فهرس FTS
CREATE INDEX IF NOT EXISTS idx_reports_search_vector ON reports USING GIN(search_vector);

-- Trigger لتحديث الـ index
CREATE OR REPLACE FUNCTION update_reports_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    to_tsvector('simple', COALESCE(NEW.title, '')) ||
    to_tsvector('simple', COALESCE(NEW.description, '')) ||
    to_tsvector('simple', NEW.type::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reports_search_vector
BEFORE INSERT OR UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION update_reports_search_vector();
```

### 2. تحديث API Search:
```typescript
// قبل:
export async function searchCompanies(q) {
  // تبحث عن الشركات فقط
}

// بعد:
export async function searchKnowledgeGraph(q) {
  // تبحث في التقارير (المنتجات)
  // وتستخرج الشركات منها
  // ترجع كل النتائج مع درجات المطابقة
}
```

### 3. تحديث UI:
```
نتائج البحث تعرض:
├─ التقارير (مع اسم الشركة)
├─ الشركات (مع عدد التقارير)
└─ الإحصائيات المستخرجة
```

---

## مثال عملي:

**البحث:** "شركات بتأخر الدفع"

**النتائج:**
```
📋 التقارير ذات الصلة:
1. شركة الراجحي — تأخر 45 يوم في السداد (Match: 95%)
2. شركة البناء الحديث — عدم سداد الفواتير (Match: 87%)
3. شركة النقل السريع — تأخر في الالتزام (Match: 78%)

🏢 الشركات المتأثرة:
• الراجحي للمقاولات (3 تقارير عن دفع متأخر)
• البناء الحديث (2 تقارير)
• النقل السريع (1 تقرير)

📊 الإحصائيات:
• إجمالي التقارير: 6
• متوسط التأخير: 38 يوم
• أكثر شركة متأثرة: الراجحي
```

---

## الخلاصة:

**التقارير = منتجات المعرفة**

- البحث ليس عن الشركات
- البحث عن **ماذا قالت التقارير عن الشركات**
- النتائج = التقارير + الشركات المستخرجة من التقارير

**هذا يحول مربع البحث من "بحث بسيط" إلى "محرك معرفة حقيقي"!** 🚀
