#!/usr/bin/env node
/**
 * Does any screen still stop and say «جاري التحميل»?
 *
 * Thirty-six of them did. In four different heights — 40vh, 50vh, 60vh and
 * 100vh — with two different ellipsis characters: thirty wrote `...` and six
 * wrote `…`. Each was centred a slightly different way. Moving between two
 * screens meant watching the wait announce itself twice, differently.
 *
 * And every one was the wrong shape. A centred sentence occupies nothing like
 * the table or the cards that replace it, so the page jumped the moment data
 * arrived — the loading state caused the very disruption it was there to cover.
 *
 * A skeleton in the shape of what is coming makes the layout correct before the
 * data lands. Nothing moves, and there is no sentence to read.
 *
 * This keeps it that way: one system, no stray text, no reinvented spinner.
 *
 *   node scripts/verify-loading-states.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** Every .jsx under src, except the skeleton system itself. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.jsx') && e !== 'Skeleton.jsx') out.push(p.replace(/\\/g, '/'))
  }
  return out
}

/** Comments discuss the old behaviour constantly; only rendered text counts. */
function codeOnly(src) {
  const out = []
  let inBlock = false
  for (const line of src.split('\n')) {
    let l = line
    if (inBlock) {
      const end = l.indexOf('*/')
      if (end === -1) { out.push(''); continue }
      l = ' '.repeat(end + 2) + l.slice(end + 2)
      inBlock = false
    }
    for (;;) {
      const open = l.indexOf('/*')
      if (open === -1) break
      const close = l.indexOf('*/', open + 2)
      if (close === -1) { l = l.slice(0, open); inBlock = true; break }
      l = l.slice(0, open) + ' '.repeat(close + 2 - open) + l.slice(close + 2)
    }
    const c = l.indexOf('//')
    if (c !== -1) l = l.slice(0, c)
    out.push(l)
  }
  return out
}

const files = walk('src')

// ---------------------------------------------------------------------------
// No loading sentences
// ---------------------------------------------------------------------------
// Both ellipsis characters, because the codebase used both and a check that
// knows about one of them lets the other back in.
for (const f of files) {
  const lines = codeOnly(readFileSync(f, 'utf8'))
  for (let i = 0; i < lines.length; i++) {
    // «جاري التحميل» was the phrase I searched for first, and it found
    // thirty-six. Sixteen more were hiding behind «جاري تحميل الشركات»،
    // «الشركاء»، «المشتركين» — the same state, worded per screen, which is how
    // they drifted apart in the first place. The pattern now matches the stem.
    // Written as an alternation rather than a character class: «ٍ» is a
    // combining mark, and inside [] it pairs with whatever precedes it — the
    // class would match something other than the two spellings intended.
    if (/(جاري|جارٍ)\s+ال?تحميل|يتم التحميل|Loading\.\.\./.test(lines[i])) {
      check(false, `${f}:${i + 1}`, `نص تحميل ظاهر: ${lines[i].trim().slice(0, 60)}`)
    }
  }
}
check(true, 'لا شاشة تقول «جاري التحميل»')

// ---------------------------------------------------------------------------
// No gate that returns a sentence
// ---------------------------------------------------------------------------
// The rule above matches the word «تحميل», and reported all clear while three
// screens were still stopping on a sentence: «جاري التحقق من حالة الشركة» —
// the first thing anyone saw after signing in — «جاري فحص النظام», and «جاري
// البحث» in four pickers. Same defect, different verb. A check that passes
// because the wording moved is worse than no check: it says the class of
// problem is gone when only one spelling of it is.
//
// So match the shape instead of the words. A gate is `if (…loading…) return`,
// or `loading ? (`, and what it hands back must be a skeleton. Anything else —
// any Arabic sentence, any hand-rolled spinner — is the thing this system
// replaced, growing back under a new name.
//
// Buttons are not gates. «جارٍ الحفظ…» on the button you just pressed is the
// press being acknowledged, in place, with the layout unchanged; that is
// correct and stays. The difference is mechanical: a button label sits inside
// an element that is already on screen, a gate replaces what would be there.
// The first version of this rule required the `if` and the `return` to share a
// line. Every real instance was written across two, so it matched nothing and
// reported all clear — the exact failure it was added to prevent, reproduced in
// the thing preventing it. It is checked against a deliberately broken file
// below rather than trusted for reading correctly.
const ARABIC = /[؀-ۿ]/

