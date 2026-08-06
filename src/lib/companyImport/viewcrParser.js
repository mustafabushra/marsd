/**
 * Parser for the Saudi Business Centre commercial-registration page (viewcr).
 *
 * Isolated on purpose. This is the one file that knows what that page looks
 * like, and it is the only file that has to change when the page is redesigned —
 * everything downstream consumes the shape defined in normalize.js and never
 * touches the labels below.
 *
 * ============================================================================
 * What this parser is fed, and why
 * ============================================================================
 * Not the URL. https://qr.saudibusiness.gov.sa/viewcr renders entirely in
 * JavaScript: fetching it returns a 704-byte shell containing `<div id="root">`
 * and nothing else — no name, no CR number, not one field. The data arrives from
 * a gateway call the page makes after loading, and that gateway carries an
 * Altcha proof-of-work challenge. So a link alone cannot become data, by any
 * means that does not involve driving a browser through an anti-automation
 * control somebody deployed deliberately.
 *
 * It is fed the page's own content instead: the person opens the link — which
 * they can, it is their document — and copies the rendered page. Those are the
 * characters the portal displayed, so the extraction is exact. No OCR, no model,
 * no third-party call: the requirement was to rely only on what the viewcr page
 * shows, and this relies on precisely that and nothing else.
 *
 * If an official lookup is ever authorised, it returns the same shape and
 * everything downstream is unchanged.
 */

import { squash, toAsciiDigits, emptyExtraction } from './normalize.js'

/** Bumped whenever the labels below change, so a stored extraction says which
 *  reading of the page produced it. */
export const PARSER_VERSION = '2026.08-1'

export const VIEWCR_HOST = 'qr.saudibusiness.gov.sa'

/**
 * Only this portal. A link from anywhere else is refused rather than parsed —
 * a page that happens to contain a ten-digit number is not a commercial
 * registration, and treating it as one would put invented data in the registry.
 */
export function isViewcrUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    return u.protocol === 'https:'
      && u.hostname.toLowerCase() === VIEWCR_HOST
      && /\/viewcr/i.test(u.pathname)
  } catch {
    return false
  }
}

/** The record reference the link carries, kept so the entry can be re-checked. */
export function viewcrReference(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    return u.searchParams.get('nCrNumber') || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The page's fields
// ---------------------------------------------------------------------------
// Every label the page prints, in the order it prints them. Alternatives are
// listed because the portal words some of them differently in its Arabic and
// English layouts, and because wording drifts between releases.
//
// `to` is the add-company form field it fills, or null for facts the form has no
// box for — those are kept in `extras` rather than dropped, so nothing the
// portal showed is silently lost.

const FIELDS = [
  { key: 'companyName',     to: 'companyName',     labels: ['اسم الشركة', 'الاسم التجاري', 'اسم المنشأة', 'الاسم'] },
  { key: 'registryNumber',  to: 'registryNumber',  labels: ['رقم السجل التجاري', 'رقم السجل'], digits: 10 },
  { key: 'crStatus',        to: 'crStatus',        labels: ['حالة السجل', 'حالة السجل التجاري'] },
  { key: 'establishmentType', to: 'entityType',    labels: ['نوع المنشأة'] },
  { key: 'companyType',     to: null,              labels: ['نوع الشركة'] },
  { key: 'companyTraits',   to: null,              labels: ['صفات الشركة', 'صفة الشركة'] },
  { key: 'registrationDate', to: 'foundingDate',   labels: ['تاريخ قيد السجل', 'تاريخ القيد', 'تاريخ التسجيل'] },
  { key: 'annualConfirmDate', to: null,            labels: ['تاريخ التأكيد السنوي', 'التأكيد السنوي'] },
  { key: 'crVersionNumber', to: null,              labels: ['رقم نسخة السجل', 'نسخة السجل'] },
  { key: 'capital',         to: null,              labels: ['رأس المال', 'رأس مال الشركة'] },
  { key: 'city',            to: 'city',            labels: ['المدينة', 'مدينة المقر'] },
  { key: 'address',         to: 'nationalAddress', labels: ['العنوان', 'العنوان الوطني', 'عنوان المنشأة'] },
  { key: 'phone',           to: 'phone',           labels: ['رقم الجوال', 'الجوال', 'رقم الهاتف', 'الهاتف'] },
  { key: 'email',           to: 'officialEmail',   labels: ['البريد الإلكتروني', 'البريد'] },
  { key: 'website',         to: 'website',         labels: ['الموقع الإلكتروني', 'الموقع'] },
  { key: 'unifiedNumber',   to: 'unifiedNumber',   labels: ['الرقم الموحد', 'الرقم الموحّد', 'الرقم الموحد للمنشأة'] },
  { key: 'expiryDate',      to: 'crExpiryDate',    labels: ['تاريخ انتهاء السجل', 'تاريخ الانتهاء'] },
]

/** Sections printed as lists rather than single values. */
const LISTS = [
  { key: 'activities', to: 'subActivities', labels: ['الأنشطة', 'أنشطة السجل', 'النشاط', 'الأنشطة التجارية'] },
  { key: 'managers',   to: null,            labels: ['المديرين', 'المدراء', 'أسماء المديرين', 'الملاك والمديرين'] },
]

/** Labels that end a list — the next section's heading. */
const ALL_LABELS = [...FIELDS, ...LISTS].flatMap((f) => f.labels)

const DATE_LABELS = new Set(['registrationDate', 'annualConfirmDate', 'expiryDate'])

// ---------------------------------------------------------------------------

/** Turn pasted HTML into text; pasted text passes through unchanged. */
function asText(input) {
  const s = String(input || '')
  if (!/<[a-z][\s\S]*>/i.test(s)) return s

  // A copied page is often HTML. Block-level tags become line breaks so labels
  // and values do not run together into one line the parser cannot split.
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    // span, td and label close too: the portal lays a field out as two adjacent
    // spans, and without a break between them the label and its value arrive as
    // one line with no separator for the parser to split on.
    .replace(/<\/(p|div|tr|li|h[1-6]|td|th|section|span|label|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

/**
 * Read a label's value.
 *
 * The portal prints "label: value" on one line, and also "label" on one line
 * with the value on the next — both in the same document, depending on the
 * viewport it was copied from. Both are handled, and a value that turns out to
 * be another known label is rejected, which is what stops an empty field from
 * swallowing the heading beneath it.
 */
function readLabel(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const label of labels) {
      const inline = line.match(
        new RegExp(`^\\s*${label}\\s*[:：]\\s*(.+)$`))
      if (inline?.[1]) {
        const v = squash(inline[1])
        if (v && !ALL_LABELS.includes(v)) return v
      }
      if (squash(line.replace(/[:：]\s*$/, '')) === label) {
        const next = squash(lines[i + 1] || '')
        if (next && !ALL_LABELS.includes(next) && !/[:：]$/.test(next)) return next
      }
    }
  }
  return null
}

/** Read everything under a heading until the next known heading. */
function readList(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const head = squash(lines[i].replace(/[:：]\s*$/, ''))
    if (!labels.includes(head)) continue
    const out = []
    for (let j = i + 1; j < lines.length; j++) {
      const v = squash(lines[j])
      if (!v) continue
      if (ALL_LABELS.includes(v.replace(/[:：]\s*$/, ''))) break
      if (/^[-•*]\s*/.test(v) || v.length > 1) out.push(v.replace(/^[-•*]\s*/, ''))
      if (out.length >= 40) break
    }
    if (out.length) return out
  }
  return null
}

/** The portal prints Gregorian and Hijri side by side; only one can be stored. */
function readDate(value) {
  const t = toAsciiDigits(String(value || ''))
  const greg = t.match(/\b(20\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/)
    || t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](20\d{2})\b/)
  if (!greg) return { value: '', raw: squash(t) || null }

  const [y, m, d] = greg[1].length === 4
    ? [greg[1], greg[2], greg[3]]
    : [greg[3], greg[2], greg[1]]
  return {
    value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    raw: squash(t),
  }
}

