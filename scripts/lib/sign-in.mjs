/**
 * Sign a Playwright browser into Marsad, for real.
 *
 * Clerk's testing tokens let an automated browser through the genuine sign-in
 * against the genuine instance. The alternative was stubbing a session, which
 * would have meant auditing a stub.
 *
 * The account is created once and reused. It is a Clerk user like any other,
 * and the database rows it needs — a tenant, a role — are created alongside so
 * the screens have something to render. Everything it makes is marked, and
 * `cleanup` removes it.
 */

import { setupClerkTestingToken, clerkSetup, clerk } from '@clerk/testing/playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { CLERK_PUBLISHABLE, CLERK_SECRET } from './browser-session.mjs'

// `+clerk_test` is Clerk's own convention for a test identity on a development
// instance. A `.test` TLD is rejected outright — «Email address must be a valid
// email address» — which is why the first attempt never created a user.
export const TEST_EMAIL = 'marsad.audit+clerk_test@example.com'
export const TEST_PASSWORD = 'Aud1t-M4rsad-2026!x'

const dbUrl = () => readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

/**
 * Create the Clerk user if it does not exist, and give it a tenant so the
 * company screens have data. Returns the Clerk user id.
 */
export async function ensureTestUser({ role = 'company_admin' } = {}) {
  process.env.CLERK_SECRET_KEY = CLERK_SECRET
  process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE
  process.env.VITE_CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE

  const { createClerkClient } = await import('@clerk/backend')
  const ck = createClerkClient({ secretKey: CLERK_SECRET })

  const found = await ck.users.getUserList({ emailAddress: [TEST_EMAIL] })
  let user = found.data?.[0]
  if (!user) {
    user = await ck.users.createUser({
      emailAddress: [TEST_EMAIL],
      password: TEST_PASSWORD,
      skipPasswordChecks: true,
      firstName: 'Marsad',
      lastName: 'Audit',
    })
  }

  // Verify the address, or the sign-in never completes.
  //
  // createUser leaves the e-mail unverified, so signing in with a password
  // stops at `needs_first_factor` waiting for a code. `clerk.signIn` does not
  // throw for that — it simply returns, `window.Clerk.user` stays null, and the
  // app redirects to onboarding as it would for any signed-out visitor. The
  // symptom looked like a session that would not persist; the session had never
  // been created.
  const address = user.emailAddresses?.find((e) => e.emailAddress === TEST_EMAIL)
  if (address && address.verification?.status !== 'verified') {
    await ck.emailAddresses.updateEmailAddress(address.id, { verified: true, primary: true })
    user = await ck.users.getUser(user.id)
  }

  // The application reads role and tenant from public.users, not from Clerk.
  // Without a row the shell sends this account to onboarding and the audit
  // measures the onboarding screen on every route.
  const c = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const { rows: [t] } = await c.query(`
      select t.id from public.tenants t
       join public.subscriptions s on s.tenant_id = t.id
      where t.company_id is not null limit 1`)
    await c.query(`
      insert into public.users (id, email, role, tenant_id)
      values ($1, $2, $3, $4)
      on conflict (id) do update set role = excluded.role, tenant_id = excluded.tenant_id`,
    [user.id, TEST_EMAIL, role, t?.id ?? null])
  } finally {
    await c.end()
  }
  return user.id
}

/**
 * Fetch the instance's Frontend API URL once per run.
 *
 * Without it the testing token cannot get past Clerk's bot protection, and the
 * sign-in fails with a message that names this function.
 */
let ready = null
export function prepareClerk() {
  process.env.CLERK_SECRET_KEY = CLERK_SECRET
  process.env.CLERK_PUBLISHABLE_KEY = CLERK_PUBLISHABLE
  ready = ready || clerkSetup({ publishableKey: CLERK_PUBLISHABLE, secretKey: CLERK_SECRET })
  return ready
}

/**
 * Put a page through the real sign-in and leave it signed in.
 *
 * A password sign-in stops at `needs_client_trust` on this instance: Clerk wants
 * the device attested, and a testing token clears bot protection but not device
 * trust. `clerk.signIn` does not throw for an incomplete status, so the browser
 * looked signed out with nothing to explain why.
 *
 * A sign-in token settles it. The secret key mints one for a known user id, the
 * browser redeems it with `strategy: 'ticket'`, and the session that comes back
 * is an ordinary session — the app is not told how it was created. Nothing is
 * stubbed, so what the audit measures is still the product.
 */
export async function signIn(page, base, { role } = {}) {
  await prepareClerk()
  // The role is passed through rather than fixed. Admin screens sit behind
  // AdminRoute, and a probe signed in as a company account measures the redirect
  // it gets sent to instead of the page it came for.
  const userId = await ensureTestUser(role ? { role } : undefined)

  const { createClerkClient } = await import('@clerk/backend')
  const ck = createClerkClient({ secretKey: CLERK_SECRET })
  const { token } = await ck.signInTokens.createSignInToken({ userId, expiresInSeconds: 600 })

  await setupClerkTestingToken({ page })
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.Clerk?.loaded, null, { timeout: 30000 })

  const status = await page.evaluate(async (ticket) => {
    const attempt = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket })
    if (attempt.status !== 'complete') return attempt.status
    await window.Clerk.setActive({ session: attempt.createdSessionId })
    return 'complete'
  }, token)

  if (status !== 'complete') throw new Error(`Clerk sign-in stopped at "${status}"`)
  await page.waitForFunction(() => !!window.Clerk?.user, null, { timeout: 30000 })

  // Returned so a probe can look up what the signed-in account did without
  // guessing at the id or matching on the test email. Additive — this used to
  // return undefined, so no existing caller changes.
  return userId
}

/** Remove the audit account and its row. Leaves the borrowed tenant alone. */
export async function cleanup() {
  const { createClerkClient } = await import('@clerk/backend')
  const ck = createClerkClient({ secretKey: CLERK_SECRET })
  const found = await ck.users.getUserList({ emailAddress: [TEST_EMAIL] })
  for (const u of found.data || []) {
    const c = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } })
    await c.connect()
    await c.query('delete from public.users where id = $1', [u.id]).catch(() => {})
    await c.end()
    await ck.users.deleteUser(u.id)
  }
}
