#!/usr/bin/env node
/**
 * Does every CSS class the app writes actually exist?
 *
 * Twenty files were written in Tailwind classes — `flex items-center`,
 * `text-red-600`, `animate-spin` — and Tailwind was never built into this
 * project. It sat in package.json with no config file, no PostCSS entry and no
 * import in index.css, so every one of those classes was inert. The sign-in
 * callback, the screen a user lands on between Clerk and their dashboard,
 * rendered as unstyled black text with an invisible spinner: an empty 0×0 div.
 *
 * Sixteen of the twenty were modals nothing imported. The rest were live.
 *
 * `print-only` was the same defect without the framework: TrustReport marks a
 * header with it so a printed report carries the company name, and the class was
 * defined nowhere — so the block showed on screen instead, and print got
 * nothing. A class name is not a style.
 *
 * This checks the whole surface: every className in src must resolve to a rule
 * in the stylesheet.
 *
 *   node scripts/verify-styles-are-real.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const css = readFileSync('src/styles/index.css', 'utf8')
const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))

/**
 * Comments do not render.
 *
 * Without this the check reported `online-indicator` as an undefined class; it
 * sits inside a usage example in a JSDoc block. A check that reads comments
 * reports things that are not there, and the reader learns to ignore it.
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

const used = new Map()
for (const f of walk('src')) {
  const src = codeOnly(readFileSync(f, 'utf8'))
  for (const m of src.matchAll(/className=["']([^"'{}]+)["']/g)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      if (!used.has(cls)) used.set(cls, f)
    }
  }
}

const missing = [...used].filter(([cls]) => !defined.has(cls))
check(missing.length === 0, 'كل صنف CSS مستعمل معرَّف فعلاً في الأنماط',
  missing.map(([c, f]) => `${c} (${f.split('/').pop()})`).join('، '))

// And Tailwind is not half-installed: in package.json but never built, which is
// how the classes came to look intentional.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const declared = !!(pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss)
const wired = existsSync('tailwind.config.js') || existsSync('tailwind.config.ts')
  || /@tailwind|@import\s+["']tailwindcss/.test(css)
check(!declared || wired, 'Tailwind ليس مُعلَناً بلا تركيب',
  'موجود في package.json وغير مبني — أصنافه لا تفعل شيئاً')

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
