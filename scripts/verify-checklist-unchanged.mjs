#!/usr/bin/env node
/**
 * The documents checklist says exactly what it said before.
 *
 * Migration 115 moved the nine document types out of `company_document_checklist`
 * into `company_document_types`, so the phone page could name a document in
 * Arabic. Everything else in that function was meant to be untouched.
 *
 * «Meant to be» is the part worth checking. The function derives a state, an
 * allowed action, a version count and the current document per type; a list
 * that came back one column short, or in a different order, would look fine on
 * screen until somebody's verified certificate rendered as missing.
 *
 * So this reads the real answer for real companies as the real owners, against
 * the function as it stands, and compares it to a snapshot taken before the
 * change. Companies that actually have documents — comparing two empty lists
 * proves nothing and would pass no matter what broke.
 *
 *   node scripts/verify-checklist-unchanged.mjs --capture   before the change
 *   node scripts/verify-checklist-unchanged.mjs             after it
 */

import pg from 'pg'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SNAPSHOT = '.checklist-before.json'
const CAPTURE = process.argv.includes('--capture')

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

/**
 * Read the checklist the way the product does: inside a transaction, as a
 * signed-in owner.
 *
 * `set_config(..., true)` is local to the transaction. Called outside one it is
 * discarded before the next statement, `auth.jwt()` sees nothing, and the
 * function's own guard returns `[]` — so the first version of this script
 * compared nine empty lists to nine empty lists and reported everything
 * identical. It was, and it meant nothing.
 */
async function readAll() {
  const { rows } = await c.query(`
    select u.id as uid, t.company_id as cid, count(d.id)::int as n
      from public.users u
      join public.tenants t on t.id = u.tenant_id
      left join public.company_documents d on d.company_id = t.company_id
     where t.company_id is not null
     group by 1, 2
     having count(d.id) > 0
     order by n desc
     limit 8`)

  if (!rows.length) throw new Error('لا توجد شركة بمستندات — لا شيء يستحق المقارنة')

  const out = {}
  for (const r of rows) {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: r.uid, role: 'authenticated' })])
    const { rows: [q] } = await c.query(
      'select public.company_document_checklist($1) as v', [r.cid])
    await c.query('rollback')
    out[`${r.uid}|${r.cid}`] = q.v
  }
  return out
}

const now = await readAll()
const sizes = Object.values(now).map((v) => (v || []).length)
if (sizes.every((n) => n === 0)) {
  console.log('\n  ❌ كل القوائم فارغة — الفحص لا يقارن شيئاً\n')
  await c.end()
  process.exit(2)
}

if (CAPTURE) {
  writeFileSync(SNAPSHOT, JSON.stringify(now, null, 1))
  console.log(`\n  ✔ التُقطت ${Object.keys(now).length} قائمة (${sizes.join('، ')} بنداً)\n`)
  await c.end()
  process.exit(0)
}

if (!existsSync(SNAPSHOT)) {
  console.log(`\n  ❌ لا توجد لقطة — شغّل --capture قبل التغيير\n`)
  await c.end()
  process.exit(2)
}

const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
let diffs = 0

for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
  const a = JSON.stringify(before[key] ?? null)
  const b = JSON.stringify(now[key] ?? null)
  const label = key.split('|')[1].slice(0, 8)
  if (a === b) {
    console.log(`  ✅ ${label} — ${(now[key] || []).length} بنداً، مطابقة`)
  } else {
    diffs += 1
    console.log(`  ❌ ${label} اختلفت`)
    const A = before[key] || []
    const B = now[key] || []
    for (let i = 0; i < Math.max(A.length, B.length); i += 1) {
      if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) {
        console.log(`        قبل: ${JSON.stringify(A[i])?.slice(0, 110)}`)
        console.log(`        بعد: ${JSON.stringify(B[i])?.slice(0, 110)}`)
      }
    }
  }
}

await c.end()
console.log(diffs ? `\n  ❌ ${diffs} قائمة تغيّرت\n` : `\n  ✅ القائمة كما كانت حرفياً\n`)
process.exit(diffs ? 1 : 0)
