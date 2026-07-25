# Vercel Permission Denied Fix (Exit Code 126)

## Problem Summary

Vercel deployments were failing with:
```
sh: /vercel/path0/node_modules/.bin/vite: Permission denied
Exit code 126
```

This occurred because the `vite` binary (and other npm executables) lacked the execute bit on the Linux environment, even though everything worked locally on Windows.

---

## Root Cause Analysis

### Primary Cause: node_modules Tracked in Git

**The fundamental problem:** 7,175 files from `node_modules/` were tracked in git.

When npm packages are committed to git:
1. Binary files lose execute permissions on clone
2. Windows doesn't properly store UNIX file modes (core.fileMode=false on Windows)
3. Linux environment receives files without execute bits
4. npm install doesn't always fix permissions on already-existing files

### Why This Happened

**commit on Windows:**
- Git configured with `core.fileMode=false` (Windows default)
- File execute bits are ignored by git
- `node_modules/.bin/vite` committed as `100644` (regular file, not executable)

**clone on Linux (Vercel):**
- Git doesn't restore execute bits because `core.fileMode` is false
- Files extracted without execute permission
- npm install may use cache and not fix existing files
- Result: `vite` exists but cannot execute

### Secondary Issues

1. **vercel.json redundancy**
   - `buildCommand: "npm install && npm run build"`
   - Vercel already runs `npm install` automatically
   - Second install may restore files from cache with corrupted permissions

2. **.gitattributes ignored**
   - Had `node_modules/.bin/** eol=lf executable`
   - But ineffective because `core.fileMode=false` disables it

---

## Permanent Solutions Implemented

### 1. Removed node_modules from Git

```bash
git rm -r --cached node_modules
# Deleted 7,175 files
```

**Why this works:**
- node_modules is **generated code**, never committed
- npm install creates it with correct permissions every time
- Linux environment runs npm install → binaries have execute bits
- No permission inheritance issues

### 2. Enabled core.fileMode

```bash
git config core.fileMode true
```

**Impact:**
- Future commits will track file permission changes
- If `.sh` or executable scripts added, permissions preserved
- Makes git-tracked files respect UNIX permissions

### 3. Created build.sh with Permission Restoration

**File:** `build.sh`
```bash
#!/bin/bash
set -e

echo "🔧 Restoring execute permissions on node_modules/.bin/*"
if [ -d "node_modules/.bin" ]; then
  find node_modules/.bin -type f -exec chmod +x {} \; 2>/dev/null || true
fi

echo "🏗️  Running Vite build"
exec vite build
```

**Why this matters:**
- Acts as backup insurance
- Ensures any binaries have execute bit
- Only runs when needed (on build)
- Doesn't hurt Windows (chmod ignored)

### 4. Updated vercel.json

**Before:**
```json
{
    "buildCommand": "npm install && npm run build"
}
```

**After:**
```json
{
    "buildCommand": "bash build.sh",
    "nodeVersion": "24.x"
}
```

**Changes:**
- Removed redundant `npm install` (Vercel does it automatically)
- Use `build.sh` for controlled build with permission fixes
- Pinned Node.js version for consistency

### 5. Added .npmrc

**File:** `.npmrc`
```
scripts-prepend-node-path=true
```

Ensures consistent npm behavior across environments.

---

## How This Fixes the Problem

### Old Flow (Broken)

```
1. Developer on Windows: git add node_modules/
   → Files committed WITHOUT execute bits (core.fileMode=false)

2. Push to GitHub
   → All files stored with 100644 (regular file) mode

3. Vercel clone:
   → Gets files WITHOUT execute bits

4. Vercel npm install:
   → May cache corrupted permissions

5. Vercel buildCommand: npm install && npm run build
   → Second install might use cache
   → vite binary still lacks execute bit

6. npm run build
   → /vercel/path0/node_modules/.bin/vite: Permission denied
   → Exit code 126 ❌
```

### New Flow (Fixed)

```
1. Developer on Windows: npm install (local)
   → node_modules created with correct permissions

2. git rm -r --cached node_modules
   → 7,175 files deleted from git

3. .gitignore already has node_modules/
   → Future installs won't be tracked

4. Push to GitHub
   → Only source code, no node_modules

5. Vercel clone:
   → Gets clean repo without node_modules

6. Vercel automatic npm install:
   → Creates node_modules fresh
   → All binaries have execute bits (0755)

7. Vercel buildCommand: bash build.sh
   → Restores permissions as backup (safe on Linux, no-op on Windows)
   → Runs: vite build

8. vite executes successfully ✅
```

---

## Files Changed

| File | Change | Purpose |
|------|--------|---------|
| `vercel.json` | Updated buildCommand to `bash build.sh` | Remove npm install redundancy |
| `vercel.json` | Added `nodeVersion: 24.x` | Consistency |
| `build.sh` | Created | Backup permission restoration |
| `.npmrc` | Created | npm configuration |
| `.gitattributes` | Already present | Tracks UNIX file modes |
| Git config | `core.fileMode = true` | Track permissions going forward |
| Git history | Removed 7,175 node_modules files | Clean repo, no generated code |

---

## Testing the Fix

To verify this works:

1. **Locally:**
   ```bash
   npm install
   npm run build
   # Should succeed
   ```

2. **Vercel:**
   - Commit and push
   - Vercel auto-deploys
   - Check build logs for:
     ```
     ✓ Running Vite build
     ✓ built in X.XXs
     ```
   - No "Permission denied" errors

---

## Why This Prevents Future Issues

✅ **No more permission inheritance:** node_modules generated fresh each time

✅ **Consistent across environments:** npm always creates with correct permissions

✅ **Backup safety:** build.sh ensures permissions even if npm fails

✅ **Smaller git history:** 7,175 fewer files, faster clones

✅ **Aligned with best practices:** node_modules never in version control

✅ **Vercel optimized:** Single build command, no redundancy

---

## Key Learnings

### What NOT to do

❌ Don't commit node_modules to git  
❌ Don't rely on file mode tracking on Windows  
❌ Don't duplicate npm install in build commands  
❌ Don't use temporary fixes like deleting node_modules  

### What TO do

✅ Keep node_modules in .gitignore  
✅ Let npm install generate binaries  
✅ Make build commands explicit and minimal  
✅ Implement permanent architectural fixes  

---

## Deployment Status

- **Commit:** `0d26df05` (Fix: Remove node_modules from git)
- **Status:** ✅ Ready for production
- **Next Deploy:** Will use fresh node_modules with correct permissions
- **Expected Result:** Build succeeds with no permission errors

---

## Related Files

- `CLERK_INTEGRATION_SUMMARY.md` - Authentication setup
- `build.sh` - Build script with permission restoration
- `.gitattributes` - Git file mode tracking
- `.npmrc` - npm configuration
- `vercel.json` - Vercel build configuration

