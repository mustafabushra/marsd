#!/usr/bin/env node
/**
 * Every admin route, opened. No number, button or link may reach a 404.
 *
 * Two lists are compared, because they fail in opposite directions:
 *   routes declared in App.jsx  — a route with no way to reach it is dead code
 *   paths listed in AdminShell  — a sidebar entry with no route is a 404
 *
 * Then each one is actually opened, because "the route exists" and "the page
 * renders" are different claims. A page that throws is caught by the error
 * boundary and looks, from the router's side, exactly like a page that works.
 *
 *   node scripts/probe-admin-navigation.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4391'

const app = readFileSync('src/App.jsx', 'utf8')
const shell = readFileSync('src/components/AdminShell.jsx', 'utf8')

const routes = [...app.matchAll(/path="(\/admin[^"]*)"/g)].map((m) => m[1])
const navPaths = [...shell.matchAll(/path:\s*'(\/admin[^']*)'/g)].map((m) => m[1])

const uniq = (a) => [...new Set(a)]
// /admin-login is the sign-in screen, not a panel page: opened while already
// signed in it hands off to Clerk, which is correct and not a broken link.
const staticRoutes = uniq(routes).filter((r) => !r.includes(':') && r !== '/admin-login')
const orphanNav = uniq(navPaths).filter((p) => !staticRoutes.includes(p))
const unreachable = staticRoutes.filter((r) => !navPaths.includes(r))

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

console.log(`\n─── الروابط مقابل المسارات ───`)
console.log(`  مسارات معرّفة : ${staticRoutes.length}`)
console.log(`  روابط القائمة : ${uniq(navPaths).length}`)
ok('كل رابط في القائمة له مسار', orphanNav.length === 0, orphanNav.join(', '))
if (unreachable.length) {
  console.log(`  ℹ️  مسارات بلا رابط في القائمة (${unreachable.length}): ${unreachable.join(', ')}`)
}

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

const browser = await chromium.launch()
const broken = []

try {
  const { rows: [co] } = await db.query(
    `select id from public.companies order by created_at limit 1`)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  await signIn(page, BASE, { role: 'platform_admin' })

  const targets = uniq([...staticRoutes, `/admin/company/${co.id}`])
  console.log(`\n─── فتح ${targets.length} صفحة ───`)

  for (const path of targets) {
    const errs = []
    const onErr = (e) => errs.push(String(e).slice(0, 120))
    page.on('pageerror', onErr)
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      // A screen is done when its own content has arrived, not after a fixed
      // sleep — the slower pages were being read mid-skeleton and called blank.
      await page.waitForFunction(
        () => document.body.innerText.trim().length > 400,
        { timeout: 15000 },
      ).catch(() => {})
      await page.waitForTimeout(600)
      const body = await page.locator('body').innerText()
      // An unmatched route redirects to /404, so that is the test. Matching the
      // text «404» instead flagged /admin/logs, which legitimately *displays*
      // log lines carrying HTTP status codes.
      const crashed = /حدث خطأ غير متوقع|Unexpected Application Error/.test(body)
      const notFound = new URL(page.url()).pathname === '/404'
      const bounced = notFound || !page.url().includes(path.split('/:')[0])
      const empty = body.trim().length < 120

      if (crashed || bounced || empty || errs.length) {
        broken.push({
          path,
          why: crashed ? 'error boundary'
            : notFound ? '404'
            : bounced ? `redirected → ${page.url().replace(BASE, '')}`
              : empty ? 'blank'
                : `pageerror: ${errs[0]}`,
        })
        console.log(`  ❌ ${path} — ${broken[broken.length - 1].why}`)
        fail += 1
      } else {
        console.log(`  ✅ ${path}`)
        pass += 1
      }
    } catch (e) {
      broken.push({ path, why: e.message.slice(0, 90) })
      console.log(`  ❌ ${path} — ${e.message.slice(0, 90)}`)
      fail += 1
    } finally {
      page.off('pageerror', onErr)
    }
  }
} catch (e) {
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
  fail += 1
} finally {
  await browser.close()
  await db.end()
}

if (broken.length) {
  console.log('\n─── المكسور ───')
  for (const b of broken) console.log(`  ${b.path}  →  ${b.why}`)
}
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} — لا رابط يؤدّي إلى لا شيء\n`)
process.exit(fail ? 1 : 0)
