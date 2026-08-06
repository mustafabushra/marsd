/**
 * Turn cleaned lines into labelled pairs and leftovers, and work out which
 * layout the text is in.
 *
 * ============================================================================
 * The two layouts, and why the second one exists
 * ============================================================================
 * A certificate prints «رقم السجل التجاري: 4030304834» — label and value on one
 * line, self-contained, order-independent. That is `inline`, and it is easy.
 *
 * Copying a rendered web page usually does not give you that. The portal lays
 * its fields out in a table, and the clipboard flattens the table column by
 * column: every label first, then every value.
 *
 *     اسم المنشأة
 *     رقم السجل
 *     المدينة
 *     مجموعة ظهران التجارية
 *     4030304834
 *     جدة
 *
 * Read line-by-line this is meaningless. Read as two aligned blocks it is three
 * perfect pairs. That is `column`, and recovering it is the difference between
 * this feature working on a real paste and not.
 *
 * ============================================================================
 * What "do not depend on line order" can and cannot mean
 * ============================================================================
 * Column recovery is *made of* order — «N labels followed by N values» is a
 * statement about sequence. The rule this module actually honours is the one
 * that can be honoured: **no rule depends on a line's absolute position.**
 * Nothing here cares that a line is the 4th or the 40th. Adjacency is used only
 * inside a block this function has detected and reported, so a caller always
 * knows when an ordering assumption was made and can weigh it accordingly.
 */

import { ALL_LABELS, LABEL_SET, INLINE_SEPARATOR, SCORE } from './patterns.js'
import { fold, squash } from './fold.js'

/** Strip a trailing colon so «المدينة:» reads as the label «المدينة». */
const bare = (folded) => folded.replace(/[:：]\s*$/, '').trim()

/** The field this line is a label for, if the whole line is nothing else. */
function labelOnly(folded) {
  const b = bare(folded)
  if (!LABEL_SET.has(b)) return null
  const hit = ALL_LABELS.find((l) => l.label === b)
  return hit ? hit.field : null
}

/**
 * Split «label: value» when a line carries both.
 *
 * The separator is matched on the folded text but applied to the original by
 * index, so the returned value keeps its hamzas. Returns null when the line is
 * not of that shape.
 */
function splitPair(line, folded) {
  const m = INLINE_SEPARATOR.exec(folded)
  if (!m || m.index === 0) return null

  const leftFolded = bare(folded.slice(0, m.index))
  const hit = ALL_LABELS.find((l) => l.label === leftFolded)
  if (!hit) return null

  // Split once, at the first separator, and keep the remainder verbatim.
  //
  // Splitting on every occurrence and rejoining destroys any value that
  // contains the separator — and one of them always does: «الموقع الإلكتروني:
  // https://example.com» has a colon inside the URL, so a global split hands
  // back «https //example.com», which is not a URL and not a substring of the
  // document either. The label side is matched on the folded text; the value
  // side is taken from the original, untouched.
  const sep = INLINE_SEPARATOR.exec(line)
  if (!sep) return null
  const value = squash(line.slice(sep.index + sep[0].length))
  if (!value) return null

  return { field: hit.field, value }
}

/**
 * @param {{lines: string[], folded: string[]}} doc
 * @returns {{
 *   layoutMode: 'inline'|'column'|'mixed',
 *   pairs: Array<{field, value, lineIndex, method, score}>,
 *   labels: Array<{field, lineIndex}>,
 *   freeLines: Array<{text, folded, index}>,
 *   blocks: number
 * }}
 */
export function tokenize({ lines, folded }) {
  const pairs = []
  const labels = []
  const consumed = new Set()

  // ---- pass 1: lines that carry their own label ----------------------------
  // Done first and independently of position, so these survive any shuffling.
  for (let i = 0; i < lines.length; i++) {
    const p = splitPair(lines[i], folded[i])
    if (p) {
      pairs.push({ ...p, lineIndex: i, method: 'label:same_line', score: SCORE.labelSameLine })
      consumed.add(i)
    }
  }

  // ---- pass 2: label blocks aligned to value blocks -------------------------
  const kind = lines.map((_, i) => (consumed.has(i) ? 'pair' : labelOnly(folded[i]) ? 'label' : 'value'))

  let blocks = 0
  let i = 0
  while (i < lines.length) {
    if (kind[i] !== 'label') { i++; continue }

    let end = i
    while (end + 1 < lines.length && kind[end + 1] === 'label') end++
    const n = end - i + 1

    // A single label followed by its value is the ordinary next-line case, not
    // a column block; it is handled by proximity scoring, which can weigh it
    // against competing evidence. Two is the smallest run where alignment
    // carries real information.
    if (n < 2) { i = end + 1; continue }

    // The values have to be the next n lines, all of them plain values. Any
    // label inside that stretch means the block was not what it looked like,
    // and zipping anyway would pair every field with the wrong value — the
    // single worst failure this engine can produce.
    const vs = []
    for (let j = end + 1; j < lines.length && vs.length < n; j++) {
      if (kind[j] !== 'value') break
      vs.push(j)
    }

    if (vs.length === n) {
      for (let k = 0; k < n; k++) {
        pairs.push({
          field: labelOnly(folded[i + k]),
          value: lines[vs[k]],
          lineIndex: vs[k],
          method: 'column:zip',
          score: SCORE.columnZip,
        })
        consumed.add(i + k)
        consumed.add(vs[k])
      }
      blocks++
      i = vs[vs.length - 1] + 1
      continue
    }

    i = end + 1
  }

  // ---- what is left --------------------------------------------------------
  const freeLines = []
  for (let j = 0; j < lines.length; j++) {
    if (consumed.has(j)) continue
    const f = labelOnly(folded[j])
    // A label that found no value still marks a position, so proximity scoring
    // can offer the line below it as a candidate.
    if (f) { labels.push({ field: f, lineIndex: j }); continue }
    freeLines.push({ text: lines[j], folded: folded[j], index: j })
  }

  const inline = pairs.filter((p) => p.method === 'label:same_line').length
  const layoutMode = blocks && inline ? 'mixed' : blocks ? 'column' : 'inline'

  return { layoutMode, pairs, labels, freeLines, blocks }
}

export { labelOnly, fold }
