/**
 * One shape for an extracted company, whatever produced it.
 *
 * Every source — a QR code, OCR over a PDF, OCR over a photo, and later an
 * official registry API — returns this and nothing else:
 *
 *   {
 *     source: 'qr' | 'pdf' | 'image' | ...,
 *     fields: { [formField]: { value, confidence, raw } },
 *     unparsed: string | null,   // what was read but not understood
 *     note: string | null,       // shown to the person, e.g. why little was found
 *   }
 *
 * The review screen and the form know only this. Adding وثق or a business-centre
 * API later means writing one more extractor that returns the same object — no
 * screen changes, no new review path, no second definition of "the fields of a
 * company". That is the whole reason this file exists separately from the
 * scanners that feed it.
 *
 * confidence is 'high' for a value read from structured data (a QR payload,
 * an API), 'medium' for a labelled field found in OCR text, 'low' for one
 * inferred from position or pattern. The review screen shows the difference,
 * because a person correcting OCR needs to know which numbers to distrust.
 */

/**
 * Ordered and worded to match the add-company form.
 *
 * These are the rows of the review screen, and the review screen is the last
 * place a person sees a value before it becomes a record — so it has to show
 * every field the form can hold. A field missing from here is extracted, then
 * silently dropped on the way to a form that had a box for it.
 */
export const FIELD_LABELS = {
  companyName: 'اسم المنشأة',
  nameEn: 'الاسم بالإنجليزي',
  crStatus: 'حالة السجل',
  entityType: 'نوع المنشأة',
  companyType: 'نوع الشركة',
  companyTraits: 'صفات الشركة',
  crType: 'نوع السجل',
  registryNumber: 'رقم السجل التجاري',
  unifiedNumber: 'الرقم الوطني الموحّد',
  crVersion: 'رقم نسخة السجل',
  capital: 'رأس المال',
  foundingDate: 'تاريخ قيد السجل',
  // The confirmation date is what a registration issued under the current law
  // actually carries; the expiry date only appears on older certificates, so it
  // sits after it rather than in front of it.
  annualConfirmationDate: 'تاريخ التأكيد السنوي',
  crExpiryDate: 'تاريخ انتهاء السجل (سجل قديم)',
  enterpriseSize: 'حجم المنشأة',
  city: 'المدينة',
  region: 'المنطقة',
  nationalAddress: 'العنوان الوطني',
  phone: 'رقم الجوال',
  officialEmail: 'البريد الإلكتروني',
  website: 'الموقع الإلكتروني',
  sector: 'القطاع',
  mainActivity: 'النشاط الرئيسي',
  subActivities: 'الأنشطة الفرعية',
  managers: 'المديرون',
}

export const CONFIDENCE = {
  high: { label: 'مؤكَّد', color: '#15803D', bg: '#ECFDF5' },
  medium: { label: 'مُستخرَج', color: '#B45309', bg: '#FFFBEB' },
  low: { label: 'تخمين — راجعه', color: '#B91C1C', bg: '#FEF2F2' },
}

export const emptyExtraction = (source, note = null) => ({
  source, fields: {}, unparsed: null, note,
})

/** Arabic-Indic digits arrive from photographed documents; the form wants ASCII. */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const toAsciiDigits = (s) =>
  String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))

/** OCR turns one space into three and drops line breaks unpredictably. */
export const squash = (s) => String(s ?? '').replace(/[ \t ]+/g, ' ').trim()

const put = (out, key, value, confidence, raw = null) => {
  const v = squash(value)
  if (!v) return
  // First writer wins: extractors are ordered most-trustworthy-first, and a
  // later low-confidence guess must not overwrite a value read from a QR.
  if (out.fields[key]) return
  out.fields[key] = { value: v, confidence, raw }
}

// ---------------------------------------------------------------------------
// Labelled-text parsing
// ---------------------------------------------------------------------------
// Saudi commercial registration extracts and business-centre certificates are
// label/value documents. OCR flattens them, so each field is found by its label
// rather than by position — position is the first thing a new template breaks.

const LABELS = [
  { key: 'registryNumber', pat: /(?:رقم\s*)?(?:السجل\s*التجاري|السجل)\s*[:：]?\s*(\d{10})/ },
  { key: 'unifiedNumber',  pat: /(?:الرقم\s*)?(?:الموحّد|الموحد)\s*(?:للمنشأة)?\s*[:：]?\s*(\d{9,10})/ },
  { key: 'companyName',    pat: /(?:اسم\s*(?:الشركة|المنشأة|التاجر))\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'entityType',     pat: /(?:نوع\s*(?:الكيان|المنشأة|الشركة))\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'crStatus',       pat: /(?:حالة\s*السجل)\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'crExpiryDate',   pat: /(?:تاريخ\s*)?(?:انتهاء|نهاية)\s*(?:السجل)?\s*[:：]?\s*([\d٠-٩/\-.]{8,10})/ },
  { key: 'foundingDate',   pat: /(?:تاريخ\s*)?(?:التأسيس|الإصدار|القيد)\s*[:：]?\s*([\d٠-٩/\-.]{8,10})/ },
  { key: 'mainActivity',   pat: /(?:النشاط\s*(?:الرئيسي|الأساسي))\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'city',           pat: /(?:المدينة|مدينة\s*المقر)\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'region',         pat: /(?:المنطقة|منطقة)\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'nationalAddress', pat: /(?:العنوان\s*الوطني)\s*[:：]?\s*(.+?)(?=\s{2,}|$|\n)/ },
  { key: 'phone',          pat: /(?:الهاتف|الجوال|رقم\s*التواصل)\s*[:：]?\s*(\+?[\d\s()-]{9,17})/ },
  { key: 'officialEmail',  pat: /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/ },
  { key: 'website',        pat: /((?:https?:\/\/)?(?:www\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s]*)/ },
]

