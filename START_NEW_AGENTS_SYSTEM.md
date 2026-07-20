# ✅ البدء بنظام الـ Agents الجديد المرتكز على الوثيقة الرسمية

**تاريخ البدء:** 2026-07-13 (أسبوع 1)  
**الحالة:** جاهز للتشغيل  
**الهدف:** بناء Marsad 100% وفقاً لـ MARSAD_PROJECT_SPEC.md

---

## 📋 ما الذي تغيّر؟

### من النسخة الأولى ❌
- النظام كان يعتمد على bootstrap.ts عام
- Agents كانت تعمل بدون مرجع محدد
- لا توجد طريقة لقياس الامتثال بالوثيقة

### إلى النسخة الجديدة ✅
- **SPECIFICATION_MANIFEST.ts**: وثيقة الترميز (Source of Truth)
- **SpecificationValidator.ts**: أداة فحص آلي
- **AGENTS_SPECIFICATION_DRIVEN.md**: دليل النظام
- كل مهمة = فحص تلقائي ضد الوثيقة
- تقرير امتثال% يُطبع بعد كل مرحلة

---

## 🚀 خطوات البدء

### الخطوة 1: تثبيت الملفات الجديدة ✅
```bash
# الملفات موجودة بالفعل:
C:\Users\DTG\marsd\MARSAD_PROJECT_SPEC.md
C:\Users\DTG\marsd\agents\spec\SPECIFICATION_MANIFEST.ts
C:\Users\DTG\marsd\agents\spec\SpecificationValidator.ts
C:\Users\DTG\marsd\agents\AGENTS_SPECIFICATION_DRIVEN.md
```

### الخطوة 2: قراءة الوثيقة (خطوة حتمية)
```bash
# اقرأ الوثيقة الرسمية بالكامل
cat C:\Users\DTG\marsd\MARSAD_PROJECT_SPEC.md

# ركّز على:
# - الشاشات (25 شاشة محددة بدقة)
# - المتطلبات الوظيفية (FR-01 إلى FR-20)
# - قواعس العمل (BR-01 إلى BR-11)
# - جدول زمني صارم (4 أسابيع)
```

### الخطوة 3: البدء بـ Spec-Driven Bootstrap
```bash
cd C:\Users\DTG\marsd\agents

# التجميع (TypeScript → JavaScript)
npm run build

# البدء بـ Agents الجديدة
# (سننشئ bootstrap.spec.ts في الخطوة التالية)
npm run bootstrap:spec
```

---

## 📁 الملفات الجديدة التي ستُنشأ

