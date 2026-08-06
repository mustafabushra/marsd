import { emptyExtraction, squash } from './normalize.js'
import { toPageImages, MAX_PAGES } from './pageImages.js'

/**
 * Reading a document with a model, as one more source.
 *
 * It returns the same shape as the QR reader and the viewcr parser, so the
 * review screen, the confidence badges, and the add-company form treat it
 * identically — the point of normalize.js. Nothing downstream knows a model was
 * involved.
 *
 * Where it sits against the others:
 *
 *   QR / pasted page  — exact characters. Always better when available.
 *   this              — reads the document. Best when there is no QR and no
 *                       page to copy: a scan, a photo, a PDF, a certificate
 *                       type no portal publishes.
 *   OCR               — a stream of characters and a regex guessing at labels.
 *
 * The document is posted to /api/extract-document, read, and discarded there.
 * The API key cannot come to the browser, which is the only reason this is not
 * a purely client-side source like the rest.
 *
 * A PDF is rasterised here before it is posted — the reader takes images only.
 * Doing it in the browser also means a 6MB scan crosses the network as a few
 * hundred kilobytes of JPEG.
 */

/** The documents the endpoint knows how to read, in the order people have them. */
export const DOC_TYPES = [
  { v: 'commercial_registration', t: 'السجل التجاري' },
  { v: 'business_centre', t: 'شهادة مركز الأعمال' },
  { v: 'zakat', t: 'شهادة الزكاة' },
  { v: 'vat', t: 'شهادة ضريبة القيمة المضافة' },
  { v: 'gosi', t: 'شهادة التأمينات الاجتماعية' },
  { v: 'municipality', t: 'رخصة البلدية' },
  { v: 'articles', t: 'عقد التأسيس' },
  { v: 'auto', t: 'مستند آخر — تعرّف عليه تلقائياً' },
]

/** Model field → add-company form field. Anything absent here goes to extras. */
const TO_FORM = {
  company_name_ar: 'companyName',
  company_name_en: 'nameEn',
  commercial_registration: 'registryNumber',
  unified_number: 'unifiedNumber',
  entity_type: 'entityType',
  status: 'crStatus',
  company_size: 'enterpriseSize',
  expiry_date: 'crExpiryDate',
  registration_date: 'foundingDate',
  sector: 'sector',
  main_activity: 'mainActivity',
  city: 'city',
  region: 'region',
  national_address: 'nationalAddress',
  website: 'website',
  email: 'officialEmail',
  phone: 'phone',
}

const EXTRA_LABELS = {
  company_type: 'نوع الشركة',
  company_traits: 'صفات الشركة',
  capital: 'رأس المال',
  annual_confirmation_date: 'تاريخ التأكيد السنوي',
  cr_version_number: 'رقم نسخة السجل',
}

/**
 * A number becomes one of three badges.
 *
 * The screen already speaks in مؤكَّد / مُستخرَج / تخمين, and a person deciding
 * whether to trust a field does not act differently at 0.86 than at 0.88 — the
 * decision is trust it, check it, or retype it. 0.90 is the line the review
 * screen was asked for; below 0.70 the value is shown but marked as a guess.
 */
const bucket = (n) => (n >= 0.9 ? 'high' : n >= 0.7 ? 'medium' : 'low')

