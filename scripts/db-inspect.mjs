#!/usr/bin/env node
/**
 * Read-only look at the entitlement tables.
 *
 * Used to check what a migration is about to change, and to confirm afterwards
 * that it changed it. Runs no DDL and writes nothing.
 *
 * Usage: node scripts/db-inspect.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

function url() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const line = readFileSync('.env.migrations', 'utf8').split('\n').find((l) => l.trim().startsWith('DATABASE_URL='))
  return line.slice(line.indexOf('=') + 1).trim()
}

const client = new pg.Client({ connectionString: url(), ssl: { rejectUnauthorized: false } })
await client.connect()

const q = async (label, sql) => {
  try {
    const { rows } = await client.query(sql)
    console.log(`\n  ${label}`)
    if (rows.length === 0) { console.log('    (لا صفوف)'); return }
    for (const r of rows) console.log('    ' + Object.entries(r).map(([k, v]) => `${k}=${v === null ? '∅' : JSON.stringify(v)}`).join('  '))
  } catch (e) {
    console.log(`\n  ${label}\n    ⚠ ${e.message}`)
  }
}

await q('أعمدة plans', `
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='plans' order by ordinal_position`)

await q('الباقات', `select code, name, price_monthly, active, is_default, give_to_get_enabled, limits, features from public.plans order by sort_order`)

await q('إعدادات النظام', `select key, jsonb_pretty(value)::text as value from public.system_settings order by key`)

await q('الاشتراكات حسب الباقة', `
  select coalesce(p.code, '∅') as plan, count(*) as tenants
  from public.subscriptions s left join public.plans p on p.id = s.plan_id group by 1 order by 2 desc`)

await q('عدد الكيانات بلا اشتراك', `
  select count(*) as tenants_without_subscription from public.tenants t
  where not exists (select 1 from public.subscriptions s where s.tenant_id = t.id)`)

await client.end()
console.log('')
