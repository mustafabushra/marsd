// Vercel serverless function: POST /api/extract-document
//
// Reads a company document — commercial registration, business-centre
// certificate, Zakat/VAT/GOSI/municipality certificate, articles of association —
// and returns the company's fields as structured JSON with a confidence per
// field.
//
// ============================================================================
// Why this exists as a server function
// ============================================================================
// The provider key cannot go to the browser, so the model call has to run here.
// Everything else about the feature stays client-side: the pages are posted to
// this endpoint, read, and discarded — nothing is stored, and no reference to the
// document is kept after the response is written.
//
// ============================================================================
// The provider, and what it costs us in guarantees
// ============================================================================
// Groq (https://api.groq.com/openai/v1), OpenAI-compatible, on the one model
// there that reads images. Chosen for speed and price.
//
// Two of its limits shape this whole file:
//
//   1. It does not accept PDFs — images only. The browser rasterises the PDF
//      before posting (see pdfToImages.js); by the time a request arrives here
//      it is always a list of images.
//
//   2. Schema-enforced output (`json_schema`) is not available on the vision
//      model — only `json_object`, which guarantees the reply parses and nothing
//      else. The model may return a field we never asked for, a bare string
//      where a {value, confidence} pair belongs, a confidence of 7, or three
//      paragraphs of prose in `city`.
//
// So the schema is enforced *here*, after the fact, by `sanitise()`. That
// function is not defensive decoration — it is the only thing standing between a
// loose reply and a company record, and every branch in it is a shape a model
// has actually produced. Nothing reaches the browser that did not pass it.

import { verifyToken } from '@clerk/backend'
import { createClient } from '@supabase/supabase-js'

// A value piped through a shell on Windows can carry a BOM; a key that differs
// by one invisible character fails as an auth error and sends you looking at
// permissions. The normalisation was copied into each function by hand and
// forgotten in trust-report-pdf, so that one alone rejected every session.
// One source now.
import { clean, clerkKeyKind } from './_lib/secrets.js'

const CLERK_SECRET = clean(process.env.CLERK_SECRET_KEY)
const SUPABASE_URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SUPABASE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
const GROQ_KEY = clean(process.env.GROQ_API_KEY)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// The only model on Groq that reads images. Overridable from system_settings so
// a rename by the provider is a dashboard edit, not a redeploy — this ID has
// changed before and will again.
const DEFAULT_MODEL = 'qwen/qwen3.6-27b'

// That model reasons before it answers, and reasoning earns its keep on a
// right-to-left page where a label sits to the right of its value and the two
// columns have to be matched up.
//
// The provider's own docs list five levels for the qwen3 family; this model
// rejects all but two, which is why the value is checked against what it
// actually accepts rather than what the documentation claims.
const DEFAULT_EFFORT = 'default'

// Groq caps a request at 20MB and 5 images. These sit under both: a decoded
// 4MB page is already far more resolution than any certificate needs, and a
// commercial registration that runs past five pages is an appendix, not fields.
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = 12 * 1024 * 1024

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// ---------------------------------------------------------------------------
// The documents this understands
// ---------------------------------------------------------------------------
// Named rather than inferred: telling the model which certificate it is looking
// at is worth more than any amount of prompt about how to guess. `also` lists
// the fields that only appear on that document, so the prompt asks for them
// only when they could be there.
const DOC_TYPES = {
  commercial_registration: {
    label: 'السجل التجاري',
    also: 'رأس المال، صفات الشركة، رقم نسخة السجل، تاريخ التأكيد السنوي، أسماء المديرين، كل الأنشطة',
  },
  business_centre: {
    label: 'شهادة مركز الأعمال',
    also: 'رقم الشهادة، الحالة، الأنشطة',
  },
  zakat: { label: 'شهادة الزكاة', also: 'رقم الشهادة، تاريخ الانتهاء' },
  vat: { label: 'شهادة ضريبة القيمة المضافة', also: 'الرقم الضريبي، تاريخ التسجيل' },
  gosi: { label: 'شهادة التأمينات الاجتماعية', also: 'رقم المنشأة، عدد الموظفين' },
  municipality: { label: 'رخصة البلدية', also: 'رقم الرخصة، النشاط، تاريخ الانتهاء' },
  articles: { label: 'عقد التأسيس', also: 'الشركاء ونسبهم، رأس المال، تاريخ التأسيس' },
  auto: { label: 'مستند شركة (غير محدد)', also: 'أي بيانات رسمية ظاهرة' },
}

