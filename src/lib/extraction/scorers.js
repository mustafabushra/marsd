/**
 * Propose candidates. Do not choose between them — that is resolve.js.
 *
 * Every rule here answers one question: "how strongly does this piece of text
 * look like this field?" A rule that is unsure emits a low score rather than
 * staying silent, because a weak candidate that loses to a strong one costs
 * nothing, while a rule that declines to speak leaves a field empty forever.
 *
 * Candidates carry a `token` — the identity used for mutual exclusion. Two
 * candidates sharing a token are the same piece of text claimed by two fields,
 * and only one of them can win.
 */

import {
  RE, SCORE, ENTITY_TYPES, CR_STATUSES, ENTITY_WORDS, ENTITY_SIZES,
  COMPANY_TRAITS, CURRENCY, RE_DATE_NUMERIC, RE_DATE_WORDS, RE_HIJRI_MARK, AR_MONTHS,
  PROSE_MARKERS, PROSE, ISSUERS, LEGAL_FORMS,
} from './patterns.js'
import { fold, squash } from './fold.js'
import { labelOnly } from './tokenize.js'
import { CITIES, CITY_KEYS, REGION_BY_FOLDED } from './data/cities.js'

/** Fields whose value is a date; they get an extra `date` property. */
export const DATE_FIELDS = new Set([
  'establishment_date', 'cr_expiry_date', 'annual_confirmation_date',
])

const digitsOf = (s) => String(s).replace(/\D/g, '')

const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length

/**
 * Is this a sentence rather than a value?
 *
 * The one test that had been missing, and the reason a page's disclaimer could
 * become a company's name. Applied to every free-text field, because the same
 * paragraph is equally wrong in the name box, the address box and the manager
 * box — the question "is this prose" does not depend on which field is asking.
 *
 * Deliberately structural. Matching the specific disclaimer would fix one
 * portal until it reworded its footer; a candidate that carries a verb, ends in
 * a full stop, or runs past the length of any real registered name is prose
 * whatever page it came from.
 */
