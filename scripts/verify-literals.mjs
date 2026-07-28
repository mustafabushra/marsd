#!/usr/bin/env node
/**
 * Does every string the code writes to a constrained column pass that column's
 * CHECK?
 *
 * check-enum-drift already exists and reported no drift while eleven of twelve
 * notification types were being refused. It compares src/lib/enums.ts against
 * the database — two hand-maintained lists, and the code writes neither. A value
 * typed straight into a screen is invisible to it, which is exactly how
 * notifications_type_check broke: the constraint listed four types, the screens
 * sent twelve, and enums.ts did not mention notifications at all. Both sides of
 * the comparison agreed, and neither described what runs. It also covered 8 of
 * the 28 list constraints in the schema.
 *
 * This reads the constraints from the database and the literals from the source,
 * so neither side is a list someone has to remember to update.
 *
 * A value the code writes and the column refuses is a row that will never exist,
 * and on this platform those failures are usually caught and logged rather than
 * shown — which is why they survive for months.
 *
 * Usage: node scripts/verify-literals.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: constraints } = await c.query(`
  select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
    from pg_constraint
   where connamespace = 'public'::regnamespace
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%ANY%'
   order by 1`)
await c.end()

// CHECK (((type)::text = ANY ((ARRAY['a'::character varying, ...])::text[])))
const parse = (def) => {
  const col = def.match(/\(\(?([a-z_]+)\)?::text\s*=\s*ANY/)?.[1]
  if (!col) return null
  const vals = [...def.matchAll(/'([^']+)'::character varying/g)].map((m) => m[1])
  return vals.length ? { col, vals } : null
}

const allowed = new Map()
for (const row of constraints) {
  const p = parse(row.def)
  if (!p) continue
  allowed.set(`${row.tbl.replace(/^public\./, '')}.${p.col}`, {
    values: new Set(p.vals),
    constraint: row.conname,
  })
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(full)
  }
  return out
}

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

// Only literals inside an insert or update payload. Scanning whole files accused
// api/award-credits.js of writing Arabic sentences to credits_ledger.reason —
// they are `reason:` keys in JSON error responses, in a file that also happens
// to touch that table. Fourteen false accusations against three real ones is a
// tool nobody reads twice.
const WRITE = /\.from\(\s*['"]([a-z_]+)['"]\s*\)\s*\.(insert|update|upsert)\(/gs
const FIELD = /\b([a-z_]+)\s*:\s*'([^']+)'/g

const findings = []

for (const file of walk('src').concat(walk('api'))) {
  const src = stripComments(readFileSync(file, 'utf8'))

  for (const w of [...src.matchAll(WRITE)]) {
    const table = w[1]
    const start = w.index + w[0].length

    // Balanced to the matching close paren, capped so a runaway match cannot
    // swallow the rest of the file.
    let depth = 1
    let end = start
    while (end < src.length && depth > 0 && end - start < 2000) {
      const ch = src[end]
      if (ch === '(' || ch === '{' || ch === '[') depth++
      else if (ch === ')' || ch === '}' || ch === ']') depth--
      end++
    }

    for (const m of src.slice(start, end).matchAll(FIELD)) {
      const [, col, val] = m
      const target = allowed.get(`${table}.${col}`)
      if (!target || target.values.has(val)) continue
      findings.push({
        file: file.split('\\').join('/'),
        column: `${table}.${col}`,
        value: val,
        constraint: target.constraint,
        allowed: [...target.values],
      })
    }
  }
}

// A checker that matches nothing reports success, so prove it can still see.
// The first working version of this file carried a stray backspace byte where a
// word boundary was meant: the regex demanded a literal control character before
// every column name, matched nothing anywhere, and printed a clean pass — the
// exact silent-success failure it exists to catch.
const canaryWrite = [...`x.from('notifications').insert({ type: 'zzz' })`.matchAll(WRITE)]
const canaryField = [...`{ type: 'zzz' }`.matchAll(FIELD)]
if (canaryWrite.length !== 1 || canaryField.length !== 1) {
  console.error('\n  ❌ الفحص لا يرى نمطه الخاص — النتيجة أدناه بلا قيمة\n')
  process.exit(2)
}

console.log(`\n  ${allowed.size} عموداً مقيّداً · ${constraints.length} قيداً\n`)

if (findings.length === 0) {
  console.log('  ✅ كل قيمة يكتبها الكود مقبولة في عمودها\n')
  process.exit(0)
}

const grouped = new Map()
for (const f of findings) {
  const k = `${f.column}=${f.value}`
  if (!grouped.has(k)) grouped.set(k, { ...f, files: new Set() })
  grouped.get(k).files.add(f.file)
}

console.log('  قيم يكتبها الكود ويرفضها القيد — الصف لن يُدرَج أبداً:\n')
for (const g of grouped.values()) {
  console.log(`  ❌ ${g.column} = '${g.value}'`)
  console.log(`       القيد:   ${g.constraint}`)
  console.log(`       المسموح: ${g.allowed.join(' · ')}`)
  for (const f of g.files) console.log(`       ${f}`)
  console.log('')
}
console.log(`  ${grouped.size} قيمة مرفوضة\n`)
process.exit(1)
