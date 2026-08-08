#!/usr/bin/env node
/**
 * The handoff as a person performs it: a laptop, a phone, and a document.
 *
 * ============================================================================
 * What this proves, and what it does not
 * ============================================================================
 * The serverless function needs SUPABASE_SERVICE_ROLE_KEY. That variable is
 * marked sensitive on Vercel, so `vercel env pull` writes `[SENSITIVE]` instead
 * of the value — deliberately, and correctly. It cannot run here.
 *
 * So `/api/handoff-upload` is intercepted, and the interception does the same
 * work against the same database: `open_upload_handoff` and
 * `finish_upload_handoff` are called for real, with real tokens, on real rows.
 * What is substituted is Supabase Storage — a local sink stands in for the
 * signed URL.
 *
 * Which means:
 *   proven here   the laptop mints a token and draws a scannable code; a phone
 *                 with no session opens the link; the file is chosen and sent;
 *                 the document is recorded; the laptop notices without a
 *                 refresh; the link refuses a second use
 *   not proven    Supabase Storage accepting the signed upload. That runs first
 *                 on deploy, and is named in the report rather than implied.
 *
 * `probe-upload-handoff.mjs` covers the rules themselves — expiry, single use,
 * wrong company, unknown type, who may call what.
 *
 *   node scripts/probe-phone-handoff.mjs http://127.0.0.1:3012
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:3012'

const dbUrl = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`) }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Stand in for the function, doing its work against the real database. */
async function apiRoute(route) {
  const body = JSON.parse(route.request().postData() || '{}')
  const json = (status, obj) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(obj),
  })
  try {
    if (body.action === 'start') {
      const { rows: [r] } = await db.query(
        'select * from public.open_upload_handoff($1)', [body.token])
      if (!r) return json(400, { error: 'رابط غير صالح' })
      return json(200, {
        uploadUrl: `${BASE}/__sink`,
        path: `${r.company_id}/${r.doc_type}-${Date.now()}.pdf`,
        companyName: r.company_name,
        docLabel: r.doc_label,
        expiresAt: r.expires_at,
      })
    }
    if (body.action === 'finish') {
      const { rows: [r] } = await db.query(
        'select public.finish_upload_handoff($1, $2, $3) as id',
        [body.token, body.path, body.fileName])
      return json(200, { documentId: r.id })
    }
    return json(400, { error: 'إجراء غير معروف' })
  } catch (e) {
    return json(400, { error: e.message.replace(/^.*?:\s*/, '') })
  }
}

const browser = await chromium.launch()
let created = null

