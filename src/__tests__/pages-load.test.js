// Runs in the suite default (node) — see the note below.
/**
 * Every page module evaluates without throwing.
 *
 * The build proves that imports resolve and the syntax parses. It does not
 * prove that a module *runs*: work at module scope — reading `window`, calling
 * a helper, building a regex, touching an environment variable — happens the
 * first time the file is imported, and a failure there is a blank screen with a
 * console error, on that route only. Vite happily bundles it.
 *
 * So every page named in App.jsx is imported here, which is what the browser
 * does when someone navigates to it. A module that throws on evaluation fails
 * this test instead of a user.
 *
 * Runs in the suite's default `node` environment, with no DOM — and all 75
 * modules load. That is worth stating: it means no page reaches for `window` or
 * `document` while being imported, only inside components and effects, which is
 * where browser access belongs. If one starts doing so this test fails, and the
 * fix is the page, not a jsdom dependency added to hide it.
 *
 * It does not render anything. Rendering needs the router, Clerk and Supabase
 * standing up, and a test that mocks all three stops testing the application
 * and starts testing the mocks.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/App.jsx', 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

// Both shapes App.jsx uses: lazy() for routed pages, plain import for the
// shells and the boundary.
const paths = [...new Set([
  ...[...app.matchAll(/lazy\(\(\)\s*=>\s*import\(['"](\.[^'"]+)['"]\)\)/g)].map((m) => m[1]),
  ...[...app.matchAll(/^import\s+\w+\s+from\s+['"](\.\/(?:pages|components)\/[^'"]+)['"]/gm)].map((m) => m[1]),
])]

describe('كل صفحة في جدول المسارات تُحمَّل', () => {
  it('عُثر على المسارات في App.jsx', () => {
    // Guards the parse itself. If App.jsx is reorganised and these patterns stop
    // matching, this suite would silently test nothing at all.
    expect(paths.length).toBeGreaterThan(50)
  })

  for (const p of paths) {
    it(p.replace('./', ''), async () => {
      const mod = await import(/* @vite-ignore */ `../${p.replace(/^\.\//, '')}`)
      expect(mod.default ?? mod).toBeTruthy()
    })
  }
})
