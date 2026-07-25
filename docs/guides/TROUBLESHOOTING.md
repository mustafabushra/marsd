# 🔧 Troubleshooting Guide

**When:** Use this if something goes wrong  
**Purpose:** Solve common issues quickly  
**Time:** 5-15 minutes per issue

---

## 📋 Common Issues & Solutions

### Issue 1: "npm install" fails

**Symptoms:**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solutions:**

Try in order:
```bash
# 1. Clear npm cache
npm cache clean --force

# 2. Remove node_modules and lock file
rm -rf node_modules package-lock.json

# 3. Use legacy peer deps (if needed)
npm install --legacy-peer-deps

# 4. If still fails, use yarn
npm install -g yarn
yarn install
```

---

### Issue 2: "npm run build" fails

**Symptoms:**
```
error TS1084: Invalid 'reference' directive syntax
error TS2688: Cannot find type definition file
```

**Solutions:**

```bash
# 1. Check Node version
node --version
# Must be 18.0.0 or higher

# 2. Verify TypeScript installed
npm ls typescript

# 3. Rebuild from scratch
rm -rf dist node_modules package-lock.json
npm install
npm run build

# 4. Check TypeScript config
cat tsconfig.json

# 5. Compile with verbose output
npx tsc --listFilesOnly
```

---

### Issue 3: "npm run bootstrap" doesn't execute

**Symptoms:**
```
command not found: bootstrap
npm ERR! missing script: bootstrap
```

**Solutions:**

```bash
# 1. Verify package.json has script
grep "bootstrap" package.json

# 2. Reinstall dependencies
npm install

# 3. Try running directly
node dist/bootstrap.js

# 4. Check current directory
pwd
# Should be: /path/to/marsd/agents

# 5. Use npm start for interactive mode instead
npm start
```

---

### Issue 4: "Cannot find module 'uuid'"

**Symptoms:**
```
Error: Cannot find module 'uuid'
at Function.Module._load
```

**Solutions:**

```bash
# 1. Install uuid explicitly
npm install uuid

# 2. Verify it's in package.json
grep "uuid" package.json

# 3. Check node_modules
ls node_modules/uuid

# 4. Reinstall all dependencies
npm install

# 5. Verify version
npm ls uuid
# Should show: uuid@^9.0.0
```

---

### Issue 5: TypeScript compilation errors

**Symptoms:**
```
error TS2307: Cannot find module or type definitions
error TS7014: Function file is missing function body
```

**Solutions:**

```bash
# 1. Check all agent files exist
ls -la core/*.ts backend/*.ts frontend/*.ts security/*.ts qa/*.ts orchestrator/*.ts cli/*.ts

# 2. Verify tsconfig.json
cat tsconfig.json

# 3. Check for syntax errors in files
grep -n "export" */BaseAgent.ts

# 4. Compile with strict checking disabled (debug only)
npx tsc --strict false

# 5. Check for missing imports
grep -n "import.*BaseAgent" */*.ts
```

---

### Issue 6: "Agent not found" when running CLI

**Symptoms:**
```
Error: Agent 'BackendEngineer' not found
No agents initialized
```

**Solutions:**

```bash
# 1. Verify all agent files compile
npm run build

# 2. Check dist folder
ls -la dist/

# 3. Verify index.ts exports agents
cat index.ts

# 4. Check AgentOrchestrator.ts initialization
grep -A10 "initializeAgents()" orchestrator/AgentOrchestrator.ts

# 5. Check for circular imports
grep -n "import.*BaseAgent\|export.*BaseAgent" **/*.ts
```

---

### Issue 7: Bootstrap runs but Phase 1 fails

**Symptoms:**
```
Phase 1 failed: Security Audit failed
Error: Critical security items not verified
```

**Solutions:**

