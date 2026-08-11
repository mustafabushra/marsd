/**
 * The commercial register, as the Ministry of Commerce publishes it.
 *
 * open.data.gov.sa carries «السجلات التجارية القائمة» — every active commercial
 * registration in the Kingdom, refreshed each quarter, free and public. It is
 * the same ten fields Marsad already keeps about a company, from the authority
 * that issues them.
 *
 * ============================================================================
 * Why the file is not fetched by the server
 * ============================================================================
 * The dataset's own metadata is served over the API and is read here. Its file
 * is not: `downloadUrl` points at a SharePoint *folder* share
 * (`/:f:/g/personal/…`) which answers a server request with `403 FORBIDDEN`,
 * thirteen bytes long. The resource is labelled `format: "API"`, but that is a
 * word in the metadata — the record carries no query endpoint, and six of the
 * platform's plausible ones (`/records`, `/data`, `/export`, `/download`, …)
 * return the site's HTML fallback, which is exactly what an invented path
 * returns. There is nothing there to call.
 *
 * So the file is downloaded once from the portal by a person, and handed to
 * Marsad. What the API does provide — who published it, which quarter, when it
 * was last updated — is fetched and shown, so an import is labelled with its
 * provenance rather than being an anonymous spreadsheet.
 */

export const DATASET_ID = 'ed041830-933d-4b93-aab2-c3b78822b22f'
export const PORTAL_URL = `https://open.data.gov.sa/data/datasets/resource/${DATASET_ID}`


/**
 * The ten columns the Ministry publishes, mapped to what Marsad stores.
 *
 * Several names per field, because the header wording has changed between
 * quarters and a person importing last quarter's file should not have to care.
 * `الكيان القانوني.1` is real: the sheet carries the column twice and the
 * parser suffixes the duplicate.
 */
export const REGISTRY_COLUMNS = [
  { field: 'crNumber', label: 'رقم السجل', names: ['رقم السجل', 'رقم السجل التجاري'] },
  { field: 'name', label: 'اسم السجل', names: ['اسم السجل', 'اسم المنشأة', 'اسم الشركة'] },
  { field: 'unifiedNumber', label: 'الرقم الموحّد', names: ['الرقم الموحد', 'الرقم الموحّد', 'الرقم الموحد للمنشأة'] },
  { field: 'crType', label: 'نوع السجل', names: ['نوع السجل', 'نوع السجل التجاري'] },
  { field: 'entityType', label: 'الكيان القانوني', names: ['الكيان القانوني', 'الكيان القانوني.1'] },
  { field: 'capital', label: 'رأس المال', names: ['رأس المال', 'رأس مال المنشأة'] },
  { field: 'region', label: 'المنطقة', names: ['المنطقة'] },
  { field: 'city', label: 'المدينة', names: ['المدينة'] },
  { field: 'foundingDate', label: 'تاريخ إنشاء السجل', names: ['تاريخ انشاء السجل', 'تاريخ إنشاء السجل', 'تاريخ الإنشاء'] },
]

/** The first of several possible headers that this row actually carries. */
export function readColumn(row, names) {
  for (const n of names) {
    const v = row[n]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

/** Digits only. Registration numbers arrive with spaces, dashes and Arabic-Indic digits. */
export function digits(value) {
  if (value == null) return null
  const western = String(value).replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  const only = western.replace(/\D/g, '')
  return only || null
}

/**
 * A published date, as a date and not as whatever Excel felt like.
 *
 * `cellDates` gives a Date for a real date cell and a string for a text one,
 * and the Ministry's files contain both. A value that cannot be read as a date
 * is dropped rather than guessed at — a wrong founding date on a company record
 * is worse than a missing one.
 */
export function isoDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** One sheet row, as the fields Marsad keeps. Null where the sheet is silent. */
export function toCompany(row) {
  const get = (field) => {
    const col = REGISTRY_COLUMNS.find((c) => c.field === field)
    return col ? readColumn(row, col.names) : null
  }

  // Capital, or nothing.
  //
  // Stripping non-digits from «غير محدد» leaves an empty string, and `Number('')`
  // is 0 — which `Number.isFinite` accepts. So a company whose capital the
  // Ministry did not state was being recorded as a company with no capital.
  // Two different claims, and the test below is what caught it.
  const capitalRaw = get('capital')
  const capitalDigits = capitalRaw ? String(capitalRaw).replace(/[^\d.]/g, '') : ''
  const capital = capitalDigits ? Number(capitalDigits) : null

  return {
    crNumber: digits(get('crNumber')),
    name: get('name'),
    unifiedNumber: digits(get('unifiedNumber')),
    crType: get('crType'),
    entityType: get('entityType'),
    // An unreadable number is left out rather than stored as 0 — «no capital»
    // and «not stated» are different claims about a company.
    capital: Number.isFinite(capital) ? capital : null,
    region: get('region'),
    city: get('city'),
    foundingDate: isoDate(get('foundingDate')),
  }
}

/** Which of the ten the sheet actually carries, and which are absent. */
export function describeHeaders(headers) {
  const present = []
  const missing = []
  for (const col of REGISTRY_COLUMNS) {
    if (col.names.some((n) => headers.includes(n))) present.push(col)
    else missing.push(col)
  }
  return { present, missing }
}

/**
 * Who published this, which quarter, and when it was last refreshed.
 *
 * Best effort. The import works without it — the file is the file — but an
 * import labelled «Ministry of Commerce, Q2 2026, updated 27 July» is a
 * different thing from an anonymous spreadsheet somebody uploaded, and the
 * difference is what makes `source: 'official'` an honest claim.
 */
export async function fetchDatasetInfo(signal) {
  // Through the server, not straight at the portal.
  //
  // This called open.data.gov.sa directly. The portal sends no
  // Access-Control-Allow-Origin, so the browser refused the request every time,
  // in every environment, from the day it was written — and because the caller
  // treats the failure as non-fatal, the import kept working and the label
  // simply never appeared. `source: 'official'` was a claim with nothing behind
  // it. A server has no origin to be checked, and gets the real record.
  const r = await fetch(`/api/registry-source?dataset=${DATASET_ID}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!r.ok) {
    const why = await r.json().catch(() => null)
    throw new Error(why?.error || 'تعذّر الوصول إلى بوابة البيانات المفتوحة')
  }

  const d = await r.json()
  // Unverified means the portal answered without naming the dataset. That is
  // reported as such rather than shown as provenance, because a label nobody
  // confirmed is worse than no label.
  if (!d.verified) throw new Error('لم تؤكّد البوابة هوية هذه المجموعة')

  return {
    titleAr: d.titleAr || null,
    providerAr: d.providerAr || null,
    updatedAt: d.updatedAt || null,
    frequency: d.frequency || null,
  }
}
