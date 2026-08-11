// Vercel serverless function: GET /api/trust-report-pdf?company=<uuid>
//
// The trust report as a PDF, rendered by Chromium on the server.
//
// ============================================================================
// Why not window.print()
// ============================================================================
// The button called window.print(). The reasoning behind that was sound and is
// kept here — Arabic in a PDF library means embedding a font and shaping the
// text by hand, and it still breaks on ligatures, whereas a browser already
// lays out RTL correctly. What was wrong was *whose* browser.
//
// window.print() hands the job to the reader's machine: their page size, their
// margins, their «headers and footers» checkbox, their scale, whatever they
// last printed with. Two people asking for the same report get two different
// papers, and neither is the one Marsad designed. A report that is evidence in
// a decision cannot look different depending on who saved it.
//
// So the same engine renders it, on the server, from one template, at A4.
//
// ============================================================================
// Chromium on Vercel
// ============================================================================
// The full `playwright` package carries a ~300MB browser and a function is
// capped at 250MB, so it cannot ship. @sparticuz/chromium is a Chromium built
// for exactly this — brotli-compressed, ~50MB — driven by playwright-core.
//
// Locally there is a real Playwright install, so this uses that when it is
// there and the Lambda build when it is not. Same code path either way, which
// is what makes the thing testable before it is deployed.
//
// ============================================================================
// Who may ask
// ============================================================================
// A trust report is about a real company and is not public. The caller's Clerk
// session token is verified and their row is read from Supabase, the same way
// api/invite-user.js does it. An unauthenticated request gets 401 — a PDF
// endpoint that answers anybody is a way to enumerate the whole registry.

import { verifyToken } from '@clerk/backend'
import { createClient } from '@supabase/supabase-js'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// The precompiled template, not the .jsx source.
//
// Importing the source meant the function's ability to start depended on the
// platform transpiling JSX and understanding `import … with { type: 'json' }`.
// Neither is Node; both fail at module load, before the handler runs — which is
// why every request returned FUNCTION_INVOCATION_FAILED, including ones this
// file rejects on its second line. Built by scripts/build-report-template.mjs.
import { TrustReportDocument, documentShell } from './_report/document.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Chromium, whichever one this environment has. */
async function launch () {
  try {
    // Local / any box with a full install.
    const { chromium } = await import('playwright')
    return await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] })
  } catch {
    const [{ chromium: pw }, mod] = await Promise.all([
      import('playwright-core'),
      import('@sparticuz/chromium'),
    ])
    const lambda = mod.default || mod
    return await pw.launch({
      args: [...lambda.args, '--font-render-hinting=none'],
      executablePath: await lambda.executablePath(),
      headless: true,
    })
  }
}

/**
 * The running header and footer.
 *
 * Chromium draws these per page, after it has paginated. That is the only way
 * «صفحة ٢ من ٧» can be right — CSS counters run before pagination and cannot
 * see how many pages there turned out to be.
 *
 * They get their own font stack: these fragments are rendered in a separate
 * context that does not inherit the document's stylesheet, so the embedded
 * Tajawal is not available to them. They are deliberately plain and Latin-safe
 * apart from short Arabic strings that any system Arabic face renders.
 */
const headerTemplate = (companyName) => `
<div style="width:100%;font-size:7pt;color:#94A3B8;padding:0 18mm;
            font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;
            display:flex;justify-content:space-between;">
  <span>مرصد · تقرير موثوقية</span>
  <span>${escapeHtml(companyName).slice(0, 70)}</span>
</div>`

const footerTemplate = () => `
<div style="width:100%;font-size:7pt;color:#94A3B8;padding:0 18mm;
            font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;
            display:flex;justify-content:space-between;">
  <span>صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></span>
  <span>marsad.sa</span>
</div>`

function escapeHtml (s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default async function handler (req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'GET only' })
  }

  const companyId = String(req.query?.company || '')
  if (!UUID.test(companyId)) {
    return res.status(400).json({ error: 'company must be a uuid' })
  }

  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'يلزم تسجيل الدخول' })

  let userId
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
    userId = claims?.sub
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة' })
  }
  if (!userId) return res.status(401).json({ error: 'يلزم تسجيل الدخول' })

  // The caller's own token, not a service key.
  //
  // Supabase here is configured for Clerk's third-party auth — src/lib/api.ts
  // hands it the Clerk session token via `accessToken` — so the same token
  // works from a server. That means every row-level policy applies exactly as
  // it would for this person in the app, and the PDF cannot contain anything
  // they could not already read. A service key would bypass all of it, and the
  // only thing standing between a reader and somebody else's data would be the
  // company id in the query string.
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )

  let browser
  try {
    // The reader has to exist. Beyond that a trust report is readable by any
    // signed-in account — it is what the product sells — so this is an
    // authentication check, not an authorisation one.
    const { data: me } = await supabase
      .from('users').select('id').eq('id', userId).maybeSingle()
    if (!me) return res.status(403).json({ error: 'حساب غير معروف' })

    const { data: company, error: coErr } = await supabase
      .from('companies').select('id, name, status')
      .eq('id', companyId).maybeSingle()
    if (coErr) throw coErr
    if (!company) return res.status(404).json({ error: 'الشركة غير موجودة' })

    // The same RPCs the screen reads, so the paper cannot disagree with it.
    const [full, context, history] = await Promise.all([
      supabase.rpc('company_report_full', { p_company_id: companyId }),
      supabase.rpc('company_score_context', { p_company_id: companyId }),
      supabase.rpc('company_score_history', { p_company_id: companyId, p_limit: 24 }),
    ])

    const html = documentShell(
      renderToStaticMarkup(React.createElement(TrustReportDocument, {
        company,
        full: full.data || {},
        context: context.data || {},
        history: Array.isArray(history.data) ? history.data : [],
        generatedAt: new Date().toISOString(),
        reportId: companyId,
      })),
      `مرصد — تقرير موثوقية ${company.name}`,
    )

    browser = await launch()
    const page = await browser.newPage()
    // setContent, not goto: nothing is fetched, so there is no network state to
    // wait on and no request that can fail halfway and leave a half-drawn page.
    await page.setContent(html, { waitUntil: 'load' })
    // The embedded faces still have to be parsed before layout is measured.
    await page.evaluate(() => document.fonts.ready)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(company.name),
      footerTemplate: footerTemplate(),
      margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
    })

    const safe = String(company.name).replace(/[^\w؀-ۿ]+/g, '_').slice(0, 60)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`مرصد-${safe}.pdf`)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (e) {
    // Say which step failed. «تعذّر إصدار التقرير» on its own is unactionable —
    // a missing Chromium, a missing environment variable and a database refusal
    // all read identically, and the person seeing it cannot tell you which.
    // None of these strings carry a secret or a row.
    const raw = String(e?.message || e)
    const stage = /executablePath|Executable doesn't exist|libnss|browserType|Chromium/i.test(raw)
      ? 'المتصفّح غير متاح على الخادم'
      : /supabaseKey|SUPABASE|fetch failed|getaddrinfo/i.test(raw)
        ? 'تعذّر الوصول إلى قاعدة البيانات'
        : /Timeout|timed out/i.test(raw)
          ? 'انتهت مهلة الإصدار'
          : 'تعذّر إصدار التقرير'
    console.error('trust-report-pdf failed:', raw)
    return res.status(500).json({ error: stage, detail: raw.slice(0, 200) })
  } finally {
    await browser?.close().catch(() => {})
  }
}