/**
 * Parse a viewcr page.
 *
 * Returns the standard extraction shape. `extras` carries the official facts the
 * add-company form has no field for — capital, company traits, the annual
 * confirmation date, the managers — so they can be stored with the record rather
 * than read and discarded.
 */
export function parseViewcr(input, sourceUrl = null) {
  const out = emptyExtraction('viewcr')
  out.meta = {
    parser: PARSER_VERSION,
    url: isViewcrUrl(sourceUrl) ? String(sourceUrl).trim() : null,
    reference: viewcrReference(sourceUrl),
  }
  out.extras = {}

  const text = toAsciiDigits(asText(input))
  const lines = text.split(/\r?\n/).map((l) => squash(l)).filter(Boolean)

  // Only genuinely empty input short-circuits. This used to demand three lines,
  // which discarded a perfectly good two-line paste and reported it as empty —
  // a guard refusing content it had not looked at. Whether anything was
  // recognised is decided below, by what the parse actually found.
  if (squash(text).length < 12) {
    return {
      ...out,
      note: 'المحتوى الملصوق فارغ أو قصير جداً — افتح صفحة التحقّق، انتظر ظهور بيانات السجل، ثم انسخ الصفحة كاملة.',
    }
  }

  for (const f of FIELDS) {
    const raw = readLabel(lines, f.labels)
    if (!raw) continue

    let value = raw
    let confidence = 'high'   // exact characters from the portal's own page
    let rawNote = null

    if (f.digits) {
      const m = toAsciiDigits(raw).match(new RegExp(`\\d{${f.digits}}`))
      if (!m) continue
      value = m[0]
    }
    if (DATE_LABELS.has(f.key)) {
      const d = readDate(raw)
      value = d.value
      rawNote = d.raw
      // A Hijri-only date cannot be stored; it is shown for the person to convert
      // rather than written as a Gregorian year of 1447.
      if (!value) confidence = 'low'
    }

    out.extras[f.key] = rawNote || value || raw
    if (f.to && value) out.fields[f.to] = { value, confidence, raw: rawNote }
  }

  for (const l of LISTS) {
    const items = readList(lines, l.labels)
    if (!items?.length) continue
    out.extras[l.key] = items
    if (l.to) {
      out.fields[l.to] = { value: items.join('، '), confidence: 'high', raw: null }
    }
    // The first activity is the main one on this page.
    if (l.key === 'activities' && !out.fields.mainActivity) {
      out.fields.mainActivity = { value: items[0], confidence: 'high', raw: null }
    }
  }

  const found = Object.keys(out.fields).length
  out.unparsed = text.slice(0, 6000)

  if (found === 0) {
    // Never quietly hand back an empty result: the person is about to trust it.
    out.note = out.meta.url
      ? 'لم يُعثر على أي حقل في المحتوى الملصوق. تأكّد أن بيانات السجل ظهرت في الصفحة قبل نسخها — الصفحة تُحمّل بياناتها بعد فتحها بلحظات.'
      : 'لم يُعثر على أي حقل — تأكّد أنك نسخت صفحة السجل التجاري من مركز الأعمال.'
  } else if (!out.fields.registryNumber) {
    out.note = 'استُخرجت بيانات لكن دون رقم السجل التجاري — راجع المحتوى وأكمل الرقم يدوياً قبل الحفظ.'
  }

  return out
}
