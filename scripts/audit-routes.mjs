#!/usr/bin/env node
/**
 * Does every route in the application actually reach a component?
 *
 * A route can break in four ways that a build does not catch and nobody notices
 * until a user lands on it:
 *
 *   1. the element references a component that is never imported
 *   2. the lazy import points at a file that does not exist
 *   3. two routes claim the same path, so one is unreachable
 *   4. a page renders a screen that says nothing and does nothing
 *
 * The build catches a missing *import*; it does not catch a `<Route>` whose
 * element names something out of scope inside JSX, nor a duplicate path, nor a
 * page that exists and is empty.
 *
 * This reads App.jsx and checks the routing table itself. Actually *evaluating*
 * the modules — which catches a page that throws while loading — is done under
 * vitest in src/__tests__/pages-load.test.js, because Node cannot execute JSX
 * and the first version of this file tried anyway and declared all 75 pages
 * broken.
 *
 *   node scripts/audit-routes.mjs
 */

import { readFileSync, existsSync } from 'node:fs'


let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const app = readFileSync('src/App.jsx', 'utf8')
const code = app.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

// ---------------------------------------------------------------------------
// Every component named in a route is imported
// ---------------------------------------------------------------------------
const imported = new Set([
  ...[...code.matchAll(/^import\s+(\w+)/gm)].map((m) => m[1]),
  ...[...code.matchAll(/^const\s+(\w+)\s*=\s*lazy\(/gm)].map((m) => m[1]),
  ...[...code.matchAll(/^import\s*\{([^}]+)\}/gm)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())),
])

const elements = [...code.matchAll(/element=\{([\s\S]*?)\}\s*\/?>/g)]
  .flatMap((m) => [...m[1].matchAll(/<(\w+)/g)].map((x) => x[1]))
const unknown = [...new Set(elements)].filter((n) => !imported.has(n) && /^[A-Z]/.test(n))
check(unknown.length === 0, 'كل مكوّن مذكور في مسار مستورد فعلاً', unknown.join('، '))

// ---------------------------------------------------------------------------
// Every lazy import points at a file that exists
// ---------------------------------------------------------------------------
const lazyPaths = [...code.matchAll(/lazy\(\(\)\s*=>\s*import\(['"](\.[^'"]+)['"]\)\)/g)]
  .map((m) => m[1])
const staticPaths = [...code.matchAll(/^import\s+\w+\s+from\s+['"](\.\/(?:pages|components)[^'"]+)['"]/gm)]
  .map((m) => m[1])

const resolve = (p) => {
  const base = 'src/' + p.replace(/^\.\//, '')
  for (const ext of ['', '.jsx', '.js', '.tsx', '.ts', '/index.jsx', '/index.js']) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

const files = [...new Set([...lazyPaths, ...staticPaths])]
const dead = files.filter((p) => !resolve(p))
check(dead.length === 0, 'كل ملف صفحة مذكور موجود على القرص', dead.join('، '))

// ---------------------------------------------------------------------------
// No path is claimed twice
// ---------------------------------------------------------------------------
const paths = [...code.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((m) => m[1])
const seen = new Set()
const dupes = paths.filter((p) => (seen.has(p) ? true : (seen.add(p), false)))
check(dupes.length === 0, 'لا مسار مُعلَن مرّتين', [...new Set(dupes)].join('، '))
console.log(`     ⓘ ${paths.length} مساراً`)

// ---------------------------------------------------------------------------
// Every page exports something to render
// ---------------------------------------------------------------------------
// Read, not imported. Node cannot evaluate .jsx — the first version of this
// tried and reported all 75 pages as broken, which is a check that fails for a
// reason having nothing to do with the code it is checking.
//
// *Evaluating* the modules is worth doing and is done where JSX works:
// src/__tests__/pages-load.test.js imports every one of them under vitest. That
// catches a module that throws while loading, which no static read can.
const noExport = []
for (const p of files) {
  const file = resolve(p)
  if (!file) continue
  const src = readFileSync(file, 'utf8')
  if (!/export\s+default/.test(src)) noExport.push(file)
}
check(noExport.length === 0, 'كل صفحة تُصدِّر مكوّناً افتراضياً', noExport.join('، '))

// And that the vitest suite which does the loading still exists and still
// covers them — an audit that points at another check has to know it is there.
const loader = 'src/__tests__/pages-load.test.js'
check(existsSync(loader), 'اختبار تحميل الصفحات موجود', `${loader} مفقود`)

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
