#!/usr/bin/env node
/**
 * The part of a screen's migration that is not the panel swap.
 *
 * migrate-to-ui.mjs turns `<div style={card}>` into `<Card>` and matches the
 * closing tag. That leaves three things per file, all mechanical and all easy
 * to get wrong by hand across twenty-two files: the import, the headings, and
 * the local constants that are now dead.
 *
 * Every step here refuses unless it is safe. A constant is removed only after
 * checking that nothing still refers to it — several screens declare `card`
 * inside the component and use it on something this codemod does not touch, and
 * deleting it there would break the file for a tidiness nobody asked for.
 *
 *   node scripts/finish-ui-migration.mjs src/pages/AdminLogs.jsx [--write]
 */

import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) { console.log('usage: finish-ui-migration.mjs <file> [--write]'); process.exit(1) }

let src = readFileSync(file, 'utf8')
const before = src
const notes = []

// ===== the import =====
const needs = []
if (/<Card[\s>]/.test(src)) needs.push('Card')
if (/<SectionTitle[\s>]/.test(src) || /<h[23] style=\{h3\}>/.test(src)) needs.push('SectionTitle')

if (needs.length && !/from '\.\.\/ui'/.test(src)) {
  const last = src.lastIndexOf('\nimport ')
  const eol = src.indexOf('\n', last + 1)
  src = src.slice(0, eol) + `\nimport { ${needs.join(', ')} } from '../ui'` + src.slice(eol)
  notes.push(`import { ${needs.join(', ')} }`)
}

// ===== the headings =====
const heads = (src.match(/<h[23] style=\{h3\}>/g) || []).length
if (heads) {
  src = src.replace(/<h([23]) style=\{h3\}>([^<]*)<\/h\1>/g, '<SectionTitle>$2</SectionTitle>')
  notes.push(`${heads} heading${heads === 1 ? '' : 's'}`)
}

// ===== the constants nothing needs any more =====
//
// Matched with leading whitespace allowed: several screens declare these inside
// the component rather than at module scope.
for (const name of ['card', 'h3']) {
  const decl = new RegExp(`^[ \\t]*const ${name} = \\{[^\\n]*\\}[ \\t]*\\n`, 'm')
  if (!decl.test(src)) continue
  const without = src.replace(decl, '')
  // Comments do not count as usage; a mention in prose should not pin a dead
  // constant in place.
  const code = without.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  if (new RegExp(`\\b${name}\\b`).test(code)) {
    notes.push(`${name} still used — kept`)
  } else {
    src = without
    notes.push(`${name} removed`)
  }
}

console.log(`${file}`)
for (const n of notes) console.log(`  · ${n}`)
if (!notes.length) console.log('  · nothing to do')

if (write && src !== before) writeFileSync(file, src)
else if (src !== before) console.log('  (preview — pass --write)')