// ---------------------------------------------------------------------------
// The shape the reply is forced into
// ---------------------------------------------------------------------------
const FIELDS = [
  'company_name_ar', 'company_name_en', 'commercial_registration', 'unified_number',
  'entity_type', 'company_type', 'company_traits', 'status', 'company_size',
  'capital', 'registration_date', 'annual_confirmation_date', 'expiry_date',
  'cr_version_number', 'sector', 'main_activity', 'city', 'region',
  'national_address', 'website', 'email', 'phone',
]

// A field on a certificate is a line, not an essay. Anything longer is the model
// having lost the thread and started narrating — truncating it would hand the
// reviewer a plausible-looking fragment, so it is dropped entirely.
const MAX_VALUE_LEN = 400

const ARABIC_DIGITS = /[٠-٩۰-۹]/g

/** ٠١٢ → 012. Asked for in the prompt; done here because prompts are requests. */
const toAscii = (s) => String(s).replace(ARABIC_DIGITS, (d) => {
  const c = d.charCodeAt(0)
  return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660)
})

const squash = (s) => toAscii(s).replace(/[\s\u200F\u200E]+/g, ' ').trim()

/**
 * One field, whatever the model actually sent.
 *
 * Returns null — meaning "not present" — rather than a placeholder, because a
 * field the model did not produce and a field it produced as empty are the same
 * thing to the person reviewing, and neither should occupy a row on the screen.
 */
function readField(raw) {
  // The documented shape.
  let value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value : raw
  let confidence = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.confidence : null

  // A bare string instead of the pair. The value may well be right, but the
  // model never said how sure it was, so it cannot be presented as though it
  // did — 0.5 puts it under the review threshold where an unstated claim
  // belongs.
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) confidence = 0.5

  // Some replies wrap the number as a string ("0.95"), others as a percentage.
  if (typeof raw?.confidence === 'string') {
    const n = Number(raw.confidence.replace('%', ''))
    if (Number.isFinite(n)) confidence = n > 1 ? n / 100 : n
  }

  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') value = String(value)
  if (typeof value !== 'string') return null

  const v = squash(value)
  if (!v) return null
  // Models write these when they mean null. Stored as text they become a
  // company literally named "غير متوفر".
  if (/^(null|none|n\/a|na|-|—|غير متوفر|غير موجود|لا يوجد)$/i.test(v)) return null
  if (v.length > MAX_VALUE_LEN) return null

  return { value: v, confidence: Math.min(1, Math.max(0, confidence)) }
}

/** A list of strings, from a reply that may have sent a string, or objects. */
function readList(raw) {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,،\n]/) : []
  const out = []
  for (const item of arr) {
    const s = squash(typeof item === 'string' ? item : (item?.name ?? item?.value ?? ''))
    if (s && s.length <= MAX_VALUE_LEN && !out.includes(s)) out.push(s)
    if (out.length >= 40) break
  }
  return out
}

/**
 * The schema the provider would not enforce.
 *
 * Only the keys below survive. A model that invents `owner_national_id` is not
 * passed through to a screen that would happily display it as fact.
 */
export function sanitise(raw) {
  const out = {
    document_type: typeof raw?.document_type === 'string' && DOC_TYPES[raw.document_type]
      ? raw.document_type
      : null,
    // Only an explicit false counts. A model that omitted the key has not told
    // us this is a company document, but it has not told us it isn't either, and
    // treating silence as rejection would throw away good extractions.
    is_company_document: raw?.is_company_document === false ? false : true,
    sub_activities: readList(raw?.sub_activities),
    managers: readList(raw?.managers),
    notes: null,
  }

  const notes = readField(raw?.notes)
  if (notes) out.notes = notes.value

  for (const f of FIELDS) {
    const v = readField(raw?.[f])
    if (v) out[f] = v
  }
  return out
}

