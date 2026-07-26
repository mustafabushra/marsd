#!/usr/bin/env node
/**
 * What can a given account actually do, as the database sees it?
 *
 * Runs as the `authenticated` role with that user's Clerk id in the JWT claims —
 * the same conditions PostgREST creates for a signed-in request — so the answer
 * comes from the policies rather than from reading them and reasoning.
 *
 * Usage: node scripts/probe-as-user.mjs <email>
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const email = process.argv[2]
if (!email) { console.error('  الاستخدام: node scripts/probe-as-user.mjs <email>'); process.exit(1) }

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: [u] } = await c.query('select id, role, tenant_id from public.users where lower(email) = lower($1)', [email])
if (!u) { console.error(`  لا يوجد مستخدم بهذا البريد: ${email}`); await c.end(); process.exit(1) }

console.log(`\n  ${email}`)
console.log(`  ${u.id}  ·  ${u.role}\n`)

await c.query('begin')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)', ['request.jwt.claims',
  JSON.stringify({ sub: u.id, role: 'authenticated' })])

const ask = async (label, sql) => {
  try {
    const { rows } = await c.query(sql)
    const v = Object.values(rows[0])[0]
    console.log(`  ${v === true || Number(v) > 0 ? '✅' : '⛔'} ${label}: ${v}`)
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message.split('\n')[0]}`)
  }
}

await ask('يراه النظام مدير منصة', 'select public.is_platform_admin() as v')
await ask('يراه النظام مدير شركة', 'select public.is_tenant_admin() as v')
await ask('يقرأ المستخدمين',        'select count(*)::int as v from public.users')
await ask('يقرأ الباقات',           'select count(*)::int as v from public.plans')
await ask('يقرأ الإعدادات',         'select count(*)::int as v from public.system_settings')
await ask('يقرأ كيانه',             'select count(*)::int as v from public.tenants')
await ask('يقرأ رصيد شركته',        'select count(*)::int as v from public.credits_ledger')

// The writes the admin panel depends on.
const canWrite = async (label, sql) => {
  await c.query('savepoint s')
  try {
    const { rowCount } = await c.query(sql)
    console.log(`  ${rowCount > 0 ? '✅' : '⛔'} ${label}: ${rowCount} صف`)
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message.split('\n')[0]}`)
  }
  await c.query('rollback to savepoint s')
}

console.log('')
await canWrite('يعدّل باقة',   "update public.plans set sort_order = sort_order where code = 'free'")
await canWrite('يعدّل إعداداً', "update public.system_settings set value = value where key = 'entitlements_enforcement'")

await c.query('rollback')
await c.end()
console.log('')
