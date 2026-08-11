#!/usr/bin/env node
/** Ad-hoc read-only query against the project database. `node scripts/q.mjs "select 1"` */
import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()
try {
  const { rows } = await db.query(process.argv[2])
  console.log(JSON.stringify(rows, null, 1).slice(0, 4000))
} catch (e) {
  console.log('ERR:', e.message)
} finally { await db.end() }
