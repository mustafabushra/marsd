#!/usr/bin/env node
/**
 * Apply a SQL migration to the project database.
 *
 * The repository carries eleven migrations under backend/migrations and had no
 * way to run any of them: they were applied by pasting into the Supabase SQL
 * editor, which leaves no record of what ran where, and makes "is 011 applied?"
 * a question nobody can answer without looking.
 *
 * Usage:
 *   node scripts/run-migration.mjs backend/migrations/011_plans_entitlements.sql
 *   node scripts/run-migration.mjs --check          # connection + applied list
 *
 * Credentials come from DATABASE_URL, read from .env.migrations (git-ignored).
 * Nothing is read from the command line, so a password cannot end up in shell
 * history.
 *
 * Each file runs inside a transaction: a migration that fails half way leaves
 * the database exactly as it was, rather than half-migrated with no way to tell
 * which half.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const ENV_FILE = '.env.migrations'

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (!existsSync(ENV_FILE)) {
    console.error(`\n  لا يوجد ${ENV_FILE}. أنشئه بسطر واحد:\n  DATABASE_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres\n`)
    process.exit(1)
  }
  const line = readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL='))
  if (!line) {
    console.error(`\n  ${ENV_FILE} موجود لكن بلا DATABASE_URL\n`)
    process.exit(1)
  }
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
}

/** Records what ran, so the question is answerable from the database itself. */
const LEDGER = `
  create table if not exists public.schema_migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now(),
    checksum    text
  );
`

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('\n  الاستخدام: node scripts/run-migration.mjs <ملف.sql>  أو  --check\n')
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },   // Supabase terminates TLS at its edge
    statement_timeout: 120_000,
  })

  try {
    await client.connect()
  } catch (err) {
    console.error(`\n  ❌ تعذّر الاتصال: ${err.message}\n`)
    process.exit(1)
  }

  try {
    await client.query(LEDGER)

    if (arg === '--check') {
      const { rows: version } = await client.query('select current_database() as db, version() as v')
      const { rows: applied } = await client.query('select filename, applied_at from public.schema_migrations order by applied_at')
      console.log(`\n  ✓ متصل بـ ${version[0].db}`)
      console.log(`    ${version[0].v.split(',')[0]}`)
      console.log(`\n  الهجرات المطبَّقة عبر هذه الأداة (${applied.length}):`)
      if (applied.length === 0) console.log('    (لا شيء بعد)')
      for (const r of applied) console.log(`    ${r.filename}  —  ${r.applied_at.toISOString().slice(0, 19).replace('T', ' ')}`)
      console.log('')
      return
    }

    const path = resolve(arg)
    if (!existsSync(path)) {
      console.error(`\n  ❌ الملف غير موجود: ${arg}\n`)
      process.exit(1)
    }

    const sql = readFileSync(path, 'utf8')
    const filename = arg.replace(/\\/g, '/').split('/').pop()

    console.log(`\n  تشغيل ${filename} (${sql.length} حرف)...`)

    await client.query('begin')
    try {
      await client.query(sql)
      await client.query(
        `insert into public.schema_migrations (filename, checksum) values ($1, $2)
         on conflict (filename) do update set applied_at = now(), checksum = excluded.checksum`,
        [filename, String(sql.length)],
      )
      await client.query('commit')
      console.log(`  ✓ طُبِّقت بنجاح\n`)
    } catch (err) {
      await client.query('rollback')
      console.error(`\n  ❌ فشلت وأُلغيت بالكامل — القاعدة كما كانت`)
      console.error(`     ${err.message}`)
      if (err.hint) console.error(`     تلميح: ${err.hint}`)
      if (err.position) console.error(`     الموضع: ${err.position}`)
      console.error('')
      process.exit(1)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(`\n  ❌ ${err.message}\n`)
  process.exit(1)
})
