#!/usr/bin/env node
/**
 * Run one read-only SQL statement and print the rows.
 *
 * Usage: node scripts/db-query.mjs "select ..."
 *
 * Refuses anything that is not a select, so it cannot be used by accident to
 * change data; migrations go through run-migration.mjs, which is transactional
 * and records what it applied.
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const sql = process.argv[2]
if (!sql) { console.error('  الاستخدام: node scripts/db-query.mjs "select ..."'); process.exit(1) }
if (!/^\s*(select|with|show|explain)\b/i.test(sql)) {
  console.error('  هذه الأداة للقراءة فقط.')
  process.exit(1)
}

function url() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const line = readFileSync('.env.migrations', 'utf8').split('\n').find((l) => l.trim().startsWith('DATABASE_URL='))
  return line.slice(line.indexOf('=') + 1).trim()
}

const client = new pg.Client({ connectionString: url(), ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const { rows } = await client.query(sql)
  if (rows.length === 0) console.log('  (لا صفوف)')
  for (const r of rows) console.log('  ' + Object.entries(r).map(([k, v]) => `${k}=${v === null ? '∅' : JSON.stringify(v)}`).join('  '))
} catch (e) {
  console.error(`  ❌ ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