export const aiSource = {
  id: 'ai',
  label: 'اقرأ المستند تلقائياً',
  icon: '✨',
  hint: 'سجل تجاري، زكاة، ضريبة، تأمينات، بلدية، عقد تأسيس — PDF أو صورة',
  accepts: 'application/pdf,image/*',

  /**
   * @param {File} file
   * @param {(pct:number, note:string)=>void} onProgress
   * @param {{ docType?: string, getToken: () => Promise<string|null> }} opts
   */
  async run(file, onProgress, opts = {}) {
    const out = emptyExtraction('ai')
    out.extras = {}

    // Rasterise first. It is the slow half on a multi-page scan, and doing it
    // before the token means an expired session is discovered after the wait
    // rather than before — so the token is fetched first.
    let token
    try { token = await opts.getToken?.() } catch { token = null }
    if (!token) return { ...out, note: 'الجلسة منتهية — أعد تسجيل الدخول ثم حاول مجدداً.' }

    onProgress?.(10, 'يجهّز الملف…')
    let images
    try {
      images = await toPageImages(file, (note) => onProgress?.(25, note))
    } catch (e) {
      return { ...out, note: e?.message || 'تعذّر تجهيز الملف للقراءة.' }
    }

    onProgress?.(45, images.length > 1 ? `يقرأ ${images.length} صفحات…` : 'يقرأ المستند…')
    let resp
    try {
      resp = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ images, doc_type: opts.docType || 'auto' }),
      })
    } catch {
      return { ...out, note: 'تعذّر الوصول للخدمة — تحقّق من الاتصال، أو استخدم المسح بالـQR.' }
    }

    // An SPA fallback serving index.html is the signature of a function that
    // was never deployed — distinguish it from a real error rather than
    // reporting "unexpected response".
    const ct = resp.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return { ...out, note: 'خدمة قراءة المستندات غير منشورة على الخادم.' }
    }

    const body = await resp.json().catch(() => null)
    if (!resp.ok || !body?.ok) {
      return { ...out, note: body?.error || 'تعذّرت قراءة المستند.' }
    }

    onProgress?.(90, 'يرتّب الحقول…')
    const e = body.extraction || {}

    if (e.is_company_document === false) {
      return { ...out, note: 'هذا الملف لا يبدو وثيقة شركة — تأكّد أنك رفعت المستند الصحيح.' }
    }

    for (const [from, to] of Object.entries(TO_FORM)) {
      const f = e[from]
      const value = squash(f?.value)
      if (!value) continue
      out.fields[to] = {
        value,
        confidence: bucket(Number(f.confidence) || 0),
        // The raw number is kept: the badge is a bucket, but a reviewer asking
        // "how sure?" about one field deserves the actual answer.
        raw: `ثقة ${Math.round((Number(f.confidence) || 0) * 100)}%`,
      }
    }

    if (Array.isArray(e.sub_activities) && e.sub_activities.length) {
      out.fields.subActivities = {
        value: e.sub_activities.join('، '),
        confidence: 'medium',
        raw: null,
      }
      out.extras.activities = e.sub_activities
    }
    if (Array.isArray(e.managers) && e.managers.length) out.extras.managers = e.managers

    for (const [k, label] of Object.entries(EXTRA_LABELS)) {
      const v = squash(e[k]?.value)
      if (v) out.extras[label] = v
    }

    const found = Object.keys(out.fields).length
    out.meta = {
      reader: body.model || 'آلي',
      pages: images.length,
      detected: e.document_type || null,
      remaining: body.remaining ?? null,
      read_at: new Date().toISOString(),
    }

    // What the model flagged about the document itself — a blurry scan, an
    // expired certificate, a missing page — is exactly what a reviewer needs
    // before trusting the fields, so it is surfaced rather than dropped.
    const notes = [e.notes || null]

    // A document longer than the cap was read in part. Saying so matters: a
    // field that lives on page four is absent here for a reason that has
    // nothing to do with the document, and silence would read as "not present".
    if (images.length >= MAX_PAGES) {
      notes.push(`قُرئت أول ${MAX_PAGES} صفحات فقط — إن كان المستند أطول، راجع بقية الصفحات يدوياً.`)
    }
    if (found === 0) {
      notes.unshift('لم يُستخرج أي حقل من هذا المستند — جرّب صورة أوضح أو أدخل البيانات يدوياً.')
    }

    out.note = notes.filter(Boolean).join(' ') || null

    onProgress?.(100, '')
    return out
  },
}
