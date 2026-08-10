#!/usr/bin/env node
/**
 * Everything the state migration can touch, written out before it runs.
 *
 * Not a substitute for the provider's own backup — this is the narrow one, the
 * tables whose rows this work rewrites, in a form that can be read and diffed
 * by eye. A restore from here is a deliberate act, not an automatic one.
 *
 *   node scripts/db-snapshot.mjs <outdir>
 */

import pg from 'pg'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
if (!OUT) {
  console.error('  الاستعمال: node scripts/db-snapshot.mjs <مجلّد>')
  process.exit(1)
}

const TABLES = [
  'companies',
  'company_requests',
  'company_request_events',
  'registration_requests',
  'claim_requests',
  'company_data_requests',
  'clarification_requests',
  'company_documents',
  'tenants',
  'users',
  'reports',
]

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

mkdirSync(OUT, { recursive: true })

const manifest = { at: new Date().toISOString(), tables: {} }

for (const t of TABLES) {
  try {
    const { rows } = await db.query(`select * from public.${t}`)
    writeFileSync(join(OUT, `${t}.json`), JSON.stringify(rows, null, 1), 'utf8')
    manifest.tables[t] = rows.length
    console.log(`  ${t.padEnd(26)} ${String(rows.length).padStart(6)} صفّاً`)
  } catch (e) {
    manifest.tables[t] = `ERROR: ${e.message.slice(0, 60)}`
    console.log(`  ${t.padEnd(26)} ${e.message.slice(0, 50)}`)
  }
}

writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`\n  ✅ النسخة في ${OUT}`)

await db.end()
