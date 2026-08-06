/**
 * Choose. One value per field, one field per piece of text.
 *
 * ============================================================================
 * Why mutual exclusion is not optional
 * ============================================================================
 * A ten-digit number matches the commercial-registration rule and the unified-
 * number rule both. Score the fields independently and «4030304834» is written
 * into both boxes — a record that is internally contradictory and looks
 * confident about it. Locking the text as well as the field is what stops that:
 * once a number has been spent on one field it is gone, and the other field has
 * to win on its own evidence or stay empty.
 *
 * ============================================================================
 * Why the tie-break avoids line numbers
 * ============================================================================
 * Equal scores have to be broken by something, and the obvious candidate —
 * whichever appeared first — would make the whole engine order-dependent, which
 * is the one property the tests exist to disprove. So ties are broken on the
 * candidate's own content: how it was found, then the text itself. Two runs
 * over the same lines in any order reach the same answer.
 */

/** Trust in the method, used only to break exact score ties. */
const METHOD_RANK = {
  'column:zip': 9,
  'label:same_line': 8,
  'label:next_line': 7,
  'label:list_head': 7,
  'label:list': 7,
  'pattern:shape': 6,
  'label:proximity': 5,
  'pattern:city_in_line': 4,
}

/**
 * @param {Array} candidates from scoreAll
 * @returns {{ chosen: Map<string, object>, alternatives: Map<string, Array> }}
 */
export function resolveCandidates(candidates) {
  const ordered = [...candidates].sort((a, b) =>
    b.score - a.score
    || (METHOD_RANK[b.method] ?? 0) - (METHOD_RANK[a.method] ?? 0)
    || String(a.value).localeCompare(String(b.value), 'ar')
    || a.field.localeCompare(b.field))

  const chosen = new Map()
  const takenTokens = new Set()
  const alternatives = new Map()

  for (const c of ordered) {
    if (chosen.has(c.field)) {
      // Runner-up for a field that is already filled. Kept so a reviewer who
      // disagrees with the pick has somewhere to go, but only distinct values —
      // the same string found three ways is one alternative, not three.
      const list = alternatives.get(c.field) ?? []
      if (!list.some((x) => x.value === c.value)
          && c.value !== chosen.get(c.field).value
          && list.length < 3) {
        list.push({ value: c.value, score: c.score })
        alternatives.set(c.field, list)
      }
      continue
    }
    // The text is spoken for. Note it as an alternative for this field anyway:
    // that the same token was the second-best answer here is exactly what a
    // reviewer needs to see when the winner looks wrong.
    if (takenTokens.has(c.token)) {
      const list = alternatives.get(c.field) ?? []
      if (!list.some((x) => x.value === c.value) && list.length < 3) {
        list.push({ value: c.value, score: c.score })
        alternatives.set(c.field, list)
      }
      continue
    }

    chosen.set(c.field, c)
    takenTokens.add(c.token)
  }

  return { chosen, alternatives }
}