```bash
# 1. Check security checklist in BaseAgent
grep -n "securityChecklist" core/BaseAgent.ts

# 2. Verify pre-execution check function
grep -A10 "preExecutionSecurityCheck" core/BaseAgent.ts

# 3. Check if critical items marked as verified
grep -n "requireSecurityCheck.*critical" **/*.ts

# 4. Review SecurityEngineer implementation
cat security/SecurityEngineer.ts

# 5. Run with debug logging
NODE_DEBUG=* npm run bootstrap
```

---

### Issue 8: CLI doesn't respond to commands

**Symptoms:**
```
marsad> build-api
(no response)
```

**Solutions:**

```bash
# 1. Verify CLI script exists
ls -la cli/MarsadCLI.ts

# 2. Check for infinite loops in command handler
grep -n "while.*true\|for.*;" cli/MarsadCLI.ts | head -5

# 3. Verify readline interface created
grep -n "readline.createInterface" cli/MarsadCLI.ts

# 4. Test with simple input
echo "help" | node dist/cli/MarsadCLI.js

# 5. Check event listeners
grep -n "\.on(" cli/MarsadCLI.ts
```

---

### Issue 9: Performance issue - bootstrap too slow

**Symptoms:**
```
Phase 1 taking > 5 seconds
Phase 2 timing out
```

**Solutions:**

```bash
# 1. Check for blocking I/O operations
grep -n "sync\|await.*delay" bootstrap.ts

# 2. Verify parallel execution in orchestrator
grep -n "Promise.all\|Promise.race" orchestrator/AgentOrchestrator.ts

# 3. Check for large file operations
du -sh dist/

# 4. Profile execution
time npm run bootstrap

# 5. Check agent initialization time
grep -n "setTimeout\|setInterval" core/BaseAgent.ts
```

---

### Issue 10: Database connection fails in Phase 2

**Symptoms:**
```
Phase 2 failed: Database Setup failed
Error: Cannot connect to PostgreSQL
```

**Note:** Phase 2 uses MOCK database in Day 1. Real connection on Day 2.

**Solutions:**

```bash
# 1. For Day 1: Bootstrap uses mock data only
# No real database needed yet

# 2. Verify mock data in api.ts
cat src/lib/api.ts

# 3. Check database schema (Prisma)
cat backend/prisma/schema.prisma

# 4. When ready for real DB (Day 2):
docker-compose up -d  # Start PostgreSQL
# Then connect backend to real database
```

---

## 🆘 Getting Help

### Before asking for help, collect:

1. **Error message** (full text)
2. **Environment**
   ```bash
   node --version
   npm --version
   uname -a  # or 'ver' on Windows
   ```

3. **Steps to reproduce**
   ```bash
   # Exact commands you ran
   npm install
   npm run build
   npm run bootstrap
   ```

4. **Logs**
   ```bash
   # Save to file for review
   npm run bootstrap > bootstrap.log 2>&1
   cat bootstrap.log
   ```

---

## 🔄 Recovery Steps

If system is in a bad state:

```bash
# 1. Navigate to agents
cd marsd/agents

# 2. Clean everything
rm -rf dist node_modules package-lock.json

# 3. Reinstall fresh
npm install

# 4. Rebuild
npm run build

# 5. Run with debug
npm run dev

# 6. If still broken, check files exist
ls -la core/BaseAgent.ts
ls -la backend/BackendEngineer.ts
ls -la package.json
ls -la tsconfig.json
```

---

## 🧪 Verification Tests

Run these to verify system health:

```bash
# Test 1: TypeScript compilation
npx tsc --noEmit
# Expected: No output (= success)

# Test 2: All files exist
test -f core/BaseAgent.ts && echo "✓ BaseAgent exists"
test -f backend/BackendEngineer.ts && echo "✓ BackendEngineer exists"
test -f frontend/FrontendEngineer.ts && echo "✓ FrontendEngineer exists"
test -f security/SecurityEngineer.ts && echo "✓ SecurityEngineer exists"
test -f qa/QAEngineer.ts && echo "✓ QAEngineer exists"
test -f orchestrator/AgentOrchestrator.ts && echo "✓ Orchestrator exists"
test -f cli/MarsadCLI.ts && echo "✓ CLI exists"
test -f bootstrap.ts && echo "✓ Bootstrap exists"

# Test 3: Dependencies installed
npm ls uuid
npm ls events
# Should show versions

# Test 4: Package.json valid JSON
cat package.json | python3 -m json.tool
# Expected: No errors

# Test 5: tsconfig.json valid JSON
cat tsconfig.json | python3 -m json.tool
# Expected: No errors
```

