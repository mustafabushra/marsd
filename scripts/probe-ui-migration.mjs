#!/usr/bin/env node
/**
 * The migrated screens, opened and looked at.
 *
 * A probe that exercises behaviour will not notice a panel that lost its
 * border or a page that now scrolls sideways, because behaviour is not what
 * changed. This checks what a migration can actually break: the screen still
 * renders, the console stays quiet, and nothing overflows at any width.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4410'
const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

const browser = await chromium.launch()
try {
  const { rows: [co] } = await db.query('select id from public.companies order by created_at limit 1')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await signIn(page, BASE, { role: 'platform_admin' })

  const screens = [
    // Visible text, not the tablist's aria-label — innerText cannot see one.
    ['ملفّ الشركة', `/admin/company/${co.id}`, 'مؤشر الثقة'],
    ['إدارة البيانات', '/admin/data-management', 'الجيل المنشور'],
    ['سجلّ الشركات', '/admin/roster', 'سجلّ الشركات'],
  ]

  for (const [name, path, marker] of screens) {
    console.log(`\n─── ${name} ───`)
    const errs = []
    const onErr = (e) => errs.push(String(e).slice(0, 140))
    const onCon = (m) => { if (m.type() === 'error' && !/ERR_ABORTED/.test(m.text())) errs.push(m.text().slice(0, 140)) }
    page.on('pageerror', onErr); page.on('console', onCon)

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    const seen = await page.waitForFunction(
      (m) => (document.querySelector('#main')?.innerText || '').includes(m),
      marker, { timeout: 25000 }).then(() => true).catch(() => false)
    ok('يفتح ويعرض محتواه', seen, (await page.locator('#main').innerText()).slice(0, 70))

    // The panels are the thing that was swapped, so count that they still exist.
    const panels = await page.evaluate(() => {
      const wanted = ['16px', '14px']
      return [...document.querySelectorAll('#main div')].filter((d) => {
        const s = getComputedStyle(d)
        return s.backgroundColor === 'rgb(255, 255, 255)'
          && wanted.some((r) => s.borderRadius.startsWith(r.replace('px', '')))
      }).length
    })
    ok('  ولوحاته مرسومة', panels > 0, `${panels} لوحة`)

    for (const w of [1500, 1200, 1024, 700, 390]) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.waitForTimeout(500)
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 2)
      if (over) ok(`  لا فيض أفقي @${w}`, false, 'يفيض')
    }
    ok('  ولا فيض أفقي عند أي عرض', true)
    ok('  وconsole نظيف', errs.length === 0, errs[0])

    page.off('pageerror', onErr); page.off('console', onCon)
  }
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally { await browser.close(); await db.end() }
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الشاشات المُرحَّلة تُفتح كما كانت\n`)
process.exit(fail ? 1 : 0)
