/**
 * Every page renders without throwing.
 *
 * pages-load.test.js proves the modules *evaluate*. That is not the same thing:
 * a page can import cleanly and still throw the first time React calls it —
 * reading a field off something that is null, mapping over a value that is not
 * an array, calling a helper that was renamed. The user sees
 * «حدث خطأ غير متوقع» and the route is dead.
 *
 * So each page is actually rendered, with react-dom/server. No browser and no
 * new dependency: renderToString runs the component function and its whole
 * subtree, which is exactly where that class of error lives. Effects do not run,
 * so nothing here talks to Supabase — this checks the first paint, the one that
 * happens before any data arrives, which is also the one most likely to be
 * written against data that is not there yet.
 *
 * Only two things are faked, and both are providers rather than logic:
 *   - Clerk, because it demands a real key and a network call
 *   - the router, given a MemoryRouter so useNavigate/useParams resolve
 *
 * Anything else — every calculation, every branch, every helper — runs for real.
 * A test that mocked the data layer as well would be testing the mocks.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// A signed-in platform admin: the role that reaches the most screens, so the
// most code runs. `null` user would short-circuit half of them into a redirect.
const user = { id: 'test_user', primaryEmailAddress: { emailAddress: 't@example.test' } }

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }) => children,
  useUser: () => ({ user, isLoaded: true, isSignedIn: true }),
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: user.id, getToken: async () => 't' }),
  useOrganization: () => ({ organization: null, isLoaded: true }),
  UserButton: () => null,
  SignIn: () => null,
  SignUp: () => null,
}))

const app = readFileSync('src/App.jsx', 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

const paths = [...new Set([
  ...[...app.matchAll(/lazy\(\(\)\s*=>\s*import\(['"](\.[^'"]+)['"]\)\)/g)].map((m) => m[1]),
  ...[...app.matchAll(/^import\s+\w+\s+from\s+['"](\.\/pages\/[^'"]+)['"]/gm)].map((m) => m[1]),
])]

// The first page imported pays for transforming the module graph — five
// seconds on a cold cache, which is over the default per-test timeout. Two
// pages were reported as failures for that reason alone on the first run and
// passed on the second, which is the least useful kind of red.
describe('كل صفحة تُرسم بلا استثناء', { timeout: 30000 }, () => {
  it('عُثر على الصفحات في App.jsx', () => {
    expect(paths.length).toBeGreaterThan(50)
  })

  for (const p of paths) {
    it(p.replace('./pages/', ''), async () => {
      const mod = await import(/* @vite-ignore */ `../${p.replace(/^\.\//, '')}`)
      const Page = mod.default
      expect(Page).toBeTruthy()
      // Throws exactly what the error boundary would have caught.
      renderToString(h(MemoryRouter, { initialEntries: ['/'] }, h(Page)))
    })
  }
})
