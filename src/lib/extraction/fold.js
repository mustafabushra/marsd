/**
 * Arabic folding, alone in its own module.
 *
 * It lives here rather than in normalizeText.js because patterns.js needs it
 * too — every label and vocabulary entry in that file is folded at load time so
 * that a rule matches whether it was typed «الرئيسي» or «الرييسي». Putting fold
 * in normalizeText.js and importing it from patterns.js would make the two
 * files circular, and a hard-to-see initialisation order bug is a bad trade for
 * saving a file.
 *
 * That auto-folding is not a nicety. Hand-writing folded Arabic is a trap: the
 * forms differ by one character, both look correct, and a mis-typed label does
 * not error — it silently never matches, and a field is simply never extracted.
 * That exact bug cost a debugging session on «النشاط الرئيسي». Folding the
 * table instead of trusting the typing removes the whole class of it.
 */

const AR_DIGITS = /[٠-٩]/g
const FA_DIGITS = /[۰-۹]/g

/** ٤ → 4. Every downstream number rule assumes ASCII. */
export function toAsciiDigits(s) {
  return String(s)
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(FA_DIGITS, (d) => String(d.charCodeAt(0) - 0x06F0))
}

/** Collapse runs of whitespace without touching the characters themselves. */
export const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * The flattening that must never be stored.
 *
 * Folding hamza and taa-marbuta is how «شركه» matches «شركة» and «جده» matches
 * «جدة». It is also how a company's name would silently change spelling if this
 * string ever escaped, so it stays inside the matchers and out of every result.
 */
export function fold(s) {
  return String(s ?? '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
