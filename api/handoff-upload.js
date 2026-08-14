// Vercel serverless function: POST /api/handoff-upload
//
// The phone half of the QR handoff. A laptop has shown a code, somebody has
// scanned it, and this is the only thing that browser is allowed to talk to.
//
// ============================================================================
// Why the file does not pass through here
// ============================================================================
// A serverless function on Vercel accepts 4.5MB of request body. Company
// documents are allowed 15MB — a scanned commercial registration is routinely
// larger than four. Streaming the file through this function would work in
// testing and fail on the first real document, with a platform error nobody
// can act on.
//
// So it does not carry the file. It hands the phone a URL signed for one
// object, valid for a minute, and the phone uploads to storage directly. The
// server's job is deciding *whether*, never *carrying*.
//
// ============================================================================
// Two steps, and why the token burns on the second
// ============================================================================
//   start   validate the token, return where to put the file
//   finish  confirm the object landed, record the document, consume the token
//
// Burning it on `start` would lose a document to a dropped connection: the
// token is spent, the file never arrived, and the person is told the link was
// already used. Burning it on `finish` means an abandoned upload leaves an
// orphan object in a private bucket and nothing else — no row, no record, and
// the handoff expires on its own five minutes later.
//
// `start` is bounded at three tries by the database, so a retry is possible and
// a loop is not.

import { createClient } from '@supabase/supabase-js'

// A value that differs from the real one by an invisible character fails as an
// authentication error, which sends you looking at permissions instead of the
// value. Normalise on read.
import { clean } from './_lib/secrets.js'
import { scanFile, sha256, reasonLabel, SCANNER_VERSION } from './_lib/fileScan.js'

const SUPABASE_URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)

const BUCKET = 'company-documents'
const QUARANTINE = 'quarantine'
const MAX_BYTES = 15 * 1024 * 1024
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
/** النوع المُستنتَج من المحتوى ← ترويسته عند الحفظ. */
const TYPE_MIME = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' }

// The token arrives in a URL the phone opened. Reject anything that is not the
// shape the database issues, before it reaches a query.
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/

const fail = (res, code, error) => res.status(code).json({ error })

