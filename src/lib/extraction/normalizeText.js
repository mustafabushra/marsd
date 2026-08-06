/**
 * Step one of the extraction pipeline: make the text comparable without making
 * it a lie.
 *
 * ============================================================================
 * Two texts, and why there have to be two
 * ============================================================================
 * Matching Arabic needs forgiveness — «جده» has to find «جدة», «ابها» has to
 * find «أبها». But the value written into a company record has to be what the
 * document actually said, not a folded approximation of it. A registry whose
 * company names have had their hamzas stripped is a registry of subtly wrong
 * names.
 *
 * So this produces two parallel views of the same text:
 *
 *   text / lines   — cleaned. Invisible marks, tatweel and diacritics removed,
 *                    Arabic-Indic digits converted. Values are cut from HERE,
 *                    and the anti-invention rule checks against HERE.
 *   folded         — the same lines, additionally flattened for comparison:
 *                    أإآٱ→ا, ى→ي, ة→ه, lowercased. Never returned to anyone.
 *
 * The two arrays are index-aligned: folded[i] is the folded form of lines[i].
 * Every matcher searches `folded` and slices `lines`.
 */

import { NOISE_LINES, NOISE_EXACT } from './patterns.js'
import { fold, squash, toAsciiDigits } from './fold.js'

// Re-exported so callers have one import for the whole normalisation
// step; the implementations live in fold.js because patterns.js needs
// them too and importing them from here would be circular.
export { fold, squash, toAsciiDigits }

/** Bidi controls, the Arabic letter mark, and the zero-width joiners.
 *  Copying from a web page drags these in and they break every regex. */
const INVISIBLE = /[​-\u200F\u202A-\u202E\u2066-\u2069؜﻿]/g

const TATWEEL = /ـ/g
const DIACRITICS = /[ً-ٰٟ]/g

/**
 * The cleaning that is safe to keep.
 *
 * Everything removed here is either invisible or purely decorative, so the
 * result is still the document's own text — which is what makes it legitimate
 * to store. Nothing that changes a letter's identity happens at this stage.
 */
export function cleanText(raw) {
  return toAsciiDigits(
    String(raw ?? '')
      .replace(INVISIBLE, '')
      .replace(TATWEEL, '')
      .replace(DIACRITICS, '')
      .replace(/ /g, ' ')
      .replace(/\r\n?/g, '\n'),
  )
}


/**
 * Is this line chrome rather than content?
 *
 * A pasted page carries its own furniture — the portal's name, the privacy
 * link, the version string. None of it is company data, and all of it is a
 * source of false matches: «منصة الأعمال» contains a word the company-name
 * scorer likes.
 */
function isNoise(folded) {
  if (!folded) return true
  if (NOISE_EXACT.has(folded)) return true
  if (folded.length <= 2 && !/\d/.test(folded)) return true
  return NOISE_LINES.some((re) => re.test(folded))
}

/**
 * @param {string} raw
 * @returns {{ text: string, lines: string[], folded: string[], dropped: number }}
 *   `lines` and `folded` are index-aligned. `text` is the cleaned lines rejoined
 *   — the exact string every returned value must be a substring of.
 */
export function normalizeText(raw) {
  const cleaned = cleanText(raw)

  const lines = []
  const folded = []
  const seen = new Set()
  let dropped = 0

  for (const line of cleaned.split('\n')) {
    // Trim only the ends: interior spacing is a layout signal that the
    // tokenizer uses to tell a two-column row from a sentence.
    const kept = line.replace(/^[\s*|]+|[\s*|]+$/g, '')
    const f = fold(kept)

    if (isNoise(f)) { dropped++; continue }

    // A repeated line is a header echoed by the page, not a second company. It
    // is dropped for matching but counted, so a caller can tell a rich paste
    // from one that was mostly duplication.
    if (seen.has(f)) { dropped++; continue }
    seen.add(f)

    lines.push(squash(kept))
    folded.push(f)
  }

  return { text: lines.join('\n'), lines, folded, dropped }
}
