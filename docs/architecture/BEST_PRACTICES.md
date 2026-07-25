# 🏆 Best Practices for Marsad Development

**Purpose:** Guidelines for working with the agent system  
**Audience:** Developers, QA, DevOps  
**Last Updated:** 2026-07-13

---

## 🔐 Security First (Always)

### Rule 1: Never Skip Security Checks
```typescript
// ❌ WRONG - Bypasses security
if (urgent) {
  executeWithoutVerification()
}

// ✅ RIGHT - Always verify
await preExecutionSecurityCheck(task)
await executeTask(task)
await postExecutionSecurityCheck(task)
```

### Rule 2: All Input is Untrusted
```typescript
// ❌ WRONG - Trusts user input
const result = database.query("SELECT * FROM users WHERE id = " + userId)

// ✅ RIGHT - Uses parameterized queries
const result = await prisma.user.findUnique({ where: { id: userId } })
```

### Rule 3: Never Log Secrets
```typescript
// ❌ WRONG - Logs password
console.log(`User logged in with password: ${password}`)

// ✅ RIGHT - No sensitive data
console.log(`User ${email} logged in successfully`)
```

### Rule 4: Validate at Boundaries
```typescript
// ❌ WRONG - No validation
const processData = (data) => {
  return transform(data)  // Assumes valid input
}

// ✅ RIGHT - Validate at entry point
const processData = (data) => {
  if (!validateInputSecurity(data, 'processData')) {
    throw new Error('Invalid input')
  }
  return transform(data)
}
```

---

## 🎯 Task Creation

### Rule 1: Always Include Security Checklist
```typescript
// ❌ WRONG - No security
const task = new TaskBuilder('API Endpoint', 'Search feature')
  .build()

// ✅ RIGHT - Comprehensive security
const task = new TaskBuilder('API Endpoint', 'Search feature')
  .setPriority('critical')
  .addSecurityCheck('injection', 'SQL Injection Prevention', 'critical')
  .addSecurityCheck('multi-tenant', 'Tenant Isolation', 'critical')
  .addSecurityCheck('auth', 'JWT Verification', 'critical')
  .addSecurityCheck('logging', 'No Secrets Logged', 'high')
  .build()
```

### Rule 2: Set Correct Priority
- **critical**: Must complete before next phase
- **high**: Important, but can proceed in parallel
- **medium**: Nice to have, low impact
- **low**: Documentation, polish

### Rule 3: Specify Dependencies
```typescript
// When task depends on another
const task = new TaskBuilder('Admin Panel', 'Review queue')
  .addDependency(backendTaskId)  // Won't execute until backend done
  .build()
```

---

## 🤖 Agent Development

### Rule 1: Follow the Lifecycle
Every agent task executes in this order:
1. Create task with security checklist
2. Pre-execution security check (blocks if critical items unverified)
3. Execute task logic (agent implements)
4. Post-execution security verification
5. Audit log recorded (immutable)

### Rule 2: Implement executeTaskLogic()
```typescript
// Every agent must implement this
protected async executeTaskLogic(task: AgentTask): Promise<void> {
  if (task.title.includes('feature-type')) {
    await this.implementFeature(task)
  } else {
    await this.genericTask(task)
  }
}

private async implementFeature(task: AgentTask): Promise<void> {
  // 1. Add security checks to task
  task.securityChecklist.push(
    this.requireSecurityCheck('category', 'requirement', 'critical')
  )

  // 2. Implement feature

  // 3. Mark items verified with evidence
  await this.verifySecurityItem(item, 'Evidence of verification')
}
```

### Rule 3: Use Agent Communication
```typescript
// Ask other agents for help
const response = await this.requestHelp(
  [securityEngineer, qaEngineer],
  'Is this implementation OWASP-compliant?'
)
```

### Rule 4: Log Appropriately
```typescript
// Good logging
this.logInfo('Processing company search')
this.logInfo('✓ Security checks passed')
this.logInfo('✗ Failed due to permission denied')

// Bad logging
console.log('User data: ' + userData)  // Logs sensitive data
```