---

## 🚨 Critical Issues

### If agents don't initialize:

1. Check BaseAgent.ts has constructor
   ```bash
   grep -n "constructor(" core/BaseAgent.ts
   ```

2. Verify agents extend BaseAgent
   ```bash
   grep "extends BaseAgent" backend/*.ts frontend/*.ts security/*.ts qa/*.ts
   ```

3. Check AgentOrchestrator creates agents
   ```bash
   grep -A20 "initializeAgents()" orchestrator/AgentOrchestrator.ts
   ```

### If security checks fail:

1. Verify security checklist items added
   ```bash
   grep "requireSecurityCheck" **/*.ts | wc -l
   # Should be > 50
   ```

2. Check pre-execution validation
   ```bash
   grep -B5 -A5 "preExecutionSecurityCheck" core/BaseAgent.ts
   ```

3. Verify verification logic
   ```bash
   grep "verifySecurityItem" **/*.ts | wc -l
   # Should be > 30
   ```

---

## 📊 System Health Check

Create file `health-check.sh`:

```bash
#!/bin/bash

echo "=== Marsad Agent System Health Check ==="
echo ""

echo "1. Node.js:"
node --version

echo "2. npm:"
npm --version

echo "3. Files exist:"
test -f agents/core/BaseAgent.ts && echo "   ✓ BaseAgent" || echo "   ✗ BaseAgent MISSING"
test -f agents/package.json && echo "   ✓ package.json" || echo "   ✗ package.json MISSING"
test -f agents/tsconfig.json && echo "   ✓ tsconfig.json" || echo "   ✗ tsconfig.json MISSING"

echo "4. Dependencies:"
cd agents
npm ls uuid 2>/dev/null | head -1

echo "5. TypeScript:"
npx tsc --version

echo "6. Build status:"
test -d dist && echo "   ✓ dist/ exists" || echo "   ✗ dist/ NOT FOUND"

echo ""
echo "=== Health Check Complete ==="
```

Run it:
```bash
bash health-check.sh
```

---

## 📞 When to Escalate

If you've tried all solutions above and still stuck:

1. **Save complete log:**
   ```bash
   npm run bootstrap > full_log.txt 2>&1
   cat full_log.txt  # Review output
   ```

2. **Check file contents:**
   ```bash
   # Show first few lines of each agent
   head -20 core/BaseAgent.ts
   head -20 backend/BackendEngineer.ts
   ```

3. **Verify imports:**
   ```bash
   # Check all imports are correct
   grep "^import" */BaseAgent.ts
   grep "^import" */*.ts | head -10
   ```

---

## ✅ Troubleshooting Checklist

Before declaring "it's broken":

- [ ] Node.js 18+ installed
- [ ] npm cache cleared: `npm cache clean --force`
- [ ] node_modules deleted: `rm -rf node_modules`
- [ ] Fresh install: `npm install`
- [ ] TypeScript rebuilt: `npm run build`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] All files exist: `ls -la */*.ts`
- [ ] package.json valid: `cat package.json | python3 -m json.tool`
- [ ] tsconfig.json valid: `cat tsconfig.json | python3 -m json.tool`

---

**Status:** 🟢 **Troubleshooting Guide Complete**

Most issues are resolved by:
1. Clearing npm cache
2. Deleting node_modules
3. Fresh install
4. Rebuild

If problem persists → Collect logs → Review this guide → Ask for help

---

*Last Updated: 2026-07-13*
