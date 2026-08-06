/**
 * The only two fields this engine is permitted to produce without reading them.
 *
 * `region` follows from the city, and `sector` from the activity — both are
 * facts about the value already extracted, not readings of the document. That
 * is why they are the sole exceptions to the substring rule in crExtractor.js,
 * and why both are forced to `status: 'inferred'` regardless of how confident
 * the derivation is. A reviewer who disagrees can change them; a reviewer who
 * cannot tell they were derived cannot.
 *
 * Anything else missing stays missing. There is no rule here that fills a blank
 * because a blank looked untidy.
 */

import { fold } from './fold.js'
import { CITIES, CITY_KEYS } from './data/cities.js'
import { sectorFromIsic, sectorFromText } from './data/isic.js'
import { cityFromCrNumber } from './data/crCityCodes.js'
import { SCORE } from './patterns.js'

const made = (value, method, score) => ({ value, score, method, inferred: true })

/**
 * @param {Map<string, object>} chosen — the resolved fields
 * @returns {Array<{field, value, score, method, inferred}>}
 */
export function infer(chosen) {
  const out = []

  // ---- region, from the city ------------------------------------------------
  if (!chosen.has('region')) {
    const cityValue = chosen.get('city')?.value
    if (cityValue) {
      const f = fold(cityValue)
      const key = CITY_KEYS.find((k) => f === k) || CITY_KEYS.find((k) => f.includes(k))
      if (key) {
        out.push({
          field: 'region',
          ...made(CITIES.get(key).region, 'inference:city→region', SCORE.inference),
        })
      }
    }
  }

  // ---- city, from the registration number's prefix --------------------------
  // Last resort, and only when the document named no city at all. The table it
  // relies on is explicitly unverified — see data/crCityCodes.js — so this can
  // never reach the `confirmed` band.
  if (!chosen.has('city') && chosen.has('cr_number')) {
    const city = cityFromCrNumber(chosen.get('cr_number').value)
    if (city) {
      out.push({ field: 'city', ...made(city, 'inference:cr_prefix→city', 65) })
      const entry = CITIES.get(fold(city))
      if (entry && !chosen.has('region')) {
        out.push({ field: 'region', ...made(entry.region, 'inference:cr_prefix→region', 62) })
      }
    }
  }

  // ---- sector, from the activity -------------------------------------------
  if (!chosen.has('sector')) {
    const activity = chosen.get('main_activity')?.value
      || chosen.get('sub_activities')?.value
    if (activity) {
      // The ISIC code is a published standard, so it outranks reading the
      // Arabic — «مركز» belongs to a shopping centre and a clinic equally.
      const code = /\b(\d{4,7})\b/.exec(activity)?.[1]
      const byCode = code ? sectorFromIsic(code) : null
      if (byCode) {
        out.push({ field: 'sector', ...made(byCode, 'inference:isic→sector', 82) })
      } else {
        const byText = sectorFromText(fold(activity))
        if (byText) out.push({ field: 'sector', ...made(byText, 'inference:activity→sector', 68) })
      }
    }
  }

  return out
}
