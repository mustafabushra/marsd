/**
 * The public entry point.
 *
 *   extractCommercialRegister(rawText) → ExtractionResult
 *
 * Pure: no network, no DOM, no module state, no clock beyond a duration
 * measurement. The same string in gives the same object out, every time, on any
 * machine. Everything that talks to the outside world — Wathq, Supabase, the
 * form — lives outside this file, so the reading logic can be tested on its own
 * and trusted by whatever calls it.
 *
 * ============================================================================
 * The rule that matters most
 * ============================================================================
 * Every returned value must appear verbatim in the cleaned text. Not "look
 * similar to", not "be derivable from" — appear in it. `region` and `sector`
 * are the two declared exceptions, and both are forced to `inferred`.
 *
 * The check runs on every extraction, not only in tests. In development a
 * violation throws, because a value that came from nowhere is a bug that must
 * not be allowed to reach a screen where somebody will believe it. In
 * production the field is dropped instead: a missing field is recoverable by
 * typing, and a wrong one is not.
 */

import { normalizeText } from './normalizeText.js'
import { tokenize } from './tokenize.js'
import { scoreAll, DATE_FIELDS } from './scorers.js'
import { resolveCandidates } from './resolve.js'
import { infer } from './infer.js'
import { THRESHOLD, LABELS } from './patterns.js'

/** Every field the engine can produce, so a caller can enumerate them. */
export const FIELDS = Object.keys(LABELS)

/** Derived rather than read; exempt from the substring rule, always inferred. */
const DERIVED = new Set(['region', 'sector'])

const MAX_INPUT = 50 * 1024

const band = (score) =>
  score >= THRESHOLD.confirmed ? 'confirmed'
    : score >= THRESHOLD.inferred ? 'inferred'
      : 'missing'

const empty = () => ({
  value: null, score: 0, status: 'missing', method: 'none',
  sourceLine: null, sourceIndex: null, alternatives: [],
})

/**
 * @param {string} rawText
 * @returns {{fields: object, meta: {fieldsFound, layoutMode, warnings, durationMs}}}
 */
export function extractCommercialRegister(rawText) {
  const started = Date.now()
  const warnings = []

  const input = String(rawText ?? '')
  if (input.length > MAX_INPUT) warnings.push('input_truncated')

  const doc = normalizeText(input.slice(0, MAX_INPUT))
  const tok = tokenize(doc)
  const cands = scoreAll(doc, tok)
  const { chosen, alternatives } = resolveCandidates(cands)

  for (const d of infer(chosen)) {
    if (!chosen.has(d.field)) chosen.set(d.field, { ...d, lineIndex: null })
  }

  // ---- more than one company in the paste ----------------------------------
  // Two registration numbers, or two differently-named companies, means the
  // person copied a list. One record goes in the form; which one is arbitrary,
  // so the only honest response is to say so.
  const crCount = new Set(cands.filter((c) => c.field === 'cr_number').map((c) => c.value)).size
  const nameCount = new Set(cands.filter((c) => c.field === 'company_name_ar').map((c) => c.value)).size
  if (crCount > 1 || nameCount > 1) warnings.push('multiple_companies_detected')

  // ---- build the result ----------------------------------------------------
  const fields = {}
  for (const field of FIELDS) fields[field] = empty()

  for (const [field, c] of chosen) {
    if (!fields[field]) fields[field] = empty()

    const derived = DERIVED.has(field) || c.inferred

    // The substring rule. A derived value has no source line by definition, so
    // it is exempt — and marked, so nobody mistakes it for something read.
    //
    // A list field is the one composite: its value is its items joined for
    // display, which is not itself a substring of anything. The rule still
    // applies, item by item — the separator is presentation, the items are the
    // claim, and every one of them has to have been read.
    const present = c.parts
      ? c.parts.every((p) => doc.text.includes(p))
      : doc.text.includes(c.value)

    if (!derived && !present) {
      const message = `قيمة غير موجودة في النص: ${field} = «${c.value}»`
      if (import.meta.env?.DEV) throw new Error(message)
      warnings.push('value_not_in_source')
      continue
    }

    const status = derived ? 'inferred' : band(c.score)
    if (status === 'missing') continue

    fields[field] = {
      value: c.value,
      score: c.score,
      status,
      method: c.method,
      sourceLine: c.lineIndex != null ? doc.lines[c.lineIndex] ?? null : null,
      sourceIndex: c.lineIndex ?? null,
      alternatives: alternatives.get(field) ?? [],
      ...(DATE_FIELDS.has(field) && c.date ? { date: c.date } : {}),
      ...(c.parts ? { parts: c.parts } : {}),
    }
  }

  const fieldsFound = Object.values(fields).filter((f) => f.value != null).length
  if (!fieldsFound && doc.lines.length) warnings.push('nothing_recognised')

  return {
    fields,
    meta: {
      fieldsFound,
      layoutMode: tok.layoutMode,
      warnings,
      durationMs: Date.now() - started,
    },
  }
}
