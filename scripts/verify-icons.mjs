#!/usr/bin/env node
/**
 * Are the icons one set, or twenty-two drawings that happen to sit together?
 *
 * They were the second. Each was drawn at whatever size it was first needed at:
 * eighteen at 20, one at 16, one at 24, and two at 48 — and the sidebar renders
 * them in a row, so the upload icon beside "رفع دفعة" stood more than twice the
 * height of its neighbours. Nothing in a build or a test notices that. A person
 * looking at the sidebar notices immediately, which is how it was found.
 *
 * This checks the properties that make a set read as one: a single default
 * size, one stroke weight, one viewBox, and a size the caller can ask for
 * rather than one baked into the drawing.
 *
 * Usage: node scripts/verify-icons.mjs
 */

import { readFileSync } from 'node:fs'

const src = readFileSync('src/components/icons.jsx', 'utf8')

let failures = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { console.log(`  ❌ ${m}`); failures++ }

const icons = [...src.matchAll(/export const (\w+Icon)\s*=\s*\(([^)]*)\)\s*=>/g)]
console.log(`\n  ${icons.length} أيقونة\n`)

// 1) Every icon takes a size rather than hard-coding one.
const hardCoded = [...src.matchAll(/export const (\w+Icon)[\s\S]*?<svg width="(\d+)"/g)]
hardCoded.length === 0
  ? ok('لا أيقونة بمقاس مكتوب في رسمها')
  : bad(`مقاس ثابت في: ${hardCoded.map((m) => `${m[1]} (${m[2]})`).join('، ')}`)

const withoutSize = icons.filter((m) => !/size\s*=/.test(m[2]))
withoutSize.length === 0
  ? ok('كل أيقونة تقبل مقاساً')
  : bad(`بلا مقاس: ${withoutSize.map((m) => m[1]).join('، ')}`)

// 2) One default, so a row of them lines up without anyone passing anything.
const defaults = [...new Set([...src.matchAll(/size\s*=\s*(\w+)/g)].map((m) => m[1]))]
defaults.length === 1
  ? ok(`مقاس افتراضي واحد (${defaults[0]})`)
  : bad(`أكثر من افتراضي: ${defaults.join('، ')}`)

// 3) One stroke weight. Two weights in one row read as two families.
const strokes = [...new Set([...src.matchAll(/strokeWidth="([\d.]+)"/g)].map((m) => m[1]))]
strokes.length <= 1
  ? ok(`سُمك خط واحد (${strokes[0] || 'بلا'})`)
  : bad(`أكثر من سُمك: ${strokes.join('، ')}`)

// 4) One viewBox, or the same glyph renders at different scales for one size.
const boxes = [...new Set([...src.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]))]
boxes.length === 1
  ? ok(`إطار عرض واحد (${boxes[0]})`)
  : bad(`أكثر من إطار: ${boxes.join('، ')}`)

// 5) An outline set with one filled member looks like a mistake, because it is:
//    AlertIcon was filled, and its own exclamation mark was drawn in the same
//    colour and vanished into it.
const filled = [...src.matchAll(/export const (\w+Icon)[\s\S]*?<svg[^>]*fill=\{color\}/g)]
filled.length === 0
  ? ok('كلها خطّية — لا أيقونة مملوءة تبتلع تفاصيلها')
  : bad(`مملوءة: ${filled.map((m) => m[1]).join('، ')}`)

console.log(failures
  ? `\n  ❌ ${failures} تفاوت\n`
  : '\n  ✅ الأيقونات مجموعة واحدة متّسقة\n')
process.exit(failures ? 1 : 0)
