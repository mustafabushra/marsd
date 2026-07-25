# 🚀 خطة بدء Backend بسرعة
## Backend Startup Plan — من الآن إلى آخر الأسبوع

**الهدف:** إنهاء 80% من Backend بنهاية الأسبوع 1 (10 يوليو)

**المسؤول:** Backend Developer  
**الموعد:** 7 أيام (3–10 يوليو)

---

## ⏰ الجدول الزمني اليومي

### **اليوم 1 (الخميس 3 يوليو)**
**المهمة:** Setup + Architecture

```bash
# 1. Setup NestJS project
npm create nest-app marsad-api
cd marsad-api

# 2. Install essential packages
npm install @prisma/client prisma
npm install bcryptjs jsonwebtoken
npm install redis
npm install class-validator class-transformer

# 3. Setup Prisma
npx prisma init

# 4. Create folder structure
src/
├── modules/
│   ├── auth/
│   ├── companies/
│   ├── reports/
│   ├── trust-score/
│   ├── subscriptions/
│   └── admin/
├── common/
│   ├── guards/
│   ├── interceptors/
│   └── filters/
├── queue/ (BullMQ)
└── utils/
```

**الإنجاز:** 3 ساعات  
**معايير النجاح:**
- ✅ NestJS تطبيق يعمل
- ✅ Prisma مثبت ومهيأ
- ✅ Folder structure جاهز

---

### **اليوم 2 (الجمعة 4 يوليو)**
**المهمة:** Database Schema Complete

```prisma
// prisma/schema.prisma — يجب أن ننتهي من:

model Tenant {
  id                  String    @id @default(cuid())
  name                String
  cr_number           String    @unique
  status              String    // active, suspended
  created_at          DateTime  @default(now())
  // ... 7 fields total
}

model User {
  id                  String    @id @default(cuid())
  tenant_id           String
  email               String    @unique
  password_hash       String
  role                String    // admin, manager, member
  // ... 10 fields total
}

model Company {
  id                  String    @id @default(cuid())
  name                String
  cr_number           String
  sector              String
  city                String
  founded_year        Int
  cr_status           String    // active, inactive
  source              String    // official, community
  approved            Boolean   @default(false)
  created_at          DateTime  @default(now())
  // ... 15 fields total
}

model Report {
  id                  String    @id @default(cuid())
  reporter_tenant_id  String    @map("reporter_tenant_id")
  target_company_id   String
  status              String    // pending, review, approved, rejected
  deal_amount_range   String
  payment_commitment  String
  delay_days          Int?
  defaulted           Boolean?
  dealt_at            DateTime
  submitted_at        DateTime  @default(now())
  // ... 20 fields total
}

model TrustScore {
  id                  String    @id @default(cuid())
  company_id          String    @unique
  score               Int       // 0-100
  risk_band           String    // green, orange, red
  tier                String    // full, preliminary, none, locked
  approved_reports_count Int
  breakdown           Json      // detailed calculation
  computed_at         DateTime  @default(now())
}

model AuditLog {
  id                  String    @id @default(cuid())
  actor_id            String
  action              String
  entity              String
  entity_id           String
  meta                Json
  ip                  String
  created_at          DateTime  @default(now())
  @@index([created_at])
}

// ... 11 more tables (subscriptions, invoices, reports, notifications, etc.)
```

**الإنجاز:** 4 ساعات  
**معايير النجاح:**
- ✅ جميع 17 جدول محدود
- ✅ Relations صحيحة
- ✅ RLS policies placeholder جاهز

---

### **اليوم 3 (السبت 5 يوليو)**
**المهمة:** Authentication Module

```typescript
// src/modules/auth/auth.service.ts

@Injectable()
export class AuthService {
  // 1. Register company
  async register(dto: RegisterDto) {
    // Validate CR number
    // Hash password with Argon2id
    // Create tenant + admin user
    // Return JWT
  }

  // 2. Login
  async login(email: string, password: string) {
    // Verify password
    // Generate JWT (15 min) + Refresh (7 days)
    // Return tokens
  }

  // 3. Refresh token
  async refresh(refreshToken: string) {
    // Validate refresh token
    // Generate new access token
    // Rotate refresh token
  }

  // 4. Validate JWT
  async validateToken(token: string) {
    // Verify signature
    // Check expiration
    // Return payload
  }
}

// src/modules/auth/auth.controller.ts
@Controller('auth')
export class AuthController {
  @Post('register')
  register(@Body() dto: RegisterDto) { }

  @Post('login')
  login(@Body() dto: LoginDto) { }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) { }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) { }
}
```