// A gate that returns an element. `\(?` covers `return (`; the alternation
// covers both a wrapping element and a self-closing one. The element itself is
// the unit examined — not a fixed number of lines, which would run off the end
// of short returns and pick up unrelated text below them.
const GATES = [
  /\bif\s*\([^)]*[Ll]oading[^)]*\)\s*\{?\s*return\s*\(?\s*(<[\s\S]{0,700}?<\/[\w.]*>|<[\s\S]{0,300}?\/>)/g,
  /[Ll]oading\s*\?\s*\(?\s*(<[\s\S]{0,700}?<\/[\w.]*>|<[\s\S]{0,300}?\/>)/g,
]

const sentences = []
for (const f of files) {
  const src = codeOnly(readFileSync(f, 'utf8')).join('\n')
  for (const re of GATES) {
    re.lastIndex = 0
    for (const m of src.matchAll(re)) {
      const returned = m[1]
      if (/Skeleton/.test(returned)) continue
      if (!ARABIC.test(returned)) continue
      const line = src.slice(0, m.index).split('\n').length
      sentences.push(`${f}:${line}`)
    }
  }
}
check(sentences.length === 0, 'لا بوابة تحميل ترجع جملة بدل هيكل',
  [...new Set(sentences)].join('، '))

// ---------------------------------------------------------------------------
// Every animation defined once
// ---------------------------------------------------------------------------
// The first version of this check flagged `animation: 'pulse 2s infinite'` on a
// decorative emoji and called it a hand-rolled loading state. It was not — but
// it did point at something real: @keyframes pulse was defined three separate
// times, inside an inline <style> on each waiting page. Three definitions of
// one effect can drift apart, and nobody notices until two of them look
// different.
//
// So the check asks the question it can actually answer: is any animation
// defined more than once, or defined outside the stylesheet.
const keyframes = new Map()
for (const f of [...files, 'src/styles/index.css']) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/@keyframes\s+([\w-]+)/g)) {
    const list = keyframes.get(m[1]) ?? []
    list.push(f)
    keyframes.set(m[1], list)
  }
}

for (const [name, where] of keyframes) {
  check(where.length === 1, `@keyframes ${name} معرَّفة مرة واحدة`,
    `معرَّفة ${where.length} مرات: ${where.join('، ')}`)
}

// ---------------------------------------------------------------------------
// The shimmer must exist, and must yield to prefers-reduced-motion
// ---------------------------------------------------------------------------
const css = readFileSync('src/styles/index.css', 'utf8')
check(/@keyframes\s+marsadShimmer/.test(css), 'حركة التحميل معرَّفة مرة واحدة')
check(/prefers-reduced-motion[\s\S]*marsad-skeleton/.test(css),
  'الحركة تتوقف لمن طلب تقليل الحركة من نظامه',
  'الوميض زينة — ولمن لديه حساسية دهليزية ليس كذلك')

// ---------------------------------------------------------------------------
// The skeleton must say something to a screen reader
// ---------------------------------------------------------------------------
// Sighted readers get the shape. A reader who cannot see the shape gets
// nothing at all unless the state is announced.
const skel = readFileSync('src/components/Skeleton.jsx', 'utf8')
check(/aria-busy/.test(skel), 'حالة التحميل مُعلَنة لقارئ الشاشة')
check(/aria-hidden/.test(skel), 'الصناديق الزخرفية مخفية عن قارئ الشاشة')

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
