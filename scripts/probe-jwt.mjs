// Do the helpers resolve an identity when a Clerk-shaped JWT is present?
// Isolates the SQL side from whether the browser client is sending the token.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const claims = JSON.stringify({ sub: 'user_3GulvXalnr8OVkjDL3xqyJEDDJw', role: 'authenticated' })

// Inside one transaction: set_config with is_local = true lasts only for the
// current transaction, and every statement outside one gets its own — which is
// how the first run of this probe reported a working function as broken.
await c.query('begin')
await c.query('select set_config($1, $2, true)', ['request.jwt.claims', claims])

const withToken = await c.query(`
  select public.get_current_user_id()  as uid,
         public.get_current_user_role() as role,
         public.get_current_tenant_id() as tenant,
         public.is_platform_admin()     as is_admin,
         (public.get_current_user_id() is not null) as tenants_insert_allowed
`)
console.log('  مع رمز :', JSON.stringify(withToken.rows[0]))
await c.query('commit')

const without = await c.query('select public.get_current_user_id() as uid')
console.log('  بلا رمز:', JSON.stringify(without.rows[0]))

await c.end()