---

## 🔍 Code Review Checklist

Before marking task complete, verify:

### Security
- [ ] No SQL injection possible (parameterized queries)
- [ ] No XSS vulnerability (React.createElement, no innerHTML)
- [ ] No CSRF attack (SameSite cookies)
- [ ] No SSRF attack (whitelist URLs)
- [ ] No secrets in logs
- [ ] Tenant isolation verified
- [ ] JWT validated on protected endpoints
- [ ] Rate limiting considered

### Quality
- [ ] Code is readable and self-documenting
- [ ] No hardcoded values (use config)
- [ ] Error handling appropriate (not swallowing errors)
- [ ] Performance acceptable (< 500ms for APIs)
- [ ] No console.logs in production code

### Testing
- [ ] Unit tests pass (if applicable)
- [ ] Integration tests pass
- [ ] Security tests pass
- [ ] Happy path tested
- [ ] Error cases handled

---

## 📝 Commit Message Guidelines

Format:
```
type: subject

body (optional)

Security Implications:
- None, or list any security changes
```

Types:
- `feat:` New feature
- `fix:` Bug fix
- `security:` Security improvement
- `docs:` Documentation
- `refactor:` Code reorganization
- `test:` Tests only

Examples:
```
feat: Implement POST /companies/search with SQL injection prevention

Adds full-text search using Prisma parameterized queries.
Includes tenant isolation validation.

Security Implications:
- Parameterized queries prevent SQL injection
- Tenant_id validated on every query
```

```
security: Enforce HTTPS/TLS 1.3 in production

Update CORS policy to only allow HTTPS.
Disable HTTP in production environment.

Security Implications:
- All data now encrypted in transit
- Man-in-the-middle attacks prevented
```

---

## 🧪 Testing Standards

### Unit Tests
```typescript
// Test each function independently
describe('trustScoreEngine', () => {
  it('should calculate correct score', () => {
    const score = computeTrustScore({ /* data */ })
    expect(score).toBe(75)
  })

  it('should prevent division by zero', () => {
    const score = computeTrustScore({ reports: [] })
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
```

### Integration Tests
```typescript
// Test components working together
describe('search flow', () => {
  it('should search companies and return with trust scores', async () => {
    const results = await search('نجد')
    expect(results).toHaveLength(3)
    expect(results[0]).toHaveProperty('trustScore')
  })

  it('should enforce gating on مجاني plan', async () => {
    const results = await search('company', 'مجاني')
    expect(results).toHaveLength(0)  // No results for free tier
  })
})
```

### Security Tests
```typescript
// Test security measures
describe('security', () => {
  it('should prevent SQL injection', async () => {
    const malicious = "'; DROP TABLE users; --"
    const results = await search(malicious)
    expect(results).toEqual([])  // No error, no data leak
  })

  it('should prevent cross-tenant access', async () => {
    const tenant2Data = await getTenantData('tenant2', 'tenant1-auth-token')
    expect(tenant2Data).toBeNull()  // Access denied
  })
})
```

---

## 📊 Performance Guidelines

### API Response Times
- Search: < 500ms
- Trust score: < 200ms
- Report submission: < 1s
- General API: < 100ms