**الإنجاز:** 4 ساعات  
**معايير النجاح:**
- ✅ JWT implementation
- ✅ Password hashing
- ✅ Token rotation

---

### **اليوم 4 (الأحد 6 يوليو)**
**المهمة:** Core API Endpoints (Part 1)

```typescript
// src/modules/companies/companies.controller.ts

@Controller('companies')
export class CompaniesController {
  // FR-05: Company search
  @Get()
  search(
    @Query('q') query: string,
    @Query('sector') sector: string,
    @Query('city') city: string,
    @Query('page') page: number = 1
  ) { }

  // FR-06: Company report (with gating)
  @Get(':id/report')
  getReport(@Param('id') id: string) {
    // Check subscription tier
    // Return report with correct tier (full/prelim/none/locked)
  }

  // FR-07: Request add company
  @Post()
  requestAddCompany(@Body() dto: AddCompanyDto) { }

  // FR-13: Compare companies
  @Get('/compare')
  compareCompanies(@Query('ids') ids: string[]) { }
}

// src/modules/reports/reports.controller.ts

@Controller('reports')
export class ReportsController {
  // FR-08: Submit report (4-step wizard)
  @Post()
  submitReport(@Body() dto: SubmitReportDto) { }

  // FR-09: Get reports for review (admin)
  @Get('/admin/review-queue')
  getReviewQueue(
    @Query('page') page: number,
    @Query('status') status: string
  ) { }

  // FR-09: Approve/reject report
  @Post(':id/approve')
  approveReport(@Param('id') id: string) {
    // Mark as approved
    // Trigger trust score recalculation
  }

  @Post(':id/reject')
  rejectReport(@Param('id') id: string, @Body() dto: RejectDto) { }
}
```

**الإنجاز:** 5 ساعات  
**معايير النجاح:**
- ✅ 10 endpoints implemented (stubs ok)
- ✅ Request/response DTOs
- ✅ Basic routing

---

### **اليوم 5 (الإثنين 7 يوليو)**
**المهمة:** Trust Score Engine + Background Jobs

```typescript
// src/modules/trust-score/trust-score.engine.ts

export class TrustScoreEngine {
  // FR-10: Calculate trust score
  async calculateScore(companyId: string): Promise<TrustScore> {
    const reports = await this.getApprovedReports(companyId)
    const officialData = await this.getOfficialData(companyId)

    // Formula: TrustScore = W_official × S_official + W_community × S_community
    const score = this.computeFormula({
      official: officialData,
      community: reports,
      weights: { official: 0.30, community: 0.70 }
    })

    // Store in cache + database
    await this.saveTrustScore(companyId, score)

    // Notify watchers
    await this.notifyWatchers(companyId)

    return score
  }

  private computeFormula(data: any): number {
    // Implement exact formula from MARSAD_SPECIFICATION
    // S_official = 50% registry + 30% age + 20% completeness
    // S_community = weighted average with recency decay
    // Apply cap (15% per report)
    // Clamp to 0-100
  }
}

// src/queue/processors/score-recompute.processor.ts

@Processor('score-recompute')
export class ScoreRecomputeProcessor {
  @Process()
  async handleScoreRecompute(job: Job<{ companyId: string }>) {
    const { companyId } = job.data
    await this.trustScoreEngine.calculateScore(companyId)
  }
}
```

**الإنجاز:** 4 ساعات  
**معايير النجاح:**
- ✅ Trust score formula implemented
- ✅ BullMQ queue setup
- ✅ Score calculation working

---

### **اليوم 6 (الثلاثاء 8 يوليو)**
**المهمة:** RLS + Authorization

```sql
-- Enable RLS on all tenant-specific tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- ... for all tables with tenant_id

-- RLS Policy: Users can only see their own tenant's data
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ... repeat for all tenant-specific tables
```