export default async function handler(req, res) {
  // A token in a URL must not travel to anywhere else, and this page must not
  // be findable. Neither is a formality: the URL *is* the credential.
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return fail(res, 405, 'الطريقة غير مسموحة')

  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Named, never echoed. A committed .env does not reach a serverless
    // function — only the host's environment settings do.
    return res.status(500).json({
      error: 'إعداد الخادم ناقص',
      missingEnvVars: [!SUPABASE_URL && 'SUPABASE_URL', !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean),
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { action, token } = body

  if (!TOKEN_RE.test(String(token || ''))) return fail(res, 400, 'رابط غير صالح')

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    // Asked on arrival, before anything is shown. `peek` reads and counts
    // nothing — it does not spend one of the three attempts a code is allowed,
    // so scanning, hesitating and scanning again costs nothing.
    if (action === 'check') {
      const { data, error } = await sb.rpc('peek_upload_handoff', { p_token: token })
      if (error) return fail(res, 400, error.message)

      const row = Array.isArray(data) ? data[0] : data
      if (!row) return fail(res, 400, 'رابط غير صالح')

      return res.status(200).json({
        companyName: row.company_name,
        docLabel: row.doc_label,
        expiresAt: row.expires_at,
      })
    }

    if (action === 'start') {
      const size = Number(body.size)
      const mime = String(body.mime || '')

      // Checked here as well as in the browser. The browser check is a courtesy
      // that tells somebody early; this one is the rule.
      if (!TYPES[mime]) return fail(res, 400, 'نوع الملف غير مقبول — PDF أو صورة فقط')
      if (!Number.isFinite(size) || size <= 0) return fail(res, 400, 'حجم غير صالح')
      if (size > MAX_BYTES) return fail(res, 400, 'الملف أكبر من 15 ميجابايت')

      const { data, error } = await sb.rpc('open_upload_handoff', { p_token: token })
      if (error) return fail(res, 400, error.message)

      const row = Array.isArray(data) ? data[0] : data
      if (!row) return fail(res, 400, 'رابط غير صالح')

      // The path is built here from what the handoff says, never from anything
      // the phone sent. `finish_upload_handoff` re-checks that it starts with
      // the handoff's own company id, so a wrong path cannot file a document
      // against a company the code was not issued for.
      const path = `${row.company_id}/${row.doc_type}-${Date.now()}.${TYPES[mime]}`

      // الهاتف يرفع إلى الحجر لا إلى الدلو الدائم. مسار الحجر مشتقّ من الرمز
      // نفسه، فلا يختاره الهاتف — والفحص يجري في `finish` قبل الترقية.
      const quarantinePath = `handoff/${token.slice(0, 24)}-${Date.now()}.${TYPES[mime]}`

      const { data: signed, error: e2 } = await sb.storage
        .from(QUARANTINE).createSignedUploadUrl(quarantinePath)
      if (e2) return fail(res, 500, 'تعذّر تجهيز الرفع')

      return res.status(200).json({
        uploadUrl: signed.signedUrl,
        token: signed.token,
        path: quarantinePath,
        targetPath: path,
        companyName: row.company_name,
        docLabel: row.doc_label,
        expiresAt: row.expires_at,
      })
    }

    if (action === 'finish') {
      const path = String(body.path || '')
      const fileName = String(body.fileName || 'مستند').slice(0, 200)

      // مسار الحجر يُشتقّ من الرمز نفسه — فلا يُصدَّق ما يرسله الهاتف. بدونه
      // يستطيع من يملك رمزاً أن يطلب ترقية ملف حجرٍ لغيره.
      if (!/^handoff\/[A-Za-z0-9_-]{1,64}-\d+\.[a-z0-9]{1,8}$/.test(path)
          || !path.startsWith(`handoff/${token.slice(0, 24)}-`)) {
        return fail(res, 400, 'مسار غير صالح')
      }

      // ---- الفحص قبل الترقية ------------------------------------------------
      // الهاتف رفع إلى الحجر. لا شيء يقرأ من هناك، ولا يبلغ الدلو الدائم إلا
      // بحكم. والفشل مُغلَق: أي تعذّر يُبقي الملف محجوزاً بلا صفّ يشير إليه.
      const { data: blob, error: dlErr } = await sb.storage.from(QUARANTINE).download(path)
      if (dlErr || !blob) return fail(res, 400, 'لم يصل الملف — أعد المحاولة')
      const bytes = Buffer.from(await blob.arrayBuffer())

      const verdict = scanFile(bytes, {
        allow: ['pdf', 'png', 'jpeg'],
        maxBytes: MAX_BYTES,
      })

      const targetPath = String(body.targetPath || '')
      // الوجهة تُعاد من `start` وتُتحقَّق هنا: مجلّد شركة الرمز، لا غير.
      const { data: peek } = await sb.rpc('peek_upload_handoff', { p_token: token })
      const peeked = Array.isArray(peek) ? peek[0] : peek

      await sb.from('file_scans').insert({
        sha256: sha256(bytes),
        quarantine_path: path,
        target_bucket: BUCKET,
        target_path: verdict.verdict === 'clean' ? targetPath : null,
        declared_mime: null,
        detected_type: verdict.detectedType,
        size_bytes: bytes.length,
        scanner_version: SCANNER_VERSION,
        actor: `handoff:${peeked?.company_name || 'unknown'}`,
        verdict: verdict.verdict,
        reasons: verdict.reasons,
        scanned_at: new Date().toISOString(),
      })

      if (verdict.verdict !== 'clean') {
        await sb.storage.from(QUARANTINE).remove([path])
        return res.status(422).json({
          error: 'الملف مرفوض',
          reasons: verdict.reasons,
          messages: verdict.reasons.map(reasonLabel),
        })
      }

      if (!targetPath || !targetPath.startsWith(`${peeked?.company_id ?? ' '}/`)) {
        return fail(res, 400, 'وجهة غير صالحة')
      }

      // الترقية بمفتاح الخدمة: لا هويّة مستخدم في هذا المسار — الرمز هو
      // التصريح، والمسار مشتقّ منه لا من الهاتف.
      const out = verdict.sanitized?.bytes || bytes
      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(targetPath, out, { contentType: TYPE_MIME[verdict.detectedType], upsert: false })
      if (upErr) {
        console.error('handoff-upload — promote failed', upErr)
        return fail(res, 502, 'تعذّر حفظ الملف — أعد المحاولة')
      }
      await sb.storage.from(QUARANTINE).remove([path])

      const { data, error } = await sb.rpc('finish_upload_handoff', {
        p_token: token, p_path: targetPath, p_file_name: fileName,
      })
      if (error) return fail(res, 400, error.message)

      return res.status(200).json({ documentId: data })
    }

    return fail(res, 400, 'إجراء غير معروف')
  } catch (err) {
    // Never return the raw error to a page anyone with the link can open.
    console.error('handoff-upload', err)
    return fail(res, 500, 'خطأ غير متوقّع')
  }
}
