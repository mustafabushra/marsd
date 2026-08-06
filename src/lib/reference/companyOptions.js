/**
 * The values a Saudi commercial registration can actually hold.
 *
 * ============================================================================
 * Why these are lists and not free text
 * ============================================================================
 * «شركة ذات مسؤولية محدودة», «ذات مسئوليه محدودة», «ش.ذ.م.م» and «ذ م م» are one
 * legal form written four ways. Stored as typed, they are four values: they do
 * not group, they do not filter, and two records of the same company look like
 * two different kinds of company. A registry whose fields cannot be counted is
 * a registry that cannot be searched.
 *
 * So every field with a fixed vocabulary is a list, used in two places:
 *
 *   the form   — the person picks instead of typing
 *   the import — an extracted string is matched onto one of these values
 *
 * Both read this file. That is the point: a value the importer produces and a
 * value a person picks are then the same string, and nothing downstream has to
 * know which way it arrived.
 *
 * ============================================================================
 * `aliases`
 * ============================================================================
 * The spellings seen in the wild that must map onto the canonical value. They
 * are matched folded, so hamza and taa-marbuta variants need no entry — only
 * genuinely different wordings and abbreviations do.
 */

import { fold } from '../extraction/fold.js'

/** value: what is stored. label: what is shown. aliases: what is recognised. */
const opt = (value, aliases = [], label = value) => ({ value, label, aliases })

// ---------------------------------------------------------------------------
// حالة السجل
// ---------------------------------------------------------------------------
/**
 * Five states, stored across the two columns the database already has.
 *
 * `companies.cr_status` accepts four coded values and nothing else, and the
 * trust score penalises anything that is not `active`. `companies.official_
 * status` carries the specific adverse state — `struck_off`, `liquidation` —
 * and the score has a separate penalty for each.
 *
 * So a status is not one value but two, and both are written. Collapsing the
 * five Arabic states onto the four coded ones would have thrown away exactly
 * the distinction the trust score is built to weigh; adding new codes to
 * `cr_status` would have meant changing a constraint, an enum, the score, the
 * report builder and the knowledge base to express something the schema could
 * already say.
 */
export const CR_STATUS = [
  { ...opt('نشط', ['ساري', 'قائم', 'فعال', 'active']), db: { cr: 'active', official: 'none' } },
  { ...opt('موقوف', ['معلق', 'إيقاف', 'موقوفة', 'suspended']), db: { cr: 'suspended', official: 'suspended' } },
  { ...opt('مشطوب', ['شطب', 'ملغي', 'ملغاة', 'struck off']), db: { cr: 'terminated', official: 'struck_off' } },
  { ...opt('منتهي', ['منتهية', 'منتهي الصلاحية', 'expired']), db: { cr: 'terminated', official: 'none' } },
  { ...opt('تحت التصفية', ['قيد التصفية', 'تصفية', 'under liquidation']), db: { cr: 'suspended', official: 'liquidation' } },
]

/** The Arabic label a person picked → the two columns. Unknown label → active. */
export function crStatusToDb(label) {
  const hit = CR_STATUS.find((o) => o.value === label)
  return hit ? hit.db : { cr: 'active', official: 'none' }
}

/**
 * The two columns → the label to show when a saved company is re-opened.
 *
 * `official_status` is read first because it is the more specific of the two:
 * `terminated` alone cannot tell «مشطوب» from «منتهي», and picking whichever
 * came first in the list would show one of them wrongly half the time.
 */
export function crStatusFromDb(cr, official) {
  const byOfficial = CR_STATUS.find((o) => o.db.official === official && official !== 'none')
  if (byOfficial) return byOfficial.value
  return CR_STATUS.find((o) => o.db.cr === cr && o.db.official === 'none')?.value ?? ''
}

// ---------------------------------------------------------------------------
// نوع المنشأة — the top-level split, only two values
// ---------------------------------------------------------------------------
export const ENTITY_TYPE = [
  opt('شركة', ['شركه']),
  opt('مؤسسة', ['مؤسسة فردية', 'مؤسسه فرديه', 'فردية']),
]

// ---------------------------------------------------------------------------
// نوع الشركة — the legal form, when the entity is a company
// ---------------------------------------------------------------------------
export const COMPANY_TYPE = [
  opt('ذات مسؤولية محدودة', ['شركة ذات مسؤولية محدودة', 'ذات مسئولية محدودة', 'ذ م م', 'ذمم', 'ش ذ م م', 'llc']),
  opt('مساهمة', ['شركة مساهمة', 'مساهمة مقفلة', 'شركة مساهمة مقفلة', 'مساهمة عامة']),
  opt('مساهمة مبسطة', ['شركة مساهمة مبسطة']),
  opt('تضامن', ['شركة تضامن', 'تضامنية', 'شركة تضامنية']),
  opt('توصية بسيطة', ['شركة توصية بسيطة', 'توصية']),
  opt('مهنية', ['شركة مهنية', 'شركة مهنية ذات مسؤولية محدودة']),
  opt('قابضة', ['شركة قابضة']),
  opt('أجنبية', ['شركة أجنبية', 'فرع شركة أجنبية', 'فرع أجنبي']),
  opt('أخرى', ['غير محدد']),
]