```typescript
// src/common/middleware/tenant.middleware.ts

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract tenant_id from JWT
    const tenantId = req.user?.tenantId

    // Set LOCAL variable for RLS
    // SET LOCAL app.tenant_id = 'uuid-here'

    // This ensures database-level isolation
    // Even if app code is buggy, DB won't leak data

    next()
  }
}

// src/common/guards/rbac.guard.ts

@Injectable()
export class RbacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    // Check role-based permissions
    const requiredRoles = Reflect.getMetadata('roles', context.getHandler())
    return requiredRoles.includes(user.role)
  }
}
```

**الإنجاز:** 3 ساعات  
**معايير النجاح:**
- ✅ RLS policies enabled
- ✅ Middleware setting tenant context
- ✅ RBAC guard working

---

### **اليوم 7 (الأربعاء 9 يوليو)**
**المهمة:** Integration Test + Documentation

```typescript
// src/modules/auth/auth.integration.spec.ts

describe('Auth Integration', () => {
  it('should register new company and return JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        company_name: 'Test Co',
        cr_number: '1234567890',
        admin_email: 'admin@test.com',
        password: 'SecurePass123'
      })

    expect(response.status).toBe(201)
    expect(response.body.access_token).toBeDefined()
  })

  it('should not allow cross-tenant data access', async () => {
    // Tenant A tries to access Tenant B data
    // Should fail at RLS level
  })
})

// src/modules/trust-score/trust-score.spec.ts

describe('Trust Score Calculation', () => {
  it('should calculate score as per formula', () => {
    const score = engine.calculateScore({
      official: { registry: 100, age: 80, completeness: 90 },
      community: [/* reports */]
    })

    // Should match MARSAD_SPECIFICATION formula
    expect(score).toBe(expectedValue)
  })

  it('should apply 15% cap per report', () => {
    // Even if one report is 100, max contribution is 15%
  })
})
```

**الإنجاز:** 3 ساعات  
**معايير النجاح:**
- ✅ Integration tests passing
- ✅ README with setup instructions
- ✅ API docs generated

---

## ✅ معايير نهاية الأسبوع (10 يوليو)

**يجب أن تكون جميع هذه جاهزة:**

- ✅ NestJS application running
- ✅ PostgreSQL + Prisma schema (17 tables)
- ✅ Authentication module working
- ✅ 20 API endpoints (stubs + 10 implemented)
- ✅ Trust Score Engine v1
- ✅ RLS policies enabled
- ✅ RBAC implemented
- ✅ Background jobs (BullMQ)
- ✅ Integration tests passing
- ✅ Docker image buildable

**Compliance Check:**
- ✅ كل جدول من ERD الموجود
- ✅ كل endpoint من FR-list الموجود
- ✅ Security basics (RLS + JWT) شغالة

---

## 🎯 الترتيب الأولوي

### Critical (Must Complete)
1. NestJS + Prisma schema
2. Authentication (JWT)
3. Database + RLS
4. Core 10 endpoints
5. Trust Score Engine

### High (Should Complete)
6. RBAC guards
7. BullMQ integration
8. Integration tests
9. Documentation
10. Docker setup

### Medium (Nice to Have)
11. Advanced error handling
12. Performance optimization
13. Advanced logging

---

## 🔧 التعاون مع Frontend Developer

**يوم 5 (7 يوليو):**
- Frontend developer starts integration
- Uses mock API first
- Replaces with real endpoints as they're ready

**يوم 7 (9 يوليو):**
- Full integration testing
- Frontend + Backend together
- End-to-end flows tested

---

## ⚠️ نقاط حرجة

**لا تنسَ:**
1. ✅ استخدم SPECIFICATION_MANIFEST في كل endpoint
2. ✅ فعّل RLS من البداية (لا تضيفه لاحقاً)
3. ✅ لا تكتب أي query بدون parameterized (Prisma يفعل هذا)
4. ✅ كل database change = migration
5. ✅ كل API response = مرّره من serializer (لا تسرّب reporter ID)

---

## 🚀 ابدأ الآن!

```bash
# اليوم (3 يوليو)
npm create nest-app marsad-api
cd marsad-api
npm install @prisma/client prisma bcryptjs jsonwebtoken

# أنت بدأت الآن ✅
# 7 أيام = Backend 80% complete
# 21 يوم = Backend + Frontend + Deployment DONE
```

**الموعد النهائي: 3 أغسطس 2026 (غير قابل للتحديث)**

