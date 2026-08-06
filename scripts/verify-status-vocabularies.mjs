#!/usr/bin/env node
/**
 * Do the screens label the values the database can actually hold?
 *
 * /admin/subscriptions had a label for `past_due`, which the CHECK constraint
 * forbids, and none for `cancelled` or `failed`, which it allows. Its cancel
 * button wrote `canceled` — one L — so the only way to end a subscription was
 * rejected on every click, and the operator saw a raw Postgres error.
 *
 * Nothing catches that. The label map is plain data, the write is a string, and
 * the constraint lives in the database; all three can be edited without the
 * other two noticing. Tests do not help either — a test would be written from
 * the same wrong list.
 *
 * So the constraint is read at check time and compared with what the screen
 * knows. Two failures matter and they are different:
 *
 *   - a value the database allows and the screen cannot name → English leaks
 *     into an Arabic interface, or worse, a state nobody can see
 *   - a value the screen names and the database forbids → dead code that
 *     documents a state that does not exist, and invites writing it
 *
 *   node scripts/verify-status-vocabularies.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

/** The values a CHECK constraint on `column` permits. */
async function allowed(table, column) {
  const { rows } = await c.query(`
    select pg_get_constraintdef(oid) as d from pg_constraint
     where conrelid = $1::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%' || $2 || '%'`, [table, column])
  const vals = new Set()
  for (const r of rows) for (const m of r.d.matchAll(/'([a-z_]+)'::/g)) vals.add(m[1])
  return vals
}

/** The keys of an object literal declared as `const NAME = { … }`. */
function mapKeys(src, name) {
  const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\}`).exec(src)
  if (!m) return null
  return new Set([...m[1].matchAll(/^\s{2}([a-z_]+)\s*:/gm)].map((x) => x[1]))
}

const SCREENS = [
  {
    file: 'src/pages/AdminSubscriptions.jsx',
    map: 'STATUS',
    table: 'public.subscriptions',
    column: 'status',
    // Values the screen deliberately never shows. None today; kept so a future
    // exception has to be written down rather than argued for in a review.
    unlabelled: [],
  },
]

for (const s of SCREENS) {
  const src = readFileSync(s.file, 'utf8')
  const keys = mapKeys(src, s.map)
  const vals = await allowed(s.table, s.column)
  const where = `${s.file.split('/').pop()} · ${s.map}`

  if (!keys) { check(false, where, `لم أجد ${s.map} — تغيّر شكل الملف`); continue }
  if (!vals.size) { check(false, where, `لا قيد CHECK على ${s.table}.${s.column}`); continue }

  const missing = [...vals].filter((v) => !keys.has(v) && !s.unlabelled.includes(v))
  check(missing.length === 0, `${where} — كل حالة ممكنة لها اسم عربي`,
    `بلا اسم: ${missing.join('، ')}`)

  const ghosts = [...keys].filter((k) => !vals.has(k))
  check(ghosts.length === 0, `${where} — ولا اسم لحالة لا وجود لها`,
    `القيد يرفضها: ${ghosts.join('، ')}`)

  // And every status this screen writes must be one the column accepts. The
  // spelling is the thing that broke, and it broke in a string literal.
  //
  // Literals are not enough on their own. Fixing the bug moved the value into
  // `const CANCELLED = 'cancelled'`, and a check that only reads
  // `status: '…'` then matched nothing and passed — reporting the write as
  // verified while verifying no write at all. Module-level string constants are
  // resolved so that moving a value out of the call site does not move it out
  // of the check.
  const consts = Object.fromEntries(
    [...src.matchAll(/^const ([A-Z_][A-Z0-9_]*) = '([a-z_]+)'/gm)].map((m) => [m[1], m[2]]))

  const written = [...src.matchAll(/status:\s*(?:'([a-z_]+)'|([A-Z_][A-Z0-9_]*))/g)]
    .map((m) => (m[1] !== undefined ? m[1] : consts[m[2]]))
    .filter(Boolean)

  check(written.length > 0, `${where} — الشاشة تكتب حالة يمكن فحصها`,
    'لم أجد أي كتابة لحالة — الفحص التالي لا يقيس شيئاً')

  const bad = [...new Set(written)].filter((v) => !vals.has(v))
  check(bad.length === 0, `${where} — وما تكتبه الشاشة مقبول في العمود`,
    `مرفوض: ${bad.join('، ')}`)
}

await c.end()
console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