/**
 * Pull whatever can be recognised out of a page of text.
 *
 * Deliberately forgiving: a document that yields three fields out of eighteen is
 * still three fields the person does not have to type, and the review screen
 * says plainly which ones came back empty.
 */
export function parseDocumentText(text, source, trusted = false) {
  // `trusted` means the characters are exact rather than recognised: text copied
  // from a rendered page, or read out of a digital PDF's text layer. A label
  // matched in exact text is a reading; the same label matched in OCR output is
  // a reading of a guess, and the review screen must not present them alike.
  const base = trusted ? 'high' : 'medium'
  const out = emptyExtraction(source)
  const flat = squash(toAsciiDigits(text).replace(/\r/g, '')).replace(/\n+/g, '\n')
  if (!flat) return { ...out, note: 'لم يُقرأ أي نص من الملف' }

  for (const { key, pat } of LABELS) {
    const m = flat.match(pat)
    if (m?.[1]) put(out, key, m[1], base, m[0])
  }

  // A bare ten-digit number on a commercial registration is the CR number even
  // when OCR loses the label — the most common single failure on a photograph.
  if (!out.fields.registryNumber) {
    const bare = flat.match(/(?:^|\D)(\d{10})(?:\D|$)/)
    // Still a guess even in exact text: an unlabelled ten-digit number on a page
    // could be a phone number or a licence.
    if (bare?.[1]) put(out, 'registryNumber', bare[1], 'low', bare[0])
  }

  // Dates arrive as 1445/06/12 (Hijri) or 2024-01-31. Only the second is a date
  // the form can store, so a Hijri one is kept as raw text for the person to
  // convert rather than silently mangled into a wrong Gregorian date.
  for (const key of ['crExpiryDate', 'foundingDate']) {
    const f = out.fields[key]
    if (!f) continue
    const norm = f.value.replace(/[.-]/g, '/')
    const [y] = norm.split('/')
    if (Number(y) >= 1300 && Number(y) <= 1500) {
      out.fields[key] = { ...f, value: '', confidence: 'low', raw: `هجري: ${f.value}` }
    } else {
      const m = norm.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      out.fields[key] = m
        ? { ...f, value: `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` }
        : { ...f, value: '', confidence: 'low', raw: f.value }
    }
  }

  const found = Object.keys(out.fields).length
  out.unparsed = flat.slice(0, 4000)
  out.note = found === 0
    ? 'قُرئ نص من الملف لكن لم يُتعرَّف على أي حقل — راجع النص أدناه'
    : null
  return out
}

/**
 * What a QR on these documents actually carries.
 *
 * Usually a URL to a verification page, sometimes a short structured payload.
 * The page behind the URL is not fetched: it is a third-party site, the browser
 * would be blocked by CORS anyway, and reading it would be the external
 * integration this feature was asked not to build. The URL is preserved so the
 * reviewer can open it, and any CR number embedded in it is used.
 */
export function parseQrPayload(raw) {
  const out = emptyExtraction('qr')
  const text = squash(toAsciiDigits(raw))
  if (!text) return { ...out, note: 'لم يُقرأ محتوى من الرمز' }

  const isUrl = /^https?:\/\//i.test(text)

  if (isUrl) {
    // Verification links carry the registration number as a path segment or a
    // query parameter often enough to be worth reading.
    const digits = text.match(/(?:^|[/?&=])(\d{10})(?:$|[/?&#])/)
    if (digits?.[1]) put(out, 'registryNumber', digits[1], 'high', text)
    out.unparsed = text
    out.note = digits?.[1]
      ? 'الرمز رابط تحقّق — استُخرج منه رقم السجل. افتح الرابط لمطابقة بقية البيانات.'
      : 'الرمز رابط تحقّق ولا يحمل بيانات مقروءة. افتحه وانسخ منه ما يلزم.'
    return out
  }

  // Some certificates encode "label:value" pairs separated by newlines or pipes.
  const pairs = text.split(/[\n|;]+/).map(squash).filter(Boolean)
  if (pairs.length > 1) {
    const joined = pairs.join('\n')
    const parsed = parseDocumentText(joined, 'qr')
    // Read from structured data, so it outranks anything OCR produces.
    for (const [k, v] of Object.entries(parsed.fields)) {
      out.fields[k] = { ...v, confidence: 'high' }
    }
  }

  if (!Object.keys(out.fields).length) {
    const ten = text.match(/(?:^|\D)(\d{10})(?:\D|$)/)
    if (ten?.[1]) put(out, 'registryNumber', ten[1], 'medium', text)
  }

  out.unparsed = text
  if (!Object.keys(out.fields).length) {
    out.note = 'قُرئ الرمز ولم يُتعرَّف على بياناته — المحتوى معروض أدناه للنسخ.'
  }
  return out
}

/** Merge extractions, earlier ones winning — used when a person scans then uploads. */
export function mergeExtractions(...list) {
  const out = emptyExtraction(list.find(Boolean)?.source || 'mixed')
  for (const e of list.filter(Boolean)) {
    for (const [k, v] of Object.entries(e.fields || {})) {
      if (!out.fields[k]) out.fields[k] = v
    }
    if (!out.unparsed && e.unparsed) out.unparsed = e.unparsed
  }
  return out
}
