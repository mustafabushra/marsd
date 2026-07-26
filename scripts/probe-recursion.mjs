// Why do the role/tenant helpers return null now that users has RLS?
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const q = async (label, sql, params = []) => {
  try {
    const { rows } = await c.query(sql, params)
    console.log(`  ${label}: ${JSON.stringify(rows[0])}`)
  } catch (e) {
    console.log(`  ${label}: ERROR ${e.message}`)
  }
}

await q('مالك الدالة', `
  select p.proname, r.rolname as owner, p.prosecdef as security_definer
  from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.proname = 'get_current_user_role'`)

await q('مالك جدول users', `
  select r.rolname as owner, c.relforcerowsecurity as force_rls
  from pg_class c join pg_roles r on r.oid = c.relowner
  where c.relname = 'users'`)

await c.query('begin')
await c.query('select set_config($1, $2, true)', ['request.jwt.claims',
  JSON.stringify({ sub: 'user_3GulvXalnr8OVkjDL3xqyJEDDJw', role: 'authenticated' })])
await q('قراءة مباشرة (مالك)', `select role from public.users where id = 'user_3GulvXalnr8OVkjDL3xqyJEDDJw'`)
await q('عبر الدالة', 'select public.get_current_user_role() as role')
await c.query('commit')

// Same thing as the role PostgREST actually uses.
await c.query('begin')
await c.query('set local role authenticated')
await c.query('select set_config($1, $2, true)', ['request.jwt.claims',
  JSON.stringify({ sub: 'user_3GulvXalnr8OVkjDL3xqyJEDDJw', role: 'authenticated' })])
await q('كدور authenticated — الدالة', 'select public.get_current_user_role() as role')
await q('كدور authenticated — قراءة مباشرة', `select count(*)::int as n from public.users`)
await c.query('commit')

await c.end()