const SYSTEM = `أنت تقرأ مستندات شركات سعودية رسمية لمنصة "مرصد" لتقييم الثقة التجارية.

مهمتك: استخراج بيانات الشركة كما هي مكتوبة في المستند — لا أكثر.

قواعد لا تُخالَف:
• لا تخترع قيمة أبداً. الحقل غير الموجود اتركه null.
• انسخ ما تراه حرفياً. لا تصحّح إملاءً ولا تُكمل اسماً ناقصاً ولا تستنتج قيمة من أخرى.
• التواريخ: أعد الميلادي بصيغة YYYY-MM-DD. إذا كان التاريخ هجرياً فقط، أعده كما هو مكتوب مع كلمة "هجري" واخفض الثقة إلى 0.4 — التحويل ليس عملك.
• الأرقام العربية (٠١٢٣) حوّلها إلى أرقام لاتينية.
• السجل التجاري السعودي عشرة أرقام. إن قرأت رقماً بعدد مختلف، أعده كما قرأته واخفض الثقة.
• الثقة رقم بين 0 و 1، ومعناها: كم أنت واثق أن هذه هي الحروف المكتوبة فعلاً. صورة ضبابية أو ختم فوق النص أو خط يدوي = ثقة منخفضة. نص مطبوع واضح = ثقة عالية.
• لا تخلط بين تاريخ الإصدار وتاريخ الانتهاء وتاريخ التأكيد السنوي. إن لم تميّز بينها، اترك الحقل null.

أعد JSON فقط، بلا أي نص قبله أو بعده.

المفاتيح المسموحة، ولا شيء غيرها:
document_type — واحد من: ${Object.keys(DOC_TYPES).join(' | ')}
is_company_document — true أو false
${FIELDS.join('، ')}
sub_activities — مصفوفة نصوص
managers — مصفوفة نصوص
notes — نص أو null

كل حقل من الحقول المذكورة أعلاه (عدا الأربعة الأخيرة) قيمته كائن فيه value و confidence.

مثال كامل على الشكل المطلوب:
{
  "document_type": "commercial_registration",
  "is_company_document": true,
  "company_name_ar": { "value": "شركة المثال التجارية", "confidence": 0.97 },
  "commercial_registration": { "value": "1010000000", "confidence": 0.99 },
  "website": { "value": null, "confidence": 1.0 },
  "sub_activities": ["البيع بالتجزئة", "البيع بالجملة"],
  "managers": ["محمد بن علي"],
  "notes": null
}

إن لم يكن المستند وثيقة شركة، اضبط is_company_document على false واترك الحقول null.`

/** What qwen3.6-27b accepts. Anything else comes back as a 400. */
const EFFORTS = new Set(['none', 'default'])

/**
 * Model and reasoning effort, from the dashboard if they were set there.
 *
 * Never fatal: a missing row, a bad value, or an unreachable database all fall
 * back to the shipped defaults, because a settings lookup failing is not a
 * reason to refuse to read a document.
 */
