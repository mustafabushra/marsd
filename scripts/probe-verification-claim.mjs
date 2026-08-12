#!/usr/bin/env node
/**
 * «موثّقة من مرصد» must mean Marsad looked.
 *
 * Every verified company on the platform got that flag from the Ministry
 * import, where it means the authority published the record. Marsad's own
 * verification is a different act with a different source, and the report was
 * calling both by the stronger name — on a public page about a real business,
 * and on companies with no documents at all.
 *
 * Claims make it matter twice over: a Ministry-imported company has no account,
 * so the way in is a claim, and approving one would hand somebody a company
 * whose report already vouched for it.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
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
const marsadCo = randomUUID()

try {
  await db.query(`select set_config('request.jwt.claims', '', false)`)
  const { rows: [ministry] } = await db.query(
    `select id, name from public.companies
      where verified = true and verification_source = 'وزارة التجارة' limit 1`)
  ok('توجد شركة موثّقة من السجل الرسمي', Boolean(ministry), ministry?.name)

  // A company Marsad actually reviewed, for the other side of the comparison.
  await db.query(
    `insert into public.companies (id,name,cr_number,status,source,verified,verified_at,verification_source)
     values ($1,$2,$3,'active','community',true,now(),'marsad_review')`,
    [marsadCo, `شركة فحص التوثيق ${Date.now().toString().slice(-5)}`, String(Date.now()).slice(-10)])

  console.log('\n─── ما تعيده القاعدة ───')
  const U = 'vsrc_probe2'
  await db.query(`insert into public.users (id,email,role) values ($1,'v2@marsad.test','platform_admin')
                  on conflict (id) do update set role='platform_admin'`, [U])
  const identityOf = async (id) => {
    await db.query('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U })])
    const { rows } = await db.query('select public.company_report_full($1) j', [id])
    await db.query('rollback')
    return rows[0].j?.identity || {}
  }
  const mi = await identityOf(ministry.id)
  const ma = await identityOf(marsadCo)
  ok('التقرير صار يحمل مصدر التوثيق', mi.verification_source !== undefined, String(mi.verification_source))
  ok('  ويميّز الوزارة', mi.verification_source === 'وزارة التجارة', mi.verification_source)
  ok('  عن مراجعة مرصد', ma.verification_source === 'marsad_review', ma.verification_source)

  console.log('\n─── ما يراه القارئ ───')
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
  await signIn(page, BASE, { role: 'platform_admin' })

  const readReport = async (id) => {
    await page.goto(`${BASE}/trust-report/${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForFunction(() => (document.body.innerText || '').length > 500, { timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(2500)
    return page.locator('body').innerText()
  }

  const tMin = await readReport(ministry.id)
  ok('شركة الوزارة لا تُوصف بأنها موثّقة من مرصد',
    !/موثّقة من مرصد/.test(tMin), 'ادّعى توثيق مرصد')
  ok('  بل تُوصف بأنها مُطابَقة بالسجل التجاري', /مُطابَقة بالسجل التجاري/.test(tMin),
    tMin.slice(0, 90))
  ok('  ولا يُقال إنها طابقت مستنداتها', !/طابقت مستنداتها/.test(tMin))

  const tMar = await readReport(marsadCo)
  ok('وشركة راجعتها مرصد تُوصف بتوثيق مرصد', /موثّقة من مرصد/.test(tMar), tMar.slice(0, 90))

  ok('console نظيف', errs.length === 0, errs[0])
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally {
  await browser.close()
  await db.query(`select set_config('request.jwt.claims', '', false)`).catch(()=>{})
  await db.query('delete from public.companies where id=$1', [marsadCo]).catch(()=>{})
  await db.query(`delete from public.users where id='vsrc_probe2'`).catch(()=>{})
  await db.end()
}
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — التوثيق يقول أي توثيق هو\n`)
process.exit(fail ? 1 : 0)
