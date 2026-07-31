#!/usr/bin/env node
/**
 * Does every property destructured from a hook actually come out of it?
 *
 * CompanyDocumentsSection did this:
 *
 *   const { tenantId } = useUserRole()
 *
 * and useUserRole returns { role, loading, error, isPlatformAdmin,
 * isCompanyAdmin, refresh }. There is no tenantId. So the value was undefined,
 * the effect guarded on it never fired, loading stayed true forever, and the
 * whole documents section rendered nothing — the upload area shipped, deployed,
 * and could not be found because it was never drawn.
 *
 * Nothing caught it. The build does not check this, verify-imports passed
 * because the import was real, and the page threw no error: an undefined
 * variable in a condition is just false. It was found by a person opening a
 * screen and saying the feature was missing.
 *
 * This reads what each local hook actually returns and compares it against what
 * every caller destructures.
 *
 * Usage: node scripts/verify-hook-shape.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(full)
  }
  return out
}

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

// ── what each hook returns ───────────────────────────────────────────────────
// Only the object-literal form, which is what every hook in this project uses.
// A hook returning something computed is skipped rather than guessed at: a
// checker that infers is a checker that invents findings.
const RETURNS = /export\s+function\s+(use[A-Z]\w*)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g
const OBJ_RETURN = /return\s*\{([^}]*)\}/g

const hooks = new Map()
for (const file of walk('src')) {
  const src = stripComments(readFileSync(file, 'utf8'))
  for (const m of src.matchAll(RETURNS)) {
    const [, name, body] = m
    const returns = [...body.matchAll(OBJ_RETURN)]
    if (!returns.length) continue
    const keys = new Set()
    for (const r of returns) {
      for (const part of r[1].split(',')) {
        const k = part.trim().split(':')[0].replace(/^\.\.\./, '').trim()
        // A spread means the shape is not knowable from here; drop the hook
        // rather than report against a partial list.
        if (part.trim().startsWith('...')) { keys.clear(); break }
        if (/^[A-Za-z_$][\w$]*$/.test(k)) keys.add(k)
      }
      if (!keys.size) break
    }
    if (keys.size) hooks.set(name, { keys, file: file.split('\\').join('/') })
  }
}

// A checker that matches nothing reports success. Prove it read something first.
if (hooks.size === 0) {
  console.error('\n  ❌ لم يُقرأ أي خطّاف — الفحص لا يرى شيئاً والنتيجة بلا قيمة\n')
  process.exit(2)
}

// ── what callers destructure ─────────────────────────────────────────────────
const CALL = /const\s*\{([^}]*)\}\s*=\s*(use[A-Z]\w*)\s*\(/g

const findings = []
for (const file of walk('src')) {
  const src = stripComments(readFileSync(file, 'utf8'))
  for (const m of src.matchAll(CALL)) {
    const [, destructured, hookName] = m
    const hook = hooks.get(hookName)
    if (!hook) continue
    for (const part of destructured.split(',')) {
      const raw = part.trim()
      if (!raw || raw.startsWith('...')) continue
      const key = raw.split(':')[0].split('=')[0].trim()
      if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue
      if (hook.keys.has(key)) continue
      findings.push({
        file: file.split('\\').join('/'),
        hook: hookName, key, available: [...hook.keys],
      })
    }
  }
}

console.log(`\n  ${hooks.size} خطّافاً مقروءاً · ${[...hooks.keys()].join(' · ')}\n`)

if (!findings.length) {
  console.log('  ✅ كل خاصية مأخوذة من خطّاف موجودة فيه فعلاً\n')
  process.exit(0)
}

console.log('  خصائص تُؤخذ من خطّاف لا يُعيدها — قيمتها undefined دائماً:\n')
for (const f of findings) {
  console.log(`  ❌ ${f.key} من ${f.hook}()`)
  console.log(`       ${f.file}`)
  console.log(`       المتاح: ${f.available.join(' · ')}\n`)
}
console.log(`  ${findings.length} خاصية غير موجودة\n`)
process.exit(1)
