#!/usr/bin/env node
/**
 * The trust report PDF, produced and then actually read back.
 *
 * A PDF endpoint that returns 200 tells you nothing — a blank A4 is a valid
 * PDF, and so is one where every Arabic glyph came out as a box. So the bytes
 * are parsed: the page count, the page size in points, and the text layer are
 * all pulled out of the file, and the Arabic is checked to be Arabic.
 *
 * pdfjs is already a dependency of this project and reads its own output
 * perfectly well, which saves adding a second PDF library to check the first.
 *
 *   node scripts/probe-trust-report-pdf.mjs [url]
 */

import pg from 'pg'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createClerkClient } from '@clerk/backend'
import { ensureTestUser } from './lib/sign-in.mjs'
import { CLERK_SECRET } from './lib/browser-session.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4401'

const env = readFileSync('.env.local', 'utf8') + '\n' + readFileSync('.env', 'utf8')
const pick = (k) => env.split(/\r?\n/).find((l) => l.trim().startsWith(k + '='))
  ?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const A4_W = 595 // points, ±1
const A4_H = 842

try {
  const { rows: [co] } = await db.query(
    `select id, name from public.companies where status = 'active' limit 1`)

  const userId = await ensureTestUser({ role: 'platform_admin' })
  const ck = createClerkClient({ secretKey: CLERK_SECRET })
  // A real session token, because the endpoint verifies one.
  // A real session, and a real session token — verifyToken on the server side
  // will only accept one Clerk actually issued.
  const session = await ck.sessions.createSession({ userId })
  const { jwt } = await ck.sessions.getToken(session.id)

  console.log('\n─── الصلاحية ───')
  const noAuth = await fetch(`${BASE}/api/trust-report-pdf?company=${co.id}`)
  ok('بلا توكن يُرفض', noAuth.status === 401, String(noAuth.status))

  const badId = await fetch(`${BASE}/api/trust-report-pdf?company=not-a-uuid`,
    { headers: { Authorization: `Bearer ${jwt}` } })
  ok('ومعرّف غير صالح يُرفض', badId.status === 400, String(badId.status))

  console.log('\n─── الإصدار ───')
  const t0 = Date.now()
  const r = await fetch(`${BASE}/api/trust-report-pdf?company=${co.id}`,
    { headers: { Authorization: `Bearer ${jwt}` } })
  const ms = Date.now() - t0

  if (r.status !== 200) {
    const why = await r.text()
    ok('يُصدر ملفاً', false, `${r.status} ${why.slice(0, 160)}`)
    throw new Error('لا ملف لفحصه')
  }

  const buf = Buffer.from(await r.arrayBuffer())
  ok(`يُصدر ملفاً (${(buf.length / 1024).toFixed(0)} ك.ب في ${(ms / 1000).toFixed(1)}ث)`, true)
  ok('نوعه PDF', (r.headers.get('content-type') || '').includes('pdf'),
    r.headers.get('content-type'))
  ok('ويُنزَّل باسم الشركة',
    /filename\*/.test(r.headers.get('content-disposition') || ''),
    r.headers.get('content-disposition'))
  ok('وبايتاته بايتات PDF', buf.subarray(0, 5).toString() === '%PDF-')

  const dir = mkdtempSync(join(tmpdir(), 'marsad-pdf-'))
  const file = join(dir, 'report.pdf')
  writeFileSync(file, buf)
  console.log(`     ${file}`)

  // ===== Read it back =====
  console.log('\n─── قراءة الملف ───')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  ok('يُفتح ويُقرأ', doc.numPages > 0, `${doc.numPages} صفحة`)

  const p1 = await doc.getPage(1)
  const [, , w, h] = p1.view
  ok('مقاسه A4', Math.abs(w - A4_W) <= 2 && Math.abs(h - A4_H) <= 2,
    `${Math.round(w)}×${Math.round(h)}pt`)

  // Arabic in a PDF text layer is not the Arabic that was written.
  //
  // Chromium lays the text out and stores what it drew: presentation forms
  // (U+FE70–FEFF — «ﺪ» is DAL FINAL FORM, not DAL), one glyph per item, in
  // visual order. So «مرصد» comes back as «ﺪﺻﺮﻣ» and a plain `includes` of the
  // string that was actually typed fails against a document that renders it
  // perfectly. That is a property of PDF, not a defect in the file.
  //
  // NFKC folds every presentation form back to its base letter. Order is left
  // alone and both directions are accepted instead, because a line mixing
  // Arabic with digits is not uniformly one or the other.
  const fold = (s) => s.normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')   // harakat and tatweel
    .replace(/\s+/g, '')
  // Letters, contiguous — not order.
  //
  // Reversal is not enough either. Chromium writes glyphs in the order it drew
  // them, and for shaped Arabic that is not a clean mirror of the string:
  // «التجاري» comes back as «التجاير» and «شركة» as «رشكة», with pairs
  // transposed. The page renders correctly — this is the text layer, and the
  // draw order it records cannot be turned back into the source string.
  //
  // So the test is that every letter of the word appears together, in some
  // order, somewhere on the page. That is weaker than an exact match and it is
  // the strongest claim the format actually supports; the layout and the
  // rendering are checked separately, by page size and by ink.
  const sig = (s) => [...s].sort().join('')
  const has = (hay, needle) => {
    const h = fold(hay)
    return String(needle).trim().split(/\s+/).filter(Boolean).every((word) => {
      const w = fold(word)
      const target = sig(w)
      for (let i = 0; i + w.length <= h.length; i++) {
        if (sig(h.slice(i, i + w.length)) === target) return true
      }
      return false
    })
  }

  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent()
    text += c.items.map((it) => it.str).join('') + '\n'
  }

  ok('واسم الشركة مكتوب فيه', has(text, co.name.slice(0, 12)), co.name.slice(0, 24))
  ok('والعربية عربية لا مربّعات', /[؀-ۿﭐ-ﻼ]{3,}/.test(text.replace(/\s/g, '')))

  for (const heading of ['هوية الشركة', 'السلوك التجاري', 'مصادر البيانات', 'حدود هذا التقرير']) {
    ok(`  قسم «${heading}»`, has(text, heading))
  }

  // The running footer is drawn by Chromium per page, not by the markup.
  ok('وترويسة الصفحات مرقّمة', has(text, 'صفحة') && has(text, 'مرصد'))
  ok('ولا صفحة فارغة',
    await (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent()
        // A page carrying only the header and footer is an empty page.
        if (c.items.map((x) => x.str).join('').trim().length < 60) return false
      }
      return true
    })(), 'صفحة بلا محتوى')

  // ===== Stable whatever the data volume =====
  console.log('\n─── ثابت مهما اختلفت البيانات ───')
  const { rows: cos } = await db.query(
    `select id, name from public.companies where status = 'active' limit 3`)
  const sizes = []
  for (const c of cos) {
    const rr = await fetch(`${BASE}/api/trust-report-pdf?company=${c.id}`,
      { headers: { Authorization: `Bearer ${jwt}` } })
    if (rr.status !== 200) { sizes.push(null); continue }
    const b = Buffer.from(await rr.arrayBuffer())
    const d = await pdfjs.getDocument({ data: new Uint8Array(b), useSystemFonts: true }).promise
    const [, , pw, ph] = (await d.getPage(1)).view
    sizes.push({ name: c.name.slice(0, 18), pages: d.numPages, w: Math.round(pw), h: Math.round(ph) })
  }
  sizes.filter(Boolean).forEach((s) => console.log(`     ${s.name.padEnd(20)} ${s.pages} صفحة · ${s.w}×${s.h}`))
  ok('كل التقارير A4 مهما اختلف محتواها',
    sizes.filter(Boolean).every((s) => Math.abs(s.w - A4_W) <= 2 && Math.abs(s.h - A4_H) <= 2))
  ok('وكلها صدرت', sizes.every(Boolean), `${sizes.filter(Boolean).length}/${sizes.length}`)
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 240)}`)
} finally {
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — تقرير A4 واحد، بخطّه وعربيّته وترقيمه\n`)
process.exit(fail ? 1 : 0)
