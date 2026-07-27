#!/usr/bin/env node
/**
 * Does every hook and component a file uses actually get imported into it?
 *
 * A missing import is not a build error. Vite bundles the file happily and the
 * page throws "X is not defined" the moment it renders — so `npm run build`
 * passing proves the syntax parsed and nothing about whether the screen opens.
 * CompanyShell shipped one minute after a green build with useUserRole called
 * and never imported.
 *
 * ESLint's no-undef would catch this, and should; until it runs in this repo,
 * this is the narrow version: for every name the project exports as a hook or a
 * shared component, find files that call it without importing it.
 *
 * Usage: node scripts/verify-imports.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full)
  }
  return out
}

const files = walk('src')

// The names worth checking: things exported from hooks/ and components/, which
// are what screens forget to import. Not every identifier in the project — a
// list that flags too much gets ignored.
const exported = new Map()
for (const f of files) {
  if (!/[\\/](hooks|components|lib|utils)[\\/]/.test(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    exported.set(m[1], f)
  }
  for (const m of src.matchAll(/export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
    exported.set(m[1], f)
  }
  const def = src.match(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/)
  if (def) exported.set(def[1], f)
}

const problems = []

/**
 * Comments and strings are not code.
 *
 * LimitGate was flagged for calling `can(x)` — in a sentence explaining why the
 * old gate was wrong. A checker that reads prose as calls produces findings
 * nobody can act on, and the cost of that is not the false line: it is that the
 * true ones stop being read.
 */
const stripNonCode = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')

for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  const src = stripNonCode(raw)

  // Imports are read from the raw text: stripping strings empties the module
  // path, and an import statement with no path matches nothing — which made
  // this see zero imports anywhere and flag 271 correct files.
  const imported = new Set()
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const name of m[1].matchAll(/([A-Za-z_$][\w$]*)/g)) imported.add(name[1])
  }
  // Locally defined names are not missing imports.
  for (const m of src.matchAll(/(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) imported.add(m[1])

  // Nor are destructured ones. Missing this called TrustReport broken for
  // `can`, `limitOf` and `remaining` — all three come out of useEntitlements()
  // by destructuring, and a checker that flags correct code teaches people to
  // stop reading it.
  for (const m of src.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) {
    for (const part of m[1].split(',')) {
      // `loading: entLoading` binds the second name, not the first.
      const bound = part.includes(':') ? part.split(':').pop() : part
      const name = bound.replace(/\.\.\./, '').trim().match(/^[A-Za-z_$][\w$]*/)
      if (name) imported.add(name[0])
    }
  }

  // Object properties: `{ getReports: … }`.
  for (const m of src.matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/gm)) imported.add(m[1])

  // Method definitions. `async login(email, password) {` and
  // `private isRetryable(error): boolean {` are declarations, and reading them
  // as calls was the last thing standing between this check and a clean run.
  for (const m of src.matchAll(
    /(?:^|\n)\s*(?:(?:async|private|public|protected|static|get|set|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/g,
  )) imported.add(m[1])

  for (const [name, origin] of exported) {
    if (origin === f) continue
    if (imported.has(name)) continue

    // Called as a bare function, or used as a JSX element. `this.name(` and
    // `obj.name(` are a method on something else, not this import — every
    // remaining flag after comments were excluded was one of those.
    const called = new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, 'm').test(src)
    const asElement = new RegExp(`<${name}[\\s/>]`).test(src)
    if (!called && !asElement) continue

    problems.push({ file: f.replace(/\\/g, '/'), name, origin: origin.replace(/\\/g, '/') })
  }
}

console.log('\n  استيرادات ناقصة — تبني بنجاح وتنهار عند العرض\n')

if (problems.length === 0) {
  console.log('  ✅ كل ما يُستدعى مُستورَد\n')
  process.exit(0)
}

for (const p of problems) {
  console.log(`  ❌ ${p.file}`)
  console.log(`       يستدعي ${p.name} دون استيراده  (من ${p.origin})`)
}
console.log(`\n  ${problems.length} استيراد ناقص\n`)
process.exit(1)