function looksLikeProse(value, folded, { maxChars, maxWords }) {
  if (value.length > maxChars) return true
  if (wordCount(value) > maxWords) return true
  // A registered name, a district, a person — none of them end a sentence.
  if (/[.।۔]$/.test(value.trim())) return true
  if (PROSE_MARKERS.some((m) => folded.includes(m))) return true
  // A comma inside a long phrase is a clause boundary. Short values use commas
  // legitimately («جدة، حي الأندلس»), so length has to agree before this fires.
  if (/[،,]/.test(value) && wordCount(value) > 9) return true
  return false
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
/**
 * Read a date without converting it.
 *
 * Which calendar a date is in is decided by its year, which is unambiguous in
 * practice: 1447 is not a Gregorian year anyone registers a company in, and
 * 2018 is not a Hijri one. Conversion is deliberately not attempted — an
 * off-by-one in a Hijri conversion produces a date that looks entirely
 * plausible and is simply wrong, and there is nothing downstream that would
 * catch it.
 */
export function readDate(text) {
  const t = squash(text)
  let d, m, y

  const num = RE_DATE_NUMERIC.exec(t)
  if (num) {
    const [, a, b, c] = num
    if (a.length === 4) { [y, m, d] = [a, b, c] } else { [d, m, y] = [a, b, c] }
  } else {
    const w = RE_DATE_WORDS.exec(fold(t))
    if (!w) return null
    d = w[1]
    m = String(AR_MONTHS.find(([name]) => name === w[2])[1])
    y = w[3]
  }

  const year = Number(y)
  const hijri = RE_HIJRI_MARK.test(t) || (year >= 1300 && year <= 1500)
  const iso = `${y.padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return {
    calendar: hijri ? 'hijri' : 'gregorian',
    hijri: hijri ? iso : null,
    gregorian: hijri ? null : iso,
  }
}

// ---------------------------------------------------------------------------
// Per-field validation of a value that already has a label
// ---------------------------------------------------------------------------
/**
 * Given a labelled value, produce the substring to keep and a score adjustment.
 *
 * Returning null rejects the pairing outright — used only where the value
 * plainly cannot belong to the field, such as a company name that is a bare
 * number. Everything softer is expressed as a penalty, so that an unfamiliar
 * format degrades the score instead of losing the data.
 */
function refine(field, raw) {
  const value = squash(raw)
  const f = fold(value)
  if (!value) return null

  switch (field) {
    case 'cr_number': {
      const d = digitsOf(value)
      if (!d) return null
      if (RE.year.test(d)) return null                       // a year is never a CR
      if (RE.cr10.test(d)) return { value: d, adjust: d.startsWith('7') ? -25 : 0 }
      return { value: d, adjust: -20 }                       // unfamiliar length: keep, doubt
    }
    case 'unified_number': {
      const d = digitsOf(value)
      if (!d) return null
      if (RE.unified10.test(d)) return { value: d, adjust: 0 }
      return { value: d, adjust: -25 }
    }
    case 'vat_number': {
      const d = digitsOf(value)
      if (!d) return null
      return { value: d, adjust: RE.vat15.test(d) ? 0 : -25 }
    }
    case 'phone': {
      const d = digitsOf(value.replace(/^\+/, '00'))
      if (!d) return null
      const ok = RE.phone.test(d) || RE.landline.test(d)
      // The original spacing is what the person sees in their document, so the
      // digits are returned as written rather than reformatted.
      return { value: squash(value), adjust: ok ? 0 : -20 }
    }
    case 'postal_code': {
      const d = digitsOf(value)
      return RE.postal.test(d) ? { value: d, adjust: 0 } : null
    }
    case 'short_address':
      return RE.shortAddress.test(value.replace(/\s/g, ''))
        ? { value: value.replace(/\s/g, '').toUpperCase(), adjust: 0 } : null
    case 'email': {
      const m = RE.email.exec(value)
      return m ? { value: m[0], adjust: 0 } : null
    }
    case 'website': {
      const m = RE.url.exec(value)
      return m ? { value: m[0], adjust: 0 } : null
    }
    case 'capital': {
      const m = /\d[\d,]*(?:\.\d+)?/.exec(value)
      if (!m) return null
      const named = CURRENCY.some((c) => f.includes(c))
      return { value: m[0], adjust: named ? 0 : -8 }
    }
    case 'entity_type': {
      const hit = ENTITY_TYPES.find((t) => f === t) || ENTITY_TYPES.find((t) => f.includes(t))
      return hit ? { value, adjust: f === hit ? 0 : -6 } : { value, adjust: -30 }
    }
    case 'company_type': {
      // Checked against the bare forms first, because that is how the page
      // prints it under «نوع الشركة» — «ذات مسؤولية محدودة», with the «شركة»
      // already spent on the line above. The prefixed list is the fallback for
      // documents that repeat the whole phrase.
      const bare = LEGAL_FORMS.find((t) => f === t)
        || LEGAL_FORMS.find((t) => f.includes(t) && t.length > 5)
      if (bare) return { value, adjust: 0 }
      const full = ENTITY_TYPES.find((t) => f === t || f.includes(t))
      return full ? { value, adjust: -4 } : { value, adjust: -20 }
    }
    case 'cr_status': {
      const hit = CR_STATUSES.find((s) => f === s || f.startsWith(s))
      return hit ? { value, adjust: 0 } : { value, adjust: -30 }
    }
    case 'entity_size': {
      // Never inferred, only recognised. An unlisted word is not a size.
      const hit = ENTITY_SIZES.find((s) => f.includes(s))
      return hit ? { value, adjust: 0 } : null
    }
    case 'company_traits': {
      const hit = COMPANY_TRAITS.find((s) => f.includes(s))
      return hit ? { value, adjust: 0 } : { value, adjust: -20 }
    }
    case 'city': {
      const key = CITY_KEYS.find((k) => f === k) || CITY_KEYS.find((k) => f.includes(k))
      return key ? { value, adjust: f === key ? 0 : -10 } : { value, adjust: -30 }
    }
    case 'region': {
      const hit = [...REGION_BY_FOLDED.keys()].find((k) => f.includes(k))
      return hit ? { value, adjust: 0 } : { value, adjust: -30 }
    }
    case 'company_name_ar': {
      if (!/[؀-ۿ]/.test(value)) return null
      // A name never opens with a number. An activity does — «561031 محلات
      // الوجبات السريعة» — and «محلات» is enough to make the rest of it read
      // like a company.
      if (/^\d/.test(value) || RE.email.test(value)) return null
      if (CR_STATUSES.includes(f) || CITIES.has(f)) return null
      // The check that was missing. «المركز السعودي للتنافسية والأعمال غير
      // مسؤول عن أي نقص…» contains «مركز», scored as an organisation, and
      // replaced the company it appeared beneath.
      if (looksLikeProse(value, f, { maxChars: PROSE.maxNameChars, maxWords: PROSE.maxNameWords })) return null
      // The agency that issued the document is not the company it describes.
      // Checked here as well as in the noise filter, because the issuer's name
      // also appears inside longer lines the filter leaves alone.
      if (ISSUERS.some((i) => f === i || f.startsWith(i))) return null
      const named = ENTITY_WORDS.some((w) => f.includes(w))
      return { value, adjust: named ? 0 : -12 }
    }
    case 'company_name_en': {
      if (/[؀-ۿ]/.test(value)) return null
      if (RE.email.test(value) || RE.url.test(value)) return null
      const words = value.split(/\s+/).filter(Boolean)
      if (words.length < 2 && value.length < 12) return null
      return { value, adjust: 0 }
    }
    case 'manager_name': {
      if (!/[؀-ۿ]/.test(value)) return null
      if (/\d/.test(value)) return null
      const words = value.split(/\s+/).filter(Boolean)
      if (words.length < 2 || words.length > PROSE.maxPersonWords) return null
      if (ENTITY_WORDS.some((w) => f.includes(w))) return null   // an org, not a person
      if (CITIES.has(f)) return null
      if (looksLikeProse(value, f, { maxChars: 70, maxWords: PROSE.maxPersonWords })) return null
      return { value, adjust: 0 }
    }
    case 'national_address': {
      if (looksLikeProse(value, f, { maxChars: PROSE.maxAddressChars, maxWords: 20 })) return null
      return { value, adjust: 0 }
    }
    case 'cr_type': {
      // A registration is either the main one or a branch of it, and both are
      // written several ways.
      if (/فرعي|فرع/.test(f)) return { value, adjust: 0 }
      if (/رئيسي|اصلي/.test(f)) return { value, adjust: 0 }
      return { value, adjust: -30 }
    }
    case 'main_activity':
    case 'sub_activities': {
      if (value.length < 3) return null
      if (looksLikeProse(value, f, { maxChars: 200, maxWords: 25 })) return null
      return { value, adjust: 0 }
    }
    default: {
      if (DATE_FIELDS.has(field)) {
        const d = readDate(value)
        if (!d) return null
        // A Hijri-only date cannot fill a Gregorian form field, so it is kept
        // and marked rather than silently converted.
        return { value, adjust: d.calendar === 'hijri' ? -20 : 0, date: d }
      }
      return { value, adjust: 0 }
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern-only candidates: text with no label at all
// ---------------------------------------------------------------------------
/** What a bare piece of text could be, judged on shape alone. */
function byShape(text) {
  const value = squash(text)
  const f = fold(value)
  const out = []
  const add = (field, v, score) => out.push({ field, value: v, score, method: 'pattern:shape' })

  const d = digitsOf(value)
  const onlyDigits = d.length === value.replace(/[\s\-+]/g, '').length

  if (onlyDigits && d) {
    if (RE.vat15.test(d)) add('vat_number', d, SCORE.strongPattern)
    else if (RE.unified10.test(d)) add('unified_number', d, SCORE.strongPattern)
    else if (RE.phone.test(d)) add('phone', value, SCORE.strongPattern)
    else if (RE.landline.test(d)) add('phone', value, SCORE.strongPattern - 10)
    else if (RE.cr10.test(d)) add('cr_number', d, SCORE.strongPattern - 8)
    // A four-digit year is explicitly not a registration number. Saying so with
    // a candidate of its own would be noise; saying nothing is the rule.
  }

  const email = RE.email.exec(value)
  if (email) add('email', email[0], SCORE.strongPattern)

  const url = RE.url.exec(value)
  if (url && !email) add('website', url[0], SCORE.strongPattern)

  if (RE.shortAddress.test(value.replace(/\s/g, ''))) {
    add('short_address', value.replace(/\s/g, '').toUpperCase(), SCORE.strongPattern)
  }

  // Closed vocabularies: a line that is exactly a known status or entity type
  // is that thing, with or without a label above it.
  if (CR_STATUSES.includes(f)) add('cr_status', value, SCORE.closedList)
  const et = ENTITY_TYPES.find((t) => f === t)
  if (et) add('entity_type', value, SCORE.closedList)
  if (CITIES.has(f)) add('city', value, SCORE.closedList)
  const size = ENTITY_SIZES.find((s) => f === s)
  if (size) add('entity_size', value, SCORE.closedList)

  // A company name with no label has to earn it: an organisation word, and
  // nothing that marks it as another field.
  if (/[؀-ۿ]/.test(value) && ENTITY_WORDS.some((w) => f.includes(w))
      && !CITIES.has(f) && !CR_STATUSES.includes(f) && !ENTITY_TYPES.includes(f)
      && value.split(/\s+/).length >= 2) {
    add('company_name_ar', value, SCORE.weakPattern)
  }

  return out
}

/**
 * Is this line plainly some other field, rather than a list item?
 *
 * Used to terminate a list, where the alternative is running past its end. It
 * deliberately does not ask "is this an activity?" — activities are open-ended
 * prose and no test would be safe. It asks the answerable question instead:
 * does this line already belong to something else?
 */
function looksLikeAnotherField(text, folded) {
  const bare = text.replace(/[\s\-+]/g, '')
  if (/^\d+$/.test(bare)) return true                       // a lone number
  if (RE.email.test(text) || RE.url.test(text)) return true
  if (RE_DATE_NUMERIC.test(text)) return true
  if (CR_STATUSES.includes(folded)) return true
  if (ENTITY_TYPES.includes(folded)) return true
  if (CITIES.has(folded)) return true
  if (CURRENCY.some((c) => folded.includes(c))) return true // «50000 ريال»
  return false
}

// ---------------------------------------------------------------------------
export function scoreAll(doc, tok) {
  const cands = []
  const push = (c) => { if (c) cands.push(c) }

  const emit = (field, raw, lineIndex, base, method) => {
    const r = refine(field, raw)
    if (!r) return
    const score = Math.max(0, Math.min(100, base + r.adjust))
    push({
      field, value: r.value, score, method, lineIndex,
      token: `${lineIndex}:${r.value}`,
      date: r.date ?? null,
    })
  }

  // ---- labelled: same line, and column blocks ------------------------------
  for (const p of tok.pairs) emit(p.field, p.value, p.lineIndex, p.score, p.method)

  // ---- labelled: the value on the line below -------------------------------
  // Distance decays. A label two lines from its value is weak evidence, and
  // three is none — beyond that the "next line" is somebody else's field.
  for (const l of tok.labels) {
    for (let gap = 1; gap <= 2; gap++) {
      const j = l.lineIndex + gap
      if (j >= doc.lines.length) break
      const line = doc.lines[j]
      if (!line) continue
      // A label is not a value. Reading «المدينة» as the address because it
      // happened to sit under «الحي» is how a reversed or truncated paste
      // produces a confident wrong answer.
      if (labelOnly(doc.folded[j])) break
      const base = gap === 1 ? SCORE.labelNextLine : SCORE.labelNearby
      emit(l.field, line, j, base, gap === 1 ? 'label:next_line' : 'label:proximity')
    }
  }

  // ---- lists under a heading -----------------------------------------------
  // «الأنشطة» is followed by its items, not by one value. Collected here rather
  // than by the pair rules, which would take only the first line and drop the
  // rest of the list on the floor.
  for (const l of tok.labels) {
    if (l.field !== 'sub_activities' && l.field !== 'main_activity') continue
    const items = []
    for (let j = l.lineIndex + 1; j < doc.lines.length && items.length < 40; j++) {
      const free = tok.freeLines.find((x) => x.index === j)
      if (!free) break
      const t = squash(free.text)
      if (!t || t.length < 3) break
      // An activity is prose with, at most, a code in front of it. A line that
      // is unmistakably something else — a date, a bare number, an address, a
      // status — ends the list. Without this the collector runs to the bottom
      // of the document and returns the whole page as "activities", stated with
      // the confidence of a labelled field.
      if (looksLikeAnotherField(t, free.folded)) break
      items.push({ text: t, index: j })
    }
    if (!items.length) continue
    emit('main_activity', items[0].text, items[0].index, SCORE.labelNextLine, 'label:list_head')
    if (items.length > 1) {
      const rest = items.slice(1)
      push({
        field: 'sub_activities',
        value: rest.map((x) => x.text).join('، '),
        score: SCORE.labelNextLine,
        method: 'label:list',
        lineIndex: rest[0].index,
        token: `list:${l.lineIndex}`,
        parts: rest.map((x) => x.text),
        date: null,
      })
    }
  }

  // ---- shape alone ---------------------------------------------------------
  // Applied to unlabelled lines, and to the inside of labelled values: a value
  // like «561010 المطاعم مع الخدمة» carries an ISIC code the label never
  // mentioned.
  for (const free of tok.freeLines) {
    // Through emit, which means through refine — the same validation a labelled
    // value gets. These used to be pushed straight onto the candidate list,
    // skipping it entirely, so byShape's looser copy of the rules was the only
    // thing standing between an activity line and the company-name field:
    // «561031 محلات الوجبات السريعة» contains «محلات» and was a name candidate.
    // One set of rules, applied once, is the fix.
    for (const c of byShape(free.text)) {
      emit(c.field, c.value, free.index, c.score, c.method)
    }
    // A city named inside a longer address line.
    const key = CITY_KEYS.find((k) => free.folded.includes(k))
    if (key && !CITIES.has(free.folded)) {
      const city = CITIES.get(key)
      push({
        field: 'city', value: city.name, score: SCORE.weakPattern,
        method: 'pattern:city_in_line', lineIndex: free.index,
        token: `${free.index}:city`, date: null,
      })
    }
  }

  return cands
}
