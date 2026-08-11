#!/usr/bin/env node
/**
 * Trace one tab click end to end, so the failure is observed and not guessed.
 *
 * The chain, in order:
 *   click → tab state (aria-selected) → the page still mounted? → useLazyTab
 *   fired? → RPC on the wire → response → the body rendered.
 *
 * Each link is printed whether it holds or breaks, because three previous
 * attempts fixed a link that was never broken.
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4370'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

const browser = await chromium.launch()
const rpcs = []
const errs = []

try {
  const { rows: [co] } = await db.query(
    `select id, name from public.companies order by created_at limit 1`)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${String(e).slice(0, 300)}`))
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/rpc/')) rpcs.push(r.url().split('/rpc/')[1].split('?')[0])
  })

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)

  const tablist = page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })

  console.log('\n─── BEFORE CLICK ───')
  console.log('  tablist count :', await tablist.count())
  console.log('  tab count     :', await tablist.getByRole('tab').count())
  console.log('  selected      :', await page.locator('[role="tab"][aria-selected="true"]').innerText().catch(() => '—'))
  console.log('  RPCs so far   :', rpcs.join(', '))

  rpcs.length = 0
  const target = tablist.getByRole('tab', { name: 'الاعتراضات', exact: true })
  console.log('\n─── CLICK «الاعتراضات» ───')
  console.log('  target count  :', await target.count())
  await target.click()

  // Sample immediately, then after the network would have settled.
  for (const wait of [150, 1200, 4000]) {
    await page.waitForTimeout(wait === 150 ? 150 : wait - 150)
    console.log(`\n─── +${wait}ms ───`)
    console.log('  tablist count :', await tablist.count())
    console.log('  tab count     :', await tablist.getByRole('tab').count())
    console.log('  selected      :', await page.locator('[role="tab"][aria-selected="true"]').innerText().catch(() => '— none —'))
    console.log('  URL           :', page.url().replace(BASE, ''))
    console.log('  RPCs since    :', rpcs.join(', ') || '(none)')
    const body = await page.locator('body').innerText()
    console.log('  skeleton?     :', body.length < 400 ? 'LIKELY (body tiny)' : 'no')
    console.log('  has «الاعتراضات» heading?:', /الاعتراضات/.test(body))
    console.log('  body head     :', JSON.stringify(body.slice(0, 160)))
  }

  console.log('\n─── CONSOLE ───')
  console.log(errs.length ? errs.join('\n  ') : '  (clean)')

  // Does the RPC itself work, called the way the page calls it?
  const { rows } = await db.query('select public.admin_company_disputes($1) j', [co.id])
    .catch((e) => ({ rows: [{ j: 'DB ERROR: ' + e.message }] }))
  console.log('\n─── RPC DIRECT ───')
  console.log('  ', JSON.stringify(rows[0].j).slice(0, 300))
} catch (e) {
  console.log('EXCEPTION:', e.message.slice(0, 300))
} finally {
  await browser.close()
  await db.end()
}
