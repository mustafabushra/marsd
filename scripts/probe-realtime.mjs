#!/usr/bin/env node
/**
 * Does a change in the database actually reach a browser subscriber?
 *
 * Publishing a table and enabling row-level security are both prerequisites and
 * neither is proof: RLS applies to the stream, so a table can be published and
 * still deliver nothing to a caller who cannot select the row. This subscribes
 * with the public key, makes a change over the direct connection, and counts
 * what arrives.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const envFrom = (file, key) => {
  const l = readFileSync(file, 'utf8').split('\n').find((x) => x.trim().startsWith(key + '='))
  return l.slice(l.indexOf('=') + 1).trim()
}

const sb = createClient(envFrom('.env.production', 'VITE_SUPABASE_URL'), envFrom('.env.production', 'VITE_SUPABASE_ANON_KEY'))
const db = new pg.Client({
  connectionString: readFileSync('.env.migrations', 'utf8').split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim(),
  ssl: { rejectUnauthorized: false },
})

let events = 0
const channel = sb
  .channel('probe-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_items' }, () => { events++ })

const status = await new Promise((resolve) => {
  channel.subscribe((s) => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) resolve(s) })
  setTimeout(() => resolve('NO_RESPONSE'), 15000)
})

console.log(`\n  حالة الاشتراك: ${status}`)

if (status !== 'SUBSCRIBED') {
  console.log('  ❌ لم يُقبل الاشتراك — البث غير مفعّل على المشروع أو محجوب\n')
  process.exit(1)
}

await db.connect()
await db.query(`update public.watchlist_items set list_name = list_name`)
await new Promise((r) => setTimeout(r, 5000))

console.log(`  أحداث وصلت: ${events}`)
console.log(`  ${events > 0 ? '✅ البث يعمل من طرف إلى طرف' : '❌ لا يصل شيء رغم قبول الاشتراك'}\n`)

await db.end()
process.exit(events > 0 ? 0 : 1)
