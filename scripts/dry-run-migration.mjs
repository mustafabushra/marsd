#!/usr/bin/env node
/**
 * Apply a migration, then throw it away.
 *
 * run-migration.mjs wraps each file in a transaction, so a failure already costs
 * nothing — but a *success* commits, and some mistakes only become visible after
 * that. Migration 108 was written with `entity_id = p_company_id` where the
 * column is text, and it failed on the first run of its own self-check; had the
 * check been weaker it would have shipped a function that silently matched
 * nothing. Running it against the real database and then rolling back is the
 * cheapest way to find that out.
 *
 * Same connection and same file as the real runner. The only difference is the
 * rollback at the end, and that NOTICEs are printed — the self-checks written
 * into these migrations report through them.
 *
 *   node scripts/dry-run-migration.mjs backend/migrations/109_....sql
 *
 * A pass here is not a guarantee: anything the file itself does not check is
 * still unchecked. It only says the SQL runs and its own assertions hold.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error('  استخدام: node scripts/dry-run-migration.mjs <ملف .sql>')
  process.exit(1)
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
if (!url) { console.error('  DATABASE_URL غير موجود في .env.migrations'); process.exit(1) }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
c.on('notice', (n) => console.log(`  ${n.message}`))
await c.connect()

const sql = readFileSync(resolve(file), 'utf8')
console.log(`\n  تجربة ${file} (${sql.length} حرف) — لن تُثبَّت\n`)

await c.query('begin')
try {
  await c.query(sql)
  console.log('\n  ✅ يعمل، وفحوصاته الذاتية نجحت — أُلغي التغيير\n')
} catch (e) {
  console.log(`\n  ❌ ${e.message}`)
  if (e.where) console.log(`     ${e.where.split('\n')[0]}`)
  process.exitCode = 1
} finally {
  await c.query('rollback')
  await c.end()
}