async function configFrom(supabase) {
  try {
    const { data } = await supabase
      .from('system_settings').select('value').eq('key', 'document_ai').maybeSingle()
    const effort = clean(data?.value?.reasoning_effort)
    return {
      model: clean(data?.value?.model) || DEFAULT_MODEL,
      effort: EFFORTS.has(effort) ? effort : DEFAULT_EFFORT,
    }
  } catch {
    return { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'الطريقة غير مدعومة' })
  }

  const missing = []
  if (!CLERK_SECRET) missing.push('CLERK_SECRET_KEY')
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!GROQ_KEY) missing.push('GROQ_API_KEY')
  if (missing.length) {
    // Name what is missing so the fix is obvious; never echo a value.
    return res.status(500).json({
      error: `الخادم غير مُهيّأ — أضف هذه المتغيرات في إعدادات البيئة على Vercel: ${missing.join('، ')}`,
      missingEnvVars: missing,
    })
  }

  try {
    // ---- 1) who is asking ---------------------------------------------------
    const authz = req.headers.authorization || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
    if (!token) return res.status(401).json({ error: 'غير مصرّح' })

    let callerId
    try {
      callerId = (await verifyToken(token, { secretKey: CLERK_SECRET })).sub
    } catch (err) {
      // `catch {}` بلا وسيط كان يبتلع السبب كاملاً، فتتشابه كل حالات الرفض:
      // جلسة منتهية، ومفتاح من نسخة Clerk أخرى، وتوكن مشوّه — ثلاثتها تُعطي
      // نفس الجملة وتحتاج ثلاثة إصلاحات مختلفة. سبب Clerk يسمّي الفحص الذي
      // فشل ولا يكشف مفتاحاً، فيُمرَّر؛ والتفصيل الكامل إلى سجلّ الخادم.
      const why = String(err?.reason || err?.message || 'سبب غير معروف')
      console.error('extract-document — token verification failed:', {
        reason: err?.reason || null,
        message: err?.message || null,
        keyKind: clerkKeyKind(process.env.CLERK_SECRET_KEY),
      })
      return res.status(401).json({
        error: /expired/i.test(why) ? 'انتهت صلاحية الجلسة — أعد تحميل الصفحة'
          : /issuer|instance|kid|key/i.test(why) ? 'مفتاح Clerk على الخادم لا يطابق الذي أصدر الجلسة'
            : 'جلسة غير صالحة — أعد تسجيل الدخول',
        detail: why.slice(0, 240),
      })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const docType = DOC_TYPES[body.doc_type] ? body.doc_type : 'auto'
    const images = Array.isArray(body.images) ? body.images : []

    if (!images.length) return res.status(400).json({ error: 'لا يوجد ملف' })
    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ error: `الحد ${MAX_IMAGES} صفحات في المرة الواحدة` })
    }

    let total = 0
    for (const img of images) {
      if (!ACCEPTED.has(String(img?.media_type))) {
        return res.status(400).json({ error: 'نوع الملف غير مدعوم — صورة فقط' })
      }
      // base64 inflates by ~4/3; check the decoded size, which is what counts.
      const bytes = Math.floor(String(img?.data || '').length * 0.75)
      if (!bytes) return res.status(400).json({ error: 'صفحة فارغة' })
      if (bytes > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'صفحة كبيرة — الحد 4 ميغابايت للصفحة' })
      total += bytes
    }
    if (total > MAX_TOTAL_BYTES) return res.status(413).json({ error: 'الملف كبير — قلّل عدد الصفحات' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

    // ---- 2) may they, and how often ----------------------------------------
    // Every read costs money and runs on somebody else's infrastructure, so the
    // quota is checked in the database rather than trusted from the client.
    const { data: quota, error: quotaErr } = await supabase.rpc('claim_document_read', {
      p_user_id: callerId,
      p_doc_type: docType,
    })
    if (quotaErr) return res.status(500).json({ error: quotaErr.message })
    if (!quota?.ok) return res.status(429).json({ error: quota?.reason || 'تعذّر السماح بالقراءة' })

    // ---- 3) read it ---------------------------------------------------------
    const doc = DOC_TYPES[docType]
    const { model, effort } = await configFrom(supabase)

    const content = [
      {
        type: 'text',
        text: `هذا ${doc.label}${images.length > 1 ? ` (${images.length} صفحات)` : ''}.`
          + ` استخرج بيانات الشركة منه.`
          + `\nقد يحتوي أيضاً على: ${doc.also}.`
          + `\nما لا تجده اتركه null — لا تخمّن.`,
      },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.media_type};base64,${img.data}` },
      })),
    ]

    // AbortController rather than the platform timeout: a hung upstream would
    // otherwise burn the full function budget and return nothing, having already
    // spent one of the caller's daily reads.
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 55_000)

    let upstream
    try {
      upstream = await fetch(GROQ_URL, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content },
          ],
          // Not json_schema: the vision model does not support schema
          // enforcement. This only guarantees the reply parses — sanitise()
          // does the rest.
          response_format: { type: 'json_object' },
          // This model thinks before it answers, and by default the thinking is
          // returned inside the message. That is not JSON, so the provider
          // rejects the whole generation and hands back an empty result — which
          // is exactly what happened before this line existed. 'hidden' keeps
          // the reasoning server-side and leaves only the object.
          reasoning_format: 'hidden',
          reasoning_effort: effort,
          // Reading, not composing. Any creativity here is a fabricated field.
          temperature: 0,
          // Thinking is drawn from this same budget, so it is set well above
          // what the object alone needs. A reply cut off mid-JSON is refused
          // below rather than partially trusted.
          max_completion_tokens: 8192,
        }),
      })
    } catch (e) {
      clearTimeout(timer)
      if (e?.name === 'AbortError') {
        return res.status(504).json({ error: 'استغرقت القراءة وقتاً طويلاً — جرّب صفحات أقل أو صورة أصغر' })
      }
      throw e
    }
    clearTimeout(timer)

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      // The upstream body can name the account and the key; it is logged for us
      // and never returned to the browser.
      console.error('groq %s: %s', upstream.status, detail.slice(0, 500))
      if (upstream.status === 429) {
        return res.status(429).json({ error: 'الخدمة مزدحمة — أعد المحاولة بعد قليل' })
      }
      if (upstream.status === 413) {
        return res.status(413).json({ error: 'الملف كبير على الخدمة' })
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return res.status(500).json({ error: 'مفتاح خدمة القراءة غير صالح — راجع إعدادات الخادم' })
      }
      if (upstream.status === 404 || /model.*(not found|does not exist)/i.test(detail)) {
        return res.status(500).json({ error: `الموديل «${model}» غير متاح — عدّله من إعدادات المنصة` })
      }
      // The model produced something that was not the object asked for. Named
      // separately because it is the one upstream failure that is our fault —
      // the prompt or the reasoning settings — and not the caller's document.
      // A different model accepts a different set of effort levels. If the one
      // configured is refused, say which setting to change rather than leaving
      // an admin to guess from a generic read failure.
      if (/reasoning_effort/.test(detail)) {
        return res.status(500).json({
          error: `الموديل «${model}» لا يقبل مستوى التفكير «${effort}» — عدّل reasoning_effort من إعدادات المنصة`,
        })
      }
      if (/json_validate_failed/.test(detail)) {
        return res.status(502).json({ error: 'تعذّر تنسيق نتيجة القراءة — أعد المحاولة، وإن تكرّر فأبلغ الدعم' })
      }
      return res.status(502).json({ error: 'تعذّرت قراءة المستند — أعد المحاولة' })
    }

    const payload = await upstream.json()
    const choice = payload?.choices?.[0]

    // A cut-off reply is truncated JSON at best and half a field at worst.
    // Reported rather than parsed, because the fields that survive would look
    // exactly as trustworthy as a complete read.
    if (choice?.finish_reason === 'length') {
      return res.status(502).json({ error: 'المستند طويل على القراءة الآلية — جرّب صفحة واحدة' })
    }

    const text = choice?.message?.content
    if (!text) return res.status(502).json({ error: 'لم يُقرأ أي محتوى من المستند' })

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      // json_object guarantees this parses, so it should not happen — reported
      // rather than papered over, because a silent empty result looks like a
      // blank document to the person on the other end.
      return res.status(502).json({ error: 'الرد لم يكن بالشكل المتوقّع' })
    }

    return res.status(200).json({
      ok: true,
      extraction: sanitise(parsed),
      model,
      effort,
      usage: {
        input_tokens: payload?.usage?.prompt_tokens ?? null,
        output_tokens: payload?.usage?.completion_tokens ?? null,
      },
      remaining: quota.remaining ?? null,
    })
  } catch (err) {
    console.error('extract-document:', err)
    return res.status(500).json({ error: 'خطأ غير متوقّع أثناء قراءة المستند' })
  }
}