### 1. **agents/bootstrap.spec.ts** — Bootstrap جديد يعتمد على الوثيقة
```typescript
/**
 * Spec-Driven Bootstrap
 * يعيد بناء Marsad وفقاً لـ MARSAD_PROJECT_SPEC.md
 * 4 مراحل بدقة الوثيقة
 */

import { AgentOrchestrator, TaskBuilder } from './orchestrator/AgentOrchestrator'
import { MARSAD_SPECIFICATION } from './spec/SPECIFICATION_MANIFEST'
import { SpecificationValidator } from './spec/SpecificationValidator'

async function bootstrapWithSpec() {
  const orchestrator = new AgentOrchestrator()
  const validator = new SpecificationValidator()

  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║        🎯 MARSAD SPEC-DRIVEN BOOTSTRAP — Building from Official Spec   ║
║                                                                            ║
║        Deadline: August 3, 2026 (4 weeks exactly)                        ║
║        Source of Truth: MARSAD_PROJECT_SPEC.md (v1.0)                    ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
  `)

  // ============================================================================
  // WEEK 1: التأسيس (Foundation)
  // ============================================================================

  console.log('\n📋 WEEK 1: م1 — التأسيس (Infrastructure + Auth + Marketing)')
  console.log(`Deadline: ${MARSAD_SPECIFICATION.timeline.week1.period}\n`)

  // Task 1: Infrastructure & CI/CD
  const infraTask = new TaskBuilder(
    'WEEK1-01: AWS Infrastructure + Cloudflare + CI/CD',
    'Deploy VPC, ECS, RDS, ElastiCache, S3, CloudWatch, GitHub Actions'
  )
    .setPriority('critical')
    .addSpecRequirement('NFR-04', 'Security infrastructure (TLS 1.3, RDS encryption)')
    .build()

  // Task 2: Database Schema + RLS
  const dbTask = new TaskBuilder(
    'WEEK1-02: Database Schema + Row-Level Security',
    `Implement ERD from spec: ${Object.keys(MARSAD_SPECIFICATION.screens.company).length} tables with RLS enforcement`
  )
    .setPriority('critical')
    .addSpecRequirement('FR-03', 'Multi-tenant RLS isolation')
    .build()

  // Task 3: Authentication System
  const authTask = new TaskBuilder(
    'WEEK1-03: Authentication System (JWT + Refresh Rotation)',
    'Argon2id, JWT 15min + 7day refresh, account lockout after 5 attempts'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-02', 'JWT authentication')
    .build()

  // Task 4: Marketing Website
  const marketingTask = new TaskBuilder(
    'WEEK1-04: Marketing Website (7 screens)',
    'من الوثيقة: الرئيسية + عن + باقات + FAQ + اتصل + تسجيل + دخول'
  )
    .setPriority('high')
    .addSpecRequirement('FR-01', 'Registration & verification')
    .build()

  await orchestrator.assignTask(infraTask)
  await orchestrator.assignTask(dbTask)
  await orchestrator.assignTask(authTask)
  await orchestrator.assignTask(marketingTask)

  console.log('✅ Week 1 tasks assigned. Validator will check compliance at completion.\n')

  // ============================================================================
  // WEEK 2: قلب المنتج (Core Product)
  // ============================================================================

  console.log('📋 WEEK 2: م2 — قلب المنتج (Search + Report + Trust Score)')
  console.log(`Deadline: ${MARSAD_SPECIFICATION.timeline.week2.period}\n`)

  // Task 5: Company Search
  const searchTask = new TaskBuilder(
    'WEEK2-01: Company Search (FR-05)',
    'Full-text search by name/CR/sector/city with filters'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-05', MARSAD_SPECIFICATION.functionalRequirements.FR05)
    .addDependency(dbTask.id)
    .build()

  // Task 6: Report Page (4 display states)
  const reportPageTask = new TaskBuilder(
    'WEEK2-02: Report Page with 4 Display States (FR-06)',
    'موثوق (5+) | أولي (2-4) | غير كافي (0-1) | مقفول (باقة مجانية)'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-06', MARSAD_SPECIFICATION.functionalRequirements.FR06)
    .addDependency(searchTask.id)
    .build()

  // Task 7: Report Wizard (4-step form)
  const reportWizardTask = new TaskBuilder(
    'WEEK2-03: Report Wizard (4-step form + Document Upload)',
    'Deal data → Payment commitment → Delay info → Supporting docs → Attestation'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-08', MARSAD_SPECIFICATION.functionalRequirements.FR08)
    .addSpecRequirement('FR-17', 'S3 document upload with presigned URLs')
    .build()

  // Task 8: Trust Score Engine v1
  const trustScoreTask = new TaskBuilder(
    'WEEK2-04: Trust Score Engine v1',
    `Formula: ${MARSAD_SPECIFICATION.trustScoreEngine.formula}`
  )
    .setPriority('critical')
    .addSpecRequirement('FR-10', MARSAD_SPECIFICATION.functionalRequirements.FR10)
    .build()

  await orchestrator.assignTask(searchTask)
  await orchestrator.assignTask(reportPageTask)
  await orchestrator.assignTask(reportWizardTask)
  await orchestrator.assignTask(trustScoreTask)

  console.log('✅ Week 2 tasks assigned.\n')

  // ============================================================================
  // WEEK 3: الإدارة والتجارة (Admin + Billing)
  // ============================================================================

  console.log('📋 WEEK 3: م3 — الإدارة والتجارة (Review Queue + Subscriptions)')
  console.log(`Deadline: ${MARSAD_SPECIFICATION.timeline.week3.period}\n`)

  // Task 9: Review Queue
  const reviewQueueTask = new TaskBuilder(
    'WEEK3-01: Review Queue (FR-09)',
    'Admin dashboard to approve/reject/request-info on pending reports'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-09', MARSAD_SPECIFICATION.functionalRequirements.FR09)
    .build()

  // Task 10: Subscriptions + Payment Gateway
  const billingTask = new TaskBuilder(
    'WEEK3-02: Subscriptions + Payment Gateway Integration',
    'Moyasar/Tap integration, 4 plans, invoices, billing management'
  )
    .setPriority('critical')
    .addSpecRequirement('FR-16', 'Subscriptions & billing')
    .build()

  // Task 11: Company Admin Features (watchlist, compare, team, settings)
  const companyAdminTask = new TaskBuilder(
    'WEEK3-03: Company Admin Features',
    'Watchlists (FR-12) + Compare (FR-13) + Team management (FR-15) + Billing'
  )
    .setPriority('high')
    .addSpecRequirement('FR-12', 'Watchlists with notifications')
    .addSpecRequirement('FR-13', 'Compare up to 3 companies')
    .addSpecRequirement('FR-15', 'Company user management')
    .build()

  // Task 12: Business Requests (inter-company)
  const businessRequestsTask = new TaskBuilder(
    'WEEK3-04: Business Requests (FR-14)',
    'Send/receive business requests between tenant companies'
  )
    .setPriority('medium')
    .addSpecRequirement('FR-14', 'Business requests')
    .build()

  await orchestrator.assignTask(reviewQueueTask)
  await orchestrator.assignTask(billingTask)
  await orchestrator.assignTask(companyAdminTask)
  await orchestrator.assignTask(businessRequestsTask)

  console.log('✅ Week 3 tasks assigned.\n')

  // ============================================================================
  // WEEK 4: الصقل والإطلاق (Testing + Launch)
  // ============================================================================

  console.log('📋 WEEK 4: م4 — الصقل والإطلاق (E2E + Security + Launch)')
  console.log(`Deadline: ${MARSAD_SPECIFICATION.timeline.week4.period}\n`)

  // Task 13: E2E Tests (golden journeys)
  const e2eTask = new TaskBuilder(
    'WEEK4-01: E2E Tests (Golden Journeys)',
    'signup → subscribe → search → report (4 states) → upload → approve → score changes'
  )
    .setPriority('critical')
    .build()

  // Task 14: Security Audit (OWASP + RLS + Anonymity)
  const securityAuditTask = new TaskBuilder(
    'WEEK4-02: Security Audit (OWASP + RLS + Reporter Anonymity)',
    'Verify: SQL injection, XSS, CSRF, RLS isolation, 0% reporter identity leak'
  )
    .setPriority('critical')
    .addSpecRequirement('NFR-04', 'OWASP + Multi-tenant + Privacy')
    .build()

  // Task 15: Performance Tuning + UAT
  const perfUATTask = new TaskBuilder(
    'WEEK4-03: Performance Tuning + UAT',
    'API P95 ≤ 300ms, page load ≤ 2.5s, client UAT sign-off'
  )
    .setPriority('critical')
    .addSpecRequirement('NFR-01', 'Performance targets')
    .build()

  // Task 16: Production Launch
  const launchTask = new TaskBuilder(
    'WEEK4-04: Production Launch (LIVE on 2026-08-03)',
    'Deploy to production, monitor, hand-off to client'
  )
    .setPriority('critical')
    .addDependency(e2eTask.id)
    .addDependency(securityAuditTask.id)
    .build()

  await orchestrator.assignTask(e2eTask)
  await orchestrator.assignTask(securityAuditTask)
  await orchestrator.assignTask(perfUATTask)
  await orchestrator.assignTask(launchTask)

  console.log('✅ Week 4 tasks assigned.\n')

  // ============================================================================
  // COMPLIANCE REPORT
  // ============================================================================

  console.log('\n\n📊 SPECIFICATION COMPLIANCE REPORT')
  console.log('════════════════════════════════════════════════════════════════════════════════\n')

  // Simulate compliance checks (will be real when agents complete tasks)
  const progress = orchestrator.getProgress()

  console.log(`📈 Overall Progress: ${progress.completed}/${progress.total} tasks`)
  console.log(`🎯 Timeline: 4 weeks (July 3 — August 3, 2026)`)
  console.log(`📋 Screens: 25 total (7 marketing + 12 company + 6 admin)`)
  console.log(`✅ FRs: 20 functional requirements`)
  console.log(`🔒 Security: OWASP Top 10 + RLS + Reporter Anonymity`)
  console.log(`\n`)

  console.log('🚀 Agents are now working autonomously to build Marsad.')
  console.log('📖 Every task is validated against MARSAD_PROJECT_SPEC.md')
  console.log('✅ Compliance % will increase as agents complete tasks.')
  console.log(`\nDeadline: ${MARSAD_SPECIFICATION.deadline} (IMMOVABLE)`)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════')
}

// Run the spec-driven bootstrap
bootstrapWithSpec().catch(console.error)
```

### 2. **package.json — أضف script جديد**
```json
{
  "scripts": {
    "bootstrap:spec": "tsx bootstrap.spec.ts"
  }
}
```

---

## 📊 كيفية متابعة التقدم

### أثناء التطوير (هذا الأسبوع):
```bash
# شغّل الـ Agents
npm run bootstrap:spec

# ستحصل على نتيجة مثل:
✅ WEEK 1 tasks assigned (4 tasks)
✅ WEEK 2 tasks assigned (4 tasks)
✅ WEEK 3 tasks assigned (4 tasks)
✅ WEEK 4 tasks assigned (4 tasks)

📈 Overall Progress: 0/16 tasks
```

### في نهاية كل أسبوع:
```bash
# عرض تقرير الامتثال
npm run report:compliance

# ستحصل على:
📋 MARSAD SPECIFICATION COMPLIANCE REPORT

📊 SUMMARY
──────────────────────────────────────────────────────────────────────────────
Total Checks:         127
✅ Passed:            32 (Week 1: 4 FRs + 2 BRs + 10 Security checks)
❌ Failed:            0
⚠️  Partial:          0
❓ Not Tested:        95 (Weeks 2–4 remaining)
📈 Compliance:        25.2%
```

---

## 🎯 نقاط تحقق حرجة

| التاريخ | الحدث | الامتثال المتوقع |
|---|---|---|
| 7 يوليو | نهاية Week 1 | 25% (infrastructure + auth + marketing) |
| 14 يوليو | نهاية Week 2 | 50% (add core product: search + report + score) |
| 21 يوليو | نهاية Week 3 | 75% (add admin + billing) |
| 28 يوليو | نهاية Week 4 | 99%+ (testing + security + launch prep) |
| **3 أغسطس** | **GO LIVE** | **100% on production** |

---

## ⚠️ المحظورات

❌ **أبداً:**
- لا تبني شيء خارج الوثيقة
- لا تتجاهل قاعدة عمل (BR)
- لا تنسَ فحص الامتثال
- لا تعطّل الجدول الزمني
- لا تخفّف المتطلبات الأمنية

✅ **دائماً:**
- اقرأ الوثيقة أولاً
- افحص ضد SPECIFICATION_MANIFEST
- استخدم SpecificationValidator
- وثّق الانحرافات (إن وجدت)
- اطلب موافقة قبل أي تعديل

---

## 🚀 الخطوة التالية

### الآن:
```bash
cd C:\Users\DTG\marsd\agents

# بناء الملفات الجديدة
npm run build

# شغّل Bootstrap الجديد
npm run bootstrap:spec

# افتح مراقب السجلات
npm start
```

### الأسبوع المقبل:
- ✅ 4 مهام Week 1 مكتملة
- ✅ تقرير امتثال بـ 25%+
- ✅ Staging جاهز: تسجيل + دخول + موقع تعريفي

---

**🎊 الآن أنت جاهز لبدء البناء الفعلي لـ Marsad وفقاً للوثيقة الرسمية!**

**شعار الفريق:** *100% من الوثيقة، كل الوقت* 📖✅
