/**
 * ⚠️  UNVERIFIED. Read this before trusting anything below.
 * ============================================================================
 *
 * The first four digits of a Saudi commercial registration number identify the
 * chamber that issued it, which in practice means the city. That makes them a
 * tempting fallback when a pasted document has a CR number but no city.
 *
 * The mapping below was assembled from widely-repeated public examples. It is
 * **not** taken from an official Ministry of Commerce table, because no such
 * table was available to check it against. Individual entries may be wrong, and
 * the list is certainly incomplete.
 *
 * Consequences, enforced elsewhere in the engine and not to be relaxed here:
 *
 *   • A city derived from this table is always `status: 'inferred'`, never
 *     `confirmed`, no matter how the rest of the extraction scored.
 *   • It is only consulted when the document did not state a city. A city that
 *     was written down always wins over one deduced from a prefix.
 *   • `method` is reported as `inference:cr_prefix→city`, so a wrong value can
 *     be traced back to this file rather than blamed on the document.
 *
 * TO VERIFY: obtain the official chamber-code list from the Ministry of
 * Commerce — or replace this file entirely with a Wathq lookup, which returns
 * the real city and makes the whole guess unnecessary. That is the intended
 * end state; this table is scaffolding until then.
 */

/** prefix → city name, spelled as cities.js spells it. */
export const CR_CITY_CODES = new Map(Object.entries({
  1010: 'الرياض',
  1011: 'الرياض',
  2050: 'الدمام',
  2051: 'الدمام',
  2052: 'الدمام',
  2055: 'الجبيل',
  2251: 'الأحساء',
  3550: 'مكة المكرمة',
  4030: 'جدة',
  4031: 'جدة',
  4032: 'جدة',
  4650: 'الطائف',
  4700: 'المدينة المنورة',
  5850: 'أبها',
  5900: 'خميس مشيط',
  5950: 'جازان',
  3450: 'ينبع',
  1128: 'الرياض',
  1131: 'الرياض',
}))

/**
 * The city a registration number's prefix suggests, or null.
 *
 * Returns null rather than a best guess for an unknown prefix: an unrecognised
 * chamber code means this table is incomplete, and inventing a city from that
 * is exactly the failure mode the rest of the engine exists to prevent.
 */
export function cityFromCrNumber(cr) {
  const digits = String(cr ?? '').replace(/\D/g, '')
  if (digits.length !== 10) return null
  return CR_CITY_CODES.get(Number(digits.slice(0, 4))) ?? null
}
