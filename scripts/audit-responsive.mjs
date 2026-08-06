#!/usr/bin/env node
/**
 * What breaks when the window is narrow?
 *
 * This product is built entirely in inline styles, which cannot carry a media
 * query. Every width is therefore the width at every size unless something in
 * JavaScript changes it, and the places that assume a wide window are invisible
 * until somebody opens the page on a phone.
 *
 * Four shapes account for nearly all of it:
 *
 *   1. a fixed pixel width on something that holds layout — a sidebar, a drawer,
 *      a panel. Wider than a phone means horizontal scrolling of the whole page.
 *   2. `minWidth` above a phone's width, which is the same thing said in a way
 *      that cannot even be squeezed.
 *   3. a grid of three or more columns. Four columns of table across 360px gives
 *      each about ninety pixels, and Arabic does not wrap usefully in ninety.
 *   4. a flex row with no `flexWrap`, so its children shrink past legibility
 *      instead of moving to a second line.
 *
 * Reported per file so the work can be ordered by where users actually are,
 * rather than by whichever file was opened first.
 *
 *   node scripts/audit-responsive.mjs [--list]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LIST = process.argv.includes('--list')

// A phone in portrait. Anything wider than this that cannot shrink will push the
// page sideways.
const PHONE = 380

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.jsx')) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

// What the stylesheet already handles, so this stops reporting solved work.
//
// The first version counted every hazard in the source and kept counting them
// after they were fixed — the corrections live in index.css and in a class, not
// in the style object, so nothing in the file changes. An audit that cannot see
// its own fixes reports the same 197 for ever and is ignored by the second week.
const css = readFileSync('src/styles/index.css', 'utf8')
const WRAPS_ROWS = /max-width:\s*720px[\s\S]*?\[style\*="display: flex"\][\s\S]*?flex-wrap:\s*wrap/.test(css)
const STACKS_GRIDS = /\[style\*="grid-template-columns"\][\s\S]*?grid-template-columns:\s*1fr\s*!important/.test(css)
const HAS_TABLE_CLASS = /\.marsad-table\b/.test(css)

const findings = []
const add = (file, line, kind, text) =>
  findings.push({ file, line, kind, text: text.trim().slice(0, 72) })

for (const file of walk('src')) {
  const src = codeOnly(readFileSync(file, 'utf8'))
  const lines = src.split('\n')

  lines.forEach((raw, i) => {
    const line = raw
    const n = i + 1

    // 1 & 2 — a hard width. `maxWidth` is the opposite of the problem and is
    // skipped; so is anything already paired with a `min(...)` or a percentage,
    // which is a width that knows how to shrink.
    for (const m of line.matchAll(/(?<!max)(?<!Max)\b(width|minWidth)\s*:\s*'(\d+)px'/g)) {
      const px = Number(m[2])
      if (px <= PHONE) continue
      if (/maxWidth|min\(|vw|%/.test(line)) continue

      // A `min-width` inside a scrolling container is the intended pattern, not
      // a fault: it is what keeps a table's columns while the container moves
      // sideways. Four of the five remaining findings were this, written before
      // `marsad-table` existed and doing the same job.
      if (m[1] === 'minWidth' && /overflowX: 'auto'/.test(src)) continue

      // Decoration, positioned out of the flow. A 400px pattern behind a hero
      // cannot push a page it is not part of.
      const near = lines.slice(Math.max(0, i - 5), i + 2).join(' ')
      if (/position: 'absolute'|position: 'fixed'/.test(near)) continue

      add(file, n, m[1] === 'minWidth' ? 'minWidth' : 'width', line)
    }

    // 3 — a grid wide enough to be a table. `auto-fit`/`auto-fill` already
    // reflow, so they are not the problem; a fixed column list is.
    const g = /gridTemplateColumns\s*:\s*[`'"]([^`'"]+)[`'"]/.exec(line)
    if (g && !/auto-fit|auto-fill/.test(g[1])) {
      const cols = g[1].trim().split(/\s+/).length
      // Four or more is a table: it stays readable by keeping its columns and
      // letting the reader move sideways. Three or fewer stacks acceptably,
      // which the stylesheet already does.
      const table = cols >= 4
      // Already solved if the file marks it, or already used the older idiom of
      // an overflowing parent with a min-width child — two tables here did, and
      // the audit was calling them broken.
      const solved = table
        ? (HAS_TABLE_CLASS && /marsad-table/.test(src)) || /overflowX: 'auto'/.test(src)
        : STACKS_GRIDS
      if (cols >= 3 && !solved) add(file, n, `grid${cols}`, line)
    }

    // 4 — a flex row that cannot wrap. Only rows: a column stacks already.
    if (!WRAPS_ROWS
        && /display\s*:\s*'flex'/.test(line)
        && !/flexWrap/.test(line)
        && !/flexDirection\s*:\s*'column'/.test(line)
        && /gap\s*:/.test(line)) {
      add(file, n, 'noWrap', line)
    }
  })
}

const byFile = new Map()
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, [])
  byFile.get(f.file).push(f)
}

const kinds = findings.reduce((a, f) => {
  const k = f.kind.startsWith('grid') ? 'شبكة ثابتة الأعمدة' : {
    width: 'عرض ثابت', minWidth: 'حد أدنى ثابت', noWrap: 'صف لا يلتف',
  }[f.kind]
  a[k] = (a[k] || 0) + 1
  return a
}, {})

console.log('\n  ما تعالجه طبقة الأنماط:')
console.log(`    ${WRAPS_ROWS ? '✅' : '❌'} الصفوف تلتف تحت 720px`)
console.log(`    ${STACKS_GRIDS ? '✅' : '❌'} الشبكات تتكدّس في عمود واحد`)
console.log(`    ${HAS_TABLE_CLASS ? '✅' : '❌'} الجداول تنزلق أفقياً (marsad-table)`)

console.log('\n  ما لا يتحمّل شاشة ضيّقة بعدُ\n')
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
console.log(`  ${String(findings.length).padStart(4)}  الإجمالي · في ${byFile.size} ملف\n`)

const worst = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)
console.log('  الأكثر تأثراً:')
for (const [file, fs] of worst.slice(0, 12)) {
  console.log(`  ${String(fs.length).padStart(4)}  ${file.replace('src/', '')}`)
}

if (LIST) {
  console.log('\n  التفصيل:')
  for (const [file, fs] of worst) {
    console.log(`\n  ${file}`)
    for (const f of fs) console.log(`    ${String(f.line).padStart(5)}  ${f.kind.padEnd(9)} ${f.text}`)
  }
}
console.log('')
