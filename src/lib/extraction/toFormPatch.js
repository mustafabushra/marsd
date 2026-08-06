/**
 * The bridge between the engine and the rest of Marsad.
 *
 * The engine speaks its own contract — snake_case names, a 0-100 score, a
 * three-way status — because that contract was specified and must not drift.
 * The add-company form and the review sheet speak the shape every other import
 * source already produces: camelCase names and a high/medium/low confidence.
 *
 * Every translation between the two happens here and nowhere else. That is what
 * keeps `crExtractor.js` pure and testable in isolation, and what keeps the
 * review sheet from needing to know that a new source exists at all.
 */

import { extractCommercialRegister } from './crExtractor.js'
import { normalizeText } from './normalizeText.js'

/** engine field → add-company form field. Absent here means "not on the form". */
const TO_FORM = {
  company_name_ar: 'companyName',
  company_name_en: 'nameEn',
  cr_number: 'registryNumber',
  unified_number: 'unifiedNumber',
  entity_type: 'entityType',
  company_type: 'companyType',
  cr_status: 'crStatus',
  entity_size: 'enterpriseSize',
  cr_expiry_date: 'crExpiryDate',
  cr_type: 'crType',
  establishment_date: 'foundingDate',
  sector: 'sector',
  main_activity: 'mainActivity',
  sub_activities: 'subActivities',
  city: 'city',
  region: 'region',
  national_address: 'nationalAddress',
  website: 'website',
  email: 'officialEmail',
  phone: 'phone',
  // The form grew boxes for these when it was rebuilt around the shape of an
  // actual registration. They used to land in `extras` — extracted correctly,
  // then shown as a read-only footnote beside the empty field they belonged in.
  company_traits: 'companyTraits',
  cr_version: 'crVersion',
  capital: 'capital',
  annual_confirmation_date: 'annualConfirmationDate',
}

/** Fields with no box on the form. Kept, not dropped — they are still facts. */
const EXTRA_LABELS = {
  vat_number: 'الرقم الضريبي',
  manager_name: 'اسم المدير',
  postal_code: 'الرمز البريدي',
  short_address: 'العنوان المختصر',
}

/**
 * status → the badge the review screen already draws.
 *
 * `confirmed` and `inferred` are the engine's own bands and map straight
 * across. Nothing maps to 'low': a field the engine was not reasonably sure of
 * is `missing`, and a missing field has no value to badge.
 */
const CONFIDENCE = { confirmed: 'high', inferred: 'medium' }

const WARNING_TEXT = {
  multiple_companies_detected:
    'النص يحتوي على أكثر من منشأة — عُبّئت واحدة فقط. راجع الحقول وتأكد أنها للمنشأة الصحيحة.',
  nothing_recognised:
    'لم يُتعرّف على أي حقل. تأكد أنك نسخت صفحة السجل التجاري كاملة بعد ظهور بياناتها.',
  input_truncated:
    'النص طويل جداً — قُرئت أول 50 كيلوبايت منه فقط.',
  value_not_in_source:
    'أُسقط حقل لأن قيمته لم تُطابق النص المصدر — لم يُحفظ شيء غير مؤكد.',
}

/**
 * Run the engine and translate the result for the review sheet.
 *
 * @param {string} rawText
 * @returns the shape every companyImport source returns, plus `engine` — the
 *   untouched ExtractionResult, so the review screen can show the source line
 *   behind a field and the alternatives behind a value.
 */
export function extractForForm(rawText) {
  const result = extractCommercialRegister(rawText)

  const fields = {}
  const extras = {}

  for (const [name, f] of Object.entries(result.fields)) {
    if (f.value == null || f.status === 'missing') continue

    const formField = TO_FORM[name]
    if (formField) {
      fields[formField] = {
        value: f.value,
        confidence: CONFIDENCE[f.status] ?? 'medium',
        // What the reviewer needs in order to disagree: where it came from, and
        // how sure the engine was. A percentage without a source is a number to
        // nod at; a source line is something to check.
        raw: f.sourceLine,
        // Which line, so the screen can point at it in the pasted text. A
        // derived field has none, and showing nothing is the honest answer.
        sourceIndex: f.sourceIndex,
        method: f.method,
        score: f.score,
        alternatives: f.alternatives,
      }
      continue
    }

    const label = EXTRA_LABELS[name]
    if (label) extras[label] = f.value
  }

  // The form's number inputs reject a grouped figure: «2,000,000» in an
  // <input type="number"> shows as empty. The separators are stripped here, in
  // the adapter, and not in the engine — the engine's promise is that its value
  // appears verbatim in the document, and «2000000» does not.
  for (const key of ['capital', 'crVersion']) {
    const f = fields[key]
    if (!f) continue
    const digits = String(f.value).replace(/[^\d.]/g, '')
    if (digits) fields[key] = { ...f, value: digits, raw: f.raw ?? String(f.value) }
    else delete fields[key]
  }

  // Managers as a list, for the tags field. A registration names several and
  // the engine reads them as one line, so the line is split here rather than
  // arriving as a single tag containing three people.
  const managerField = result.fields.manager_name
  const managers = managerField?.value
    ? (managerField.parts ?? String(managerField.value).split(/[،,]|\s+و\s+/))
        .map((m) => m.trim()).filter((m) => m.length > 3)
    : []

  // A Hijri-only date cannot fill a Gregorian form field. Rather than convert
  // it — an off-by-one there produces a plausible, undetectable error — the
  // field is left for the person and the date is shown beside it.
  for (const [name, f] of Object.entries(result.fields)) {
    if (!f.date || f.date.calendar !== 'hijri') continue
    const formField = TO_FORM[name]
    if (formField && fields[formField]) {
      fields[formField].confidence = 'low'
      fields[formField].raw = `${f.sourceLine ?? f.value} — هجري، حوّله يدوياً`
    }
  }

  const notes = result.meta.warnings.map((w) => WARNING_TEXT[w]).filter(Boolean)

  return {
    source: 'cr-text',
    fields,
    managers,
    extras,
    unparsed: null,
    note: notes.join(' ') || null,
    meta: {
      parser: 'crExtractor',
      layoutMode: result.meta.layoutMode,
      fieldsFound: result.meta.fieldsFound,
      durationMs: result.meta.durationMs,
      // The cleaned lines, so the screen can show the person the exact line a
      // field came from. Recomputed rather than threaded through the engine:
      // normalizeText is pure and cheap, and keeping the engine's return value
      // to its specified contract is worth one extra pass over the text.
      lines: normalizeText(rawText).lines,
    },
    // The full result, for the review screen's highlighting and alternatives.
    engine: result,
  }
}
