#!/usr/bin/env node
/**
 * What an anonymous browser can do to the database.
 *
 * Ids come from the direct connection, which RLS does not apply to, so a table
 * that has become unreadable is still tested for writes rather than skipped —
 * "I could not find a row" is not the same answer as "I could not change one".
 *
 * Every write is verified by reading back over the direct connection. PostgREST
 * answers a write that RLS filtered to nothing with success and no error, and a
 * check that trusts the absence of an error will call a forgeable table safe.
 * That mistake was made twice in this project before this script existed.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}

const anon = createClient(envFrom('.env.production', 'VITE_SUPABASE_URL'), envFrom('.env.production', 'VITE_SUPABASE_ANON_KEY'))
const db = new pg.Client({ connectionString: envFrom('.env.migrations', 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await db.connect()

let open = 0

const one = async (sql) => (await db.query(sql)).rows[0]

/** Try to change a row as anon; confirm over the direct connection. */
const tryUpdate = async (label, table, id, col, value) => {
  const before = await one(`select ${col} as v from public.${table} where id = '${id}'`)
  await anon.from(table).update({ [col]: value }).eq('id', id)
  const after = await one(`select ${col} as v from public.${table} where id = '${id}'`)
  const changed = String(before.v) !== String(after.v)
  if (changed) {
    await db.query(`update public.${table} set ${col} = $1 where id = $2`, [before.v, id])
    open++
  }
  console.log(`  ${changed ? '❌ OPEN   ' : '✅ CLOSED '} ${label}`)
}

/** Try to insert as anon; confirm by counting over the direct connection. */
const tryInsert = async (label, table, row, marker) => {
  const before = await one(`select count(*)::int as n from public.${table} where ${marker}`)
  await anon.from(table).insert([row])
  const after = await one(`select count(*)::int as n from public.${table} where ${marker}`)
  const landed = after.n > before.n
  if (landed) {
    await db.query(`delete from public.${table} where ${marker}`)
    open++
  }
  console.log(`  ${landed ? '❌ OPEN   ' : '✅ CLOSED '} ${label}`)
}

console.log('\n  ما يستطيع متصفح مجهول فعله:\n')

const tenant = await one('select id from public.tenants limit 1')
const plan = await one("select id from public.plans where code = 'free'")
const user = await one('select id from public.users limit 1')

await tryUpdate('تعديل بيانات كيان', 'tenants', tenant.id, 'city', 'PROBE_CITY')
await tryUpdate('رفع حدود باقة', 'plans', plan.id, 'sort_order', 999)
await tryUpdate('تغيير دور مستخدم', 'users', user.id, 'role', 'platform_admin')
await tryInsert('منح رصيد لنفسه', 'credits_ledger', { tenant_id: tenant.id, amount: 7777, reason: 'admin_adjustment' }, 'amount = 7777')
await tryInsert('إنشاء كيان وهمي', 'tenants', { name: 'PROBE', cr_number: 'PROBE9999', email: 'probe@probe.invalid' }, "cr_number = 'PROBE9999'")

// Settings is checked by value, not by a column, so it gets its own shape.
const sBefore = await one("select value from public.system_settings where key = 'entitlements_enforcement'")
await anon.from('system_settings').update({ value: { enabled: false } }).eq('key', 'entitlements_enforcement')
const sAfter = await one("select value from public.system_settings where key = 'entitlements_enforcement'")
const sChanged = JSON.stringify(sBefore.value) !== JSON.stringify(sAfter.value)
if (sChanged) {
  await db.query('update public.system_settings set value = $1 where key = $2', [sBefore.value, 'entitlements_enforcement'])
  open++
}
console.log(`  ${sChanged ? '❌ OPEN   ' : '✅ CLOSED '} إيقاف تطبيق الحدود`)

console.log(`\n  ${open === 0 ? '✅ لا ثغرة كتابة مفتوحة' : '❌ ' + open + ' ثغرة مفتوحة'}\n`)

await db.end()
process.exit(open === 0 ? 0 : 1)