// ---------------------------------------------------------------------------
// صفات الشركة
// ---------------------------------------------------------------------------
export const COMPANY_TRAITS = [
  opt('شخص واحد', ['شركة شخص واحد', 'شخص واحد فقط', 'مالك واحد']),
  opt('متعددة الشركاء', ['متعدد الشركاء', 'عدة شركاء', 'شركاء متعددون']),
  opt('غير محدد', []),
]

// ---------------------------------------------------------------------------
// نوع السجل
// ---------------------------------------------------------------------------
export const CR_TYPE = [
  opt('سجل رئيسي', ['رئيسي', 'السجل الرئيسي', 'اصلي', 'أصلي']),
  opt('سجل فرعي', ['فرعي', 'السجل الفرعي', 'فرع']),
]

// ---------------------------------------------------------------------------
// حجم المنشأة — kept because the trust score reads it
// ---------------------------------------------------------------------------
export const ENTITY_SIZE = [
  opt('متناهية الصغر', ['متناهي الصغر', 'micro']),
  opt('صغيرة', ['صغير', 'small']),
  opt('متوسطة', ['متوسط', 'medium']),
  opt('كبيرة', ['كبير', 'large']),
]

/** Every list, by the form field it fills. */
export const OPTION_SETS = {
  crStatus: CR_STATUS,
  entityType: ENTITY_TYPE,
  companyType: COMPANY_TYPE,
  companyTraits: COMPANY_TRAITS,
  crType: CR_TYPE,
  enterpriseSize: ENTITY_SIZE,
}

// ---------------------------------------------------------------------------
// Matching a free string onto one of these values
// ---------------------------------------------------------------------------
/**
 * Built once, at load. A map from every folded spelling — canonical and alias —
 * to the canonical value.
 */
const INDEX = new Map()
for (const [field, list] of Object.entries(OPTION_SETS)) {
  for (const o of list) {
    INDEX.set(`${field}:${fold(o.value)}`, o.value)
    for (const a of o.aliases) INDEX.set(`${field}:${fold(a)}`, o.value)
  }
}

/**
 * The canonical value an extracted string means, or null.
 *
 * Three passes, weakest last:
 *   1. exact, on the folded string — «شركة ذات مسؤولية محدودة» → the option
 *   2. the text contains a known spelling — for a value with extra words
 *      around it, which is how portals print «شركة ذات مسؤولية محدودة (شخص
 *      واحد)»
 *   3. nothing. Returning null rather than the closest guess is deliberate: a
 *      legal form assigned by resemblance is a wrong fact stated confidently,
 *      and the form still accepts the original text as free entry.
 *
 * @param {keyof OPTION_SETS} field
 * @param {string} raw
 * @returns {string|null}
 */
export function matchOption(field, raw) {
  const list = OPTION_SETS[field]
  if (!list) return null

  const f = fold(raw)
  if (!f) return null

  const exact = INDEX.get(`${field}:${f}`)
  if (exact) return exact

  // Longest spelling first, so «مساهمة مبسطة» is not claimed by «مساهمة».
  const spellings = []
  for (const o of list) {
    spellings.push([fold(o.value), o.value])
    for (const a of o.aliases) spellings.push([fold(a), o.value])
  }
  spellings.sort((a, b) => b[0].length - a[0].length)

  for (const [spelling, value] of spellings) {
    if (spelling.length >= 3 && f.includes(spelling)) return value
  }
  return null
}

/**
 * Split what a document calls «نوع المنشأة» into the two fields the form has.
 *
 * The registration prints one line — «شركة ذات مسؤولية محدودة» — that answers
 * both «is it a company or an establishment» and «which legal form». The form
 * asks them separately because they filter differently, so the single string is
 * divided here rather than in the extractor: this is knowledge about the option
 * lists, and it belongs with them.
 *
 * @returns {{entityType: string|null, companyType: string|null}}
 */
export function splitEntityType(raw) {
  const f = fold(raw)
  if (!f) return { entityType: null, companyType: null }

  const companyType = matchOption('companyType', raw)

  // An establishment is never a company form; the words «مؤسسة فردية» must not
  // come back as entityType «شركة» just because the sentence is long.
  const isEstablishment = /مؤسسه|فرديه/.test(f) && !/شركه/.test(f)

  return {
    entityType: isEstablishment ? 'مؤسسة' : (companyType || /شركه/.test(f)) ? 'شركة' : null,
    companyType: isEstablishment ? null : companyType,
  }
}