### Database Queries
- Use indexes for frequently queried fields
- Avoid N+1 queries
- Paginate large result sets
- Use RLS policies (they're cheap)

### Frontend Performance
- Bundle size: < 100 kB gzipped
- Time to interactive: < 3s
- Lighthouse score: > 80

### Memory
- Agent audit log: Auto-truncate at 10K entries
- Task queue: Process tasks as completed (don't accumulate)
- Agent memory: Clean up old conversations

---

## 🚨 Common Mistakes to Avoid

### ❌ Mistake 1: Trusting User Input
```typescript
// WRONG - User can inject SQL
database.query(`SELECT * FROM companies WHERE name = '${userInput}'`)

// RIGHT - Use parameterized queries
await prisma.company.findMany({ where: { name: userInput } })
```

### ❌ Mistake 2: Logging Secrets
```typescript
// WRONG
console.log('Auth token:', token)

// RIGHT
console.log('User authenticated successfully')
```

### ❌ Mistake 3: Hardcoded Credentials
```typescript
// WRONG
const dbUrl = 'postgresql://user:password@localhost'

// RIGHT
const dbUrl = process.env.DATABASE_URL
```

### ❌ Mistake 4: Bypassing Security for Speed
```typescript
// WRONG
if (isUrgent) {
  skipSecurityCheck()
  executeTask()
}

// RIGHT - Always verify
preExecutionSecurityCheck()  // Non-negotiable
executeTask()
```

### ❌ Mistake 5: Custom Encryption
```typescript
// WRONG - Implement crypto from scratch
const encrypted = customEncrypt(data)

// RIGHT - Use proven libraries
const encrypted = await crypto.subtle.encrypt(...)
```

---

## ✅ Good Patterns

### Pattern 1: Defensive Programming
```typescript
// Assume nothing, verify everything
if (!user) throw new Error('User not found')
if (!user.tenantId) throw new Error('Tenant not assigned')
if (user.tenantId !== req.user.tenantId) throw new Error('Tenant mismatch')
```

### Pattern 2: Early Returns
```typescript
// Exit early on validation failure
if (!input) return null
if (!hasPermission) return unauthorized()
// Continue with happy path
```

### Pattern 3: Structured Logging
```typescript
this.logInfo('Security check passed')
this.logAudit('SECURITY_VERIFIED', 'SQL Injection prevention verified')
// Not: console.log('ok')
```

### Pattern 4: Explicit Error Messages
```typescript
// Good
throw new Error('Cannot create report: User not authorized to edit this company')

// Bad
throw new Error('Error')
```

---

## 📚 Documentation Expectations

Every feature should have:
1. **What:** What does this feature do?
2. **Why:** Why is it needed?
3. **How:** How to use it (example)?
4. **Security:** What security measures are in place?

Example:
```
## Trust Score Engine

**What:** Calculates reliability score for companies

**Why:** Helps users assess business risk

**How:**
```typescript
const score = await getTrustScore('company-id')
```

**Security:**
- Uses Prisma parameterized queries (no SQL injection)
- Validates tenant ownership (no data leakage)
- Caches scores (prevents DoS attacks)
```

---

## 🎯 Code Quality Standards

Use linter (if applicable):
```bash
# Check code style
npm run lint

# Format code
npm run format
```

TypeScript compilation should be error-free:
```bash
npx tsc --noEmit
```

No warnings:
```bash
npm audit
# Should show 0 vulnerabilities
```

---

## 🚀 Deployment Checklist

Before deploying to production:

Security:
- [ ] HTTPS/TLS enabled
- [ ] No secrets in code
- [ ] All security tests pass
- [ ] Database RLS enforced
- [ ] Audit logging enabled

Performance:
- [ ] Load tests passed
- [ ] Response times acceptable
- [ ] Database queries optimized
- [ ] Bundle size < 100KB

Monitoring:
- [ ] Error tracking enabled (Sentry)
- [ ] Performance monitoring active (New Relic)
- [ ] Alerts configured
- [ ] Logs aggregated (CloudWatch)

---

## 📞 When in Doubt

Ask these questions:

1. **Is this secure?** Run through OWASP checklist
2. **Is this performant?** Measure before committing
3. **Is this tested?** Do tests cover happy + error paths
4. **Is this documented?** Would someone else understand?
5. **Is this maintainable?** Can future developers extend it?

If answer is "no" to any → Fix before committing

---

## 🎓 Key Principles

```
Security First
  ↓
Code Quality
  ↓
Performance
  ↓
Documentation
  ↓
Production Ready
```

Every decision should ladder up to these principles.

---

**Remember:** Quality is not optional. Security is not negotiable. Test everything.

Marsad is a $7,000-$10,000 premium platform. Code should reflect that. ✨
