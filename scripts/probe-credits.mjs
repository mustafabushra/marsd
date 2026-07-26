#!/usr/bin/env node
/**
 * Can an unauthenticated browser still write to credits_ledger?
 *
 * The table carries two permissive INSERT policies for PUBLIC, one of them
 * `WITH CHECK (true)`, which should admit anything. An earlier probe reported
 * the insert as blocked, and the two cannot both be right — a returning select
 * filtered by RLS looks much like a refused insert from the client's side, and
 * confusing the two would mean calling a forgeable ledger safe.
 *
 * So: insert without asking for the row back, then count over the direct
 * connection, which RLS does not apply to.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}

const supabase = createClient(envFrom('.env.production', 'VITE_SUPABASE_URL'), envFrom('.env.production', 'VITE_SUPABASE_ANON_KEY'))
const db = new pg.Client({ connectionString: envFrom('.env.migrations', 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows: [t] } = await db.query('select id from public.tenants limit 1')
const MARKER = 7777

const before = await db.query('select count(*)::int as n from public.credits_ledger where amount = $1', [MARKER])

// No .select() — a returning select is itself subject to RLS and would muddy
// the result.
const ins = await supabase.from('credits_ledger').insert([{ tenant_id: t.id, amount: MARKER, reason: 'admin_adjustment' }])

const after = await db.query('select count(*)::int as n from public.credits_ledger where amount = $1', [MARKER])
const landed = after.rows[0].n - before.rows[0].n

console.log('\n  إدراج رصيد بمفتاح المتصفح بلا هوية:')
console.log(`    رد PostgREST : ${ins.error ? 'خطأ — ' + ins.error.message : 'قُبل بلا خطأ'}`)
console.log(`    صفوف أُنشئت  : ${landed}`)
console.log(`    الحكم        : ${landed > 0 ? '❌ الرصيد قابل للتزوير' : '✅ محجوب فعلياً'}\n`)

if (landed > 0) {
  await db.query('delete from public.credits_ledger where amount = $1', [MARKER])
  console.log('  (حُذفت الصفوف الاختبارية)\n')
}

await db.end()
