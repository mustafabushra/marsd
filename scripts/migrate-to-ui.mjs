#!/usr/bin/env node
/**
 * Swap a hand-rolled panel for the <Card> primitive, closing tag and all.
 *
 * A plain text replacement cannot do this. `<div style={card}>` becomes
 * `<Card>` in one line, and its `</div>` — somewhere below, past however many
 * nested divs — stays a `</div>`. Tried once as a bulk replace; eslint answered
 * with «JSX element 'Card' has no corresponding closing tag», which is the good
 * outcome, because the alternative is a file that parses and renders wrong.
 *
 * So this walks forward from each opening and counts depth, the way the parser
 * would, and rewrites the matching close.
 *
 *   node scripts/migrate-to-ui.mjs src/pages/AdminRoster.jsx          # preview
 *   node scripts/migrate-to-ui.mjs src/pages/AdminRoster.jsx --write
 *
 * It does one thing only. Everything else — page titles, empty states, pills —
 * is a judgement about meaning, not a shape, and is done by reading the screen.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) { console.log('usage: migrate-to-ui.mjs <file> [--write]'); process.exit(1) }

let src = readFileSync(file, 'utf8')

/**
 * Where a JSX tag that starts at `at` ends, and whether it closes itself.
 *
 * The `>` cannot be found by searching: `style={{ ... }}` puts braces and
 * comparisons inside the tag. Brace depth is tracked so only a `>` at depth
 * zero counts.
 */
function tagEnd (s, at) {
  let brace = 0
  for (let i = at; i < s.length; i += 1) {
    const c = s[i]
    if (c === '{') brace += 1
    else if (c === '}') brace -= 1
    else if (c === '>' && brace === 0) {
      return { end: i, selfClosing: s[i - 1] === '/' }
    }
  }
  return { end: -1, selfClosing: false }
}

/**
 * The index of the `</div>` that closes the div opening at `from`.
 *
 * Self-closing divs are skipped rather than counted. One `<div … />` — a
 * progress bar's fill — was enough to leave the depth permanently short by one,
 * so the walk ran off the end of the file and rewrote the wrong close. eslint
 * caught it as «no corresponding closing tag», which is the cheap failure; the
 * expensive one would have been a file that still parsed.
 */
function closeOf (s, from) {
  let depth = 0
  let i = from
  while (i < s.length) {
    const open = s.indexOf('<div', i)
    const close = s.indexOf('</div>', i)
    if (close === -1) return -1
    if (open !== -1 && open < close) {
      const { end, selfClosing } = tagEnd(s, open)
      if (end === -1) return -1
      if (!selfClosing) depth += 1
      i = end + 1
      continue
    }
    depth -= 1
    if (depth === 0) return close
    i = close + 6
  }
  return -1
}

// `<div style={card}>` and `<div style={{ ...card, … }}>`, which are the two
// shapes every one of these files settled on.
const PLAIN = /<div style=\{card\}>/
const SPREAD = /<div style=\{\{ \.\.\.card,([^}]*)\}\}>/

let count = 0
for (;;) {
  const plain = src.search(PLAIN)
  const spread = src.search(SPREAD)
  const at = plain === -1 ? spread : spread === -1 ? plain : Math.min(plain, spread)
  if (at === -1) break

  const isSpread = at === spread && spread !== -1 && (plain === -1 || spread < plain)
  const m = src.slice(at).match(isSpread ? SPREAD : PLAIN)
  const openLen = m[0].length
  const close = closeOf(src, at)
  if (close === -1) {
    console.log(`  ! unbalanced at ${at}, stopping`)
    break
  }

  const opening = isSpread ? `<Card style={{${m[1]}}}>` : '<Card>'
  src = src.slice(0, at) + opening + src.slice(at + openLen, close) + '</Card>' + src.slice(close + 6)
  count += 1
}

console.log(`${file}: ${count} panel${count === 1 ? '' : 's'}`)
if (write && count) {
  writeFileSync(file, src)
  console.log('  written')
} else if (count) {
  console.log('  (preview — pass --write)')
}
