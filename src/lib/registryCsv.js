/**
 * The register as the Ministry actually ships it: a 349MB CSV.
 *
 * The first importer put every file through `XLSX.read`, which builds the whole
 * sheet in memory before a single row can be looked at. On the real file that
 * died at 2GB — «Ineffective mark-compacts near heap limit» — having read
 * nothing.
 *
 * A CSV does not need any of that. It is read a line at a time and streamed
 * straight into `COPY`, so memory is one row whatever the file weighs.
 *
 * ============================================================================
 * What the real header turned out to be
 * ============================================================================
 *   ﻿الرقم الموحد,رقم السجل,اسم السجل,نوع السجل,الكيان القانوني,الكيان القانوني,…
 *
 * Three things there are not what the metadata suggested:
 *
 *   a BOM on the first byte, which makes the first column's name «﻿الرقم الموحد»
 *   and matches nothing;
 *
 *   «الكيان القانوني» twice, literally — not suffixed the way a spreadsheet
 *   parser would. Column five is the broad kind («شركة») and column six the
 *   specific one («شركة ذات مسؤولية محدودة شخص واحد»). Both are kept, because
 *   which one somebody wants is not ours to decide;
 *
 *   values with leading spaces inside the quotes — `" نجران"` — which would
 *   otherwise be stored as a city nobody can search for.
 */

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
export function splitCsvLine(line) {
  const out = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1 }
        else quoted = false
      } else field += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field)
  return out
}

/**
 * Where each field lives, by column index.
 *
 * By index and not by name, because the header carries «الكيان القانوني» twice
 * and any object keyed on the name would silently keep one of them.
 */
export function mapHeader(headerLine, columns) {
  // The BOM belongs to the file, not to the first column's name.
  const names = splitCsvLine(headerLine.replace(/^﻿/, ''))
    .map((h) => h.trim())

  const index = {}
  const seen = new Set()

  for (const col of columns) {
    for (let i = 0; i < names.length; i += 1) {
      if (seen.has(i)) continue
      if (col.names.includes(names[i])) { index[col.field] = i; seen.add(i); break }
    }
  }

  // The second «الكيان القانوني» — the specific one. Taken only if a first was
  // already claimed, so a file carrying it once is not misread.
  if (index.entityType !== undefined) {
    const second = names.findIndex((n, i) => i > index.entityType && n === names[index.entityType])
    if (second > -1) index.entityType2 = second
  }

  return { names, index }
}

/** One line, as the fields Marsad keeps. */
export function rowFromLine(line, index, { digits, isoDate }) {
  const cells = splitCsvLine(line)
  // Trimmed: the file quotes values with a leading space, and « نجران» is a
  // city nobody would find by searching for «نجران».
  const at = (field) => {
    const i = index[field]
    if (i === undefined) return null
    const v = (cells[i] ?? '').trim()
    return v === '' ? null : v
  }

  const capitalRaw = at('capital')
  const capitalDigits = capitalRaw ? capitalRaw.replace(/[^\d.]/g, '') : ''

  return {
    crNumber: digits(at('crNumber')),
    name: at('name'),
    unifiedNumber: digits(at('unifiedNumber')),
    crType: at('crType'),
    entityType: at('entityType'),
    entityType2: at('entityType2'),
    // «غير محدد» strips to an empty string, and `Number('')` is 0 — so a
    // company whose capital was not stated would be recorded as having none.
    capital: capitalDigits ? Number(capitalDigits) : null,
    region: at('region'),
    city: at('city'),
    foundingDate: isoDate(at('foundingDate')),
  }
}