try {
  // --- The laptop ----------------------------------------------------------
  const laptop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const desk = await laptop.newPage()
  await desk.route('**/api/handoff-upload', apiRoute)
  await signIn(desk, BASE)
  await desk.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 45000 })
  await desk.waitForTimeout(2000)

  const button = desk.locator('button:has-text("من الجوال")').first()
  ok('زر «من الجوال» بجانب مستند ناقص', await button.count() > 0)
  if (!(await button.count())) throw new Error('لا زر — لا شيء بعده يعني شيئاً')

  const before = (await db.query('select count(*)::int n from public.upload_handoffs')).rows[0].n
  await button.click()
  await desk.waitForTimeout(3000)

  const after = (await db.query('select count(*)::int n from public.upload_handoffs')).rows[0].n
  ok('اللابتوب أنشأ تسليماً حقيقياً', after === before + 1, `${before} → ${after}`)

  // A code, read off the canvas the way a camera would see it: is there enough
  // structure to be a QR code at all? A blank canvas and a black square both
  // render without error and neither can be scanned.
  const ink = await desk.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let dark = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark += 1
    return { total: c.width * c.height, dark }
  })
  ok('الرمز مرسوم ويحمل بنية', ink && ink.dark > ink.total * 0.15 && ink.dark < ink.total * 0.7,
    ink ? `${Math.round((ink.dark / ink.total) * 100)}% داكن` : 'لا لوحة')
  ok('العدّ التنازلي معروض', await desk.locator('text=/ينتهي خلال/').count() > 0)
  ok('مكتوب أنه لمستند واحد', await desk.locator('text=/مستند واحد فقط/').count() > 0)

  // --- The phone -----------------------------------------------------------
  // A token of its own, minted as the same user. The one in the QR is not
  // recoverable — only its hash is stored, which is the point of storing a hash.
  const { rows: [owner] } = await db.query(
    'select created_by, doc_type from public.upload_handoffs order by created_at desc limit 1')
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: owner.created_by, role: 'authenticated' })])
  const { rows: [fresh] } = await db.query(
    'select * from public.create_upload_handoff($1)', [owner.doc_type])
  await db.query('commit')
  created = fresh.token

  const handset = await browser.newContext({
    viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true,
  })
  const phone = await handset.newPage()
  await phone.route('**/api/handoff-upload', apiRoute)
  // The sink: storage's part, which cannot run here.
  await phone.route('**/__sink', (r) => r.fulfill({ status: 200, body: '' }))

  await phone.goto(`${BASE}/u/${fresh.token}`, { waitUntil: 'networkidle', timeout: 45000 })
  await phone.waitForTimeout(900)

  ok('تفتح بلا تسجيل دخول', !phone.url().includes('/login'),
    `انتهت عند ${phone.url().replace(BASE, '')}`)
  ok('بلا هدر وبلا قائمة جانبية',
    (await phone.locator('header').count()) === 0
    && (await phone.locator('.marsad-sidebar').count()) === 0)

  const tap = await phone.locator('button:has-text("التقاط")').first().boundingBox()
  ok('زر الالتقاط قابل للمس', tap && tap.height >= 44, tap ? `${Math.round(tap.height)}px` : 'غير موجود')
  ok('لا تمرير أفقي',
    await phone.evaluate(() => document.documentElement.scrollWidth <= 391))

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  await phone.setInputFiles('input[type="file"]', {
    name: 'سجل-تجاري.pdf', mimeType: 'application/pdf', buffer: pdf,
  })
  await phone.waitForSelector('text=/وصل المستند/', { timeout: 30000 }).catch(() => {})
  ok('الجوال يؤكّد الوصول', await phone.locator('text=/وصل المستند/').count() > 0,
    (await phone.locator('[style*="FEF2F2"]').first().textContent().catch(() => '')) || 'لا تأكيد')

  // --- Recorded, and noticed ------------------------------------------------
  const { rows: [rec] } = await db.query(`
    select d.id, d.status, d.doc_type, d.file_name, d.company_id, u.consumed_at
      from public.upload_handoffs u
      join public.company_documents d on d.id = u.document_id
     where u.token_hash = encode(digest($1, 'sha256'), 'hex')`, [fresh.token])

  ok('المستند مسجَّل', !!rec)
  ok('بحالة «قيد المراجعة»', rec?.status === 'pending', `جاء «${rec?.status}»`)
  ok('باسم الملف الأصلي', rec?.file_name === 'سجل-تجاري.pdf')
  ok('الرمز استُهلك', !!rec?.consumed_at)

  await desk.waitForSelector('text=/وصل/', { timeout: 25000 }).catch(() => {})
  ok('اللابتوب يلاحظ بلا تحديث', await desk.locator('text=/وصل/').count() > 0)

  // --- The same link, twice --------------------------------------------------
  await phone.goto(`${BASE}/u/${fresh.token}`, { waitUntil: 'networkidle' })
  await phone.waitForTimeout(700)
  await phone.setInputFiles('input[type="file"]', {
    name: 'ثانية.pdf', mimeType: 'application/pdf', buffer: pdf,
  })
  await phone.waitForTimeout(4000)
  ok('الرابط لا يعمل مرتين',
    (await phone.locator('text=/استُخدم/').count()) > 0
    && (await phone.locator('text=/وصل المستند/').count()) === 0,
    'قَبِل رفعاً ثانياً')

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 120)}`)
} finally {
  // Leave nothing behind. The document was created by a real code path against
  // a real company, so it is removed by hand.
  if (created) {
    await db.query(`
      delete from public.company_documents
       where id in (select document_id from public.upload_handoffs
                     where token_hash = encode(digest($1, 'sha256'), 'hex'))`, [created]).catch(() => {})
  }
  await db.query(`delete from public.upload_handoffs where created_at > now() - interval '10 minutes'`).catch(() => {})
  await db.end()
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — التسليم يعمل كما يفعله شخص\n`)
process.exit(fail ? 1 : 0)
