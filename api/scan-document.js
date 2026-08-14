// Vercel serverless function: POST /api/scan-document
//
// بوّابة فحص المستندات. كل ملف يصل إلى مرصد يمرّ من هنا، ولا يبلغ دلواً دائماً
// إلا بحكمٍ من هذه الدالة.
//
// ============================================================================
// الملف لا يمرّ في جسم الطلب
// ============================================================================
// Vercel يقبل ٤٫٥ م.ب في جسم الطلب، ومستندات مرصد تبلغ ٢١. فالمتصفّح يرفع إلى
// دلو الحجر مباشرةً، ثم ينادي هذه الدالة بالمسار. والدالة تُنزّل من التخزين —
// وهذا اتصال خادم بخادم لا يحدّه ذلك السقف.
//
// ============================================================================
// لماذا يُرفع إلى الوجهة بهويّة المستخدم لا بمفتاح الخدمة
// ============================================================================
// هذه أهمّ نقطة في الملف.
//
// دلاء مرصد تحرس مساراتها بـRLS: `report-documents` لا يقبل الكتابة إلا في
// مجلّد تقريرٍ يملكه مستأجر الكاتب، و`support-attachments` إلا في مجلّد تذكرة
// فتحها هو. مفتاح الخدمة يتجاوز ذلك كلّه.
//
// فلو رفعت البوّابة بمفتاح الخدمة لَوَجَب أن تُعيد كتابة كل قاعدة تصريح من
// جديد — ونسخةٌ ثانية من قواعد التصريح تفترق عن الأولى، وتصير البوّابةُ
// التي أُضيفت للأمان هي الثغرة: أي مستخدم يمرّر مسار وجهة لشركة غيره.
//
// فالتنزيل من الحجر بمفتاح الخدمة (لا سبيل غيره — لا سياسة قراءة على الحجر)،
// والرفع إلى الوجهة **بتوكن المستخدم نفسه**. فتبقى كل سياسة قائمة كما هي،
// ولا تضيف البوّابة إلا الفحص. ورفضُ RLS للرفع يعني أن الطالب لم يكن مخوّلاً،
// ويُعامَل كذلك.
//
// ============================================================================
// الفشل مُغلَق
// ============================================================================
//   clean     رُقّي وحُذف من الحجر
//   rejected  حُذف من الحجر، وسببه مُسجَّل ومُدقَّق
//   error     **يبقى في الحجر**، ولا يُرقّى، ويُعاد 5xx
//
// نظامٌ يمرّر عند تعطّل الفاحص يُهاجَم بتعطيل الفاحص.

import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@clerk/backend'

import { clean, clerkKeyKind } from './_lib/secrets.js'
import { limitOrReject } from './_lib/rateLimit.js'
import { scanFile, sha256, reasonLabel, SCANNER_VERSION } from './_lib/fileScan.js'

const SUPABASE_URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
const ANON_KEY = clean(process.env.SUPABASE_ANON_KEY) || clean(process.env.VITE_SUPABASE_ANON_KEY)
const CLERK_SECRET = clean(process.env.CLERK_SECRET_KEY)

const QUARANTINE = 'quarantine'

/**
 * الوجهات المسموحة وحدودها.
 *
 * الحدود من الدلاء نفسها (راجع migration 174 وما بعده)، مكتوبةً هنا كي يُرفض
 * الملف قبل محاولة رفع تفشل برسالة تخزين غامضة.
 */
const TARGETS = {
  'company-documents': { allow: ['pdf', 'png', 'jpeg'], maxBytes: 21 * 1024 * 1024 },
  'report-documents': { allow: ['pdf', 'png', 'jpeg', 'webp'], maxBytes: 10 * 1024 * 1024 },
  'support-attachments': { allow: ['pdf', 'png', 'jpeg', 'webp'], maxBytes: 10 * 1024 * 1024 },
}

const MIME = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const EXT = { pdf: 'pdf', png: 'png', jpeg: 'jpg', webp: 'webp' }

/** مسار تخزين مقبول: بلا صعود، بلا جذر، بلا محارف تحكّم. */
const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9/_.-]{0,300}$/

const fail = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra })

export default async function handler (req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return fail(res, 405, 'الطريقة غير مسموحة')

  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !ANON_KEY && 'SUPABASE_ANON_KEY',
    !CLERK_SECRET && 'CLERK_SECRET_KEY',
  ].filter(Boolean)
  if (missing.length) {
    return fail(res, 500, `الخادم غير مُهيّأ — ينقص: ${missing.join('، ')}`, { missingEnvVars: missing })
  }

  // --- من يسأل ---------------------------------------------------------------
  const authz = req.headers.authorization || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
  if (!token) return fail(res, 401, 'غير مصرّح')

  let callerId
  try {
    callerId = (await verifyToken(token, { secretKey: CLERK_SECRET })).sub
  } catch (err) {
    const why = String(err?.reason || err?.message || 'سبب غير معروف')
    console.error('scan-document — token verification failed:', {
      reason: err?.reason || null, keyKind: clerkKeyKind(process.env.CLERK_SECRET_KEY),
    })
    return fail(res, 401,
      /expired/i.test(why) ? 'انتهت صلاحية الجلسة — أعد تحميل الصفحة'
        : /issuer|instance|kid|key/i.test(why) ? 'مفتاح Clerk على الخادم لا يطابق الذي أصدر الجلسة'
          : 'جلسة غير صالحة — أعد تسجيل الدخول')
  }

  // الفحص يقرأ ملفاً ويفكّ ضغطه — عملٌ مكلف يستحقّ حدّاً.
  // \u200ElimitOrReject\u200E يردّ ٤٢٩ بنفسه ويُرجع true — فالردّ أُرسل، ولا يُرسل غيره.
  if (await limitOrReject(res, callerId, 'scan_document', { limit: 120, window: '1 hour' })) return

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const quarantinePath = String(body.quarantinePath || '')
  const targetBucket = String(body.targetBucket || '')
  const targetPath = String(body.targetPath || '')
  const declaredMime = body.declaredMime ? String(body.declaredMime) : null

  // --- ما يُقبل شكلاً قبل لمس التخزين ----------------------------------------
  if (!TARGETS[targetBucket]) return fail(res, 400, 'وجهة غير معروفة')
  if (!SAFE_PATH.test(quarantinePath)) return fail(res, 400, 'مسار الحجر غير صالح')
  if (!SAFE_PATH.test(targetPath)) return fail(res, 400, 'مسار الوجهة غير صالح')

  // مجلّد الحجر باسم صاحبه. بلا هذا يستطيع أيٌّ أن يطلب فحص — ثم ترقية — ملفٍ
  // رفعه غيره، وهي ترقيةٌ بمفتاح خدمة إلى دلو دائم.
  if (quarantinePath.split('/')[0] !== callerId) {
    return fail(res, 403, 'هذا الملف ليس لك')
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // العميل بهويّة الطالب: كل سياسة RLS تنطبق كما تنطبق اليوم بلا بوّابة.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    accessToken: async () => token,
  })

  const target = TARGETS[targetBucket]
  let scanId = null

  try {
    // --- ١) إحضار الملف من الحجر --------------------------------------------
    const { data: blob, error: dlErr } = await svc.storage.from(QUARANTINE).download(quarantinePath)
    if (dlErr || !blob) return fail(res, 404, 'لم يُعثر على الملف في الحجر')
    const bytes = Buffer.from(await blob.arrayBuffer())

    const digest = sha256(bytes)

    // --- ٢) قيد أوّلي: وصل، ولم يُحكم عليه بعد ------------------------------
    const { data: row, error: insErr } = await svc.from('file_scans').insert({
      sha256: digest,
      quarantine_path: quarantinePath,
      target_bucket: targetBucket,
      target_path: targetPath,
      declared_mime: declaredMime,
      size_bytes: bytes.length,
      scanner_version: SCANNER_VERSION,
      actor: callerId,
      verdict: 'pending',
    }).select('id').single()
    if (insErr) throw insErr
    scanId = row.id

    // --- ٣) ذاكرة البوّابة: ما رُفض من قبل لا يُعاد فحصه ---------------------
    const { data: prior } = await svc.rpc('file_hash_verdict', { p_sha256: digest })
    const priorRow = Array.isArray(prior) ? prior[0] : prior
    if (priorRow) {
      await settle(svc, scanId, 'rejected', ['previously_rejected', ...(priorRow.reasons || [])])
      await svc.storage.from(QUARANTINE).remove([quarantinePath])
      return rejected(res, ['previously_rejected'])
    }

    // --- ٤) الفحص ------------------------------------------------------------
    const verdict = scanFile(bytes, {
      declaredMime,
      allow: target.allow,
      maxBytes: target.maxBytes,
    })

    if (verdict.verdict !== 'clean') {
      await settle(svc, scanId, 'rejected', verdict.reasons, verdict.detectedType)
      await svc.storage.from(QUARANTINE).remove([quarantinePath])
      return rejected(res, verdict.reasons)
    }

    // --- ٥) الترقية، بهويّة الطالب ------------------------------------------
    // ما يُرفع هو المخرَج المُعقَّم متى وُجد، لا ما وصل. والنوع من المحتوى لا
    // من ادّعاء المُرسِل.
    const out = verdict.sanitized?.bytes || bytes
    const finalPath = withExtension(targetPath, verdict.detectedType)

    // الحكم يُكتب **قبل** الرفع، لا بعده. وذلك عمداً: صفُّ `clean` بهذا
    // المسار وهذا الفاعل هو تصريح الرفع نفسه — سياسة الدلو تشترط وجوده
    // (راجع migration 180). فلو كُتب بعد الرفع لَما وجدت السياسةُ ما تتحقّق
    // منه، ولَوَجب فتح الدلو للكتابة المباشرة، وهو ما يُلغي البوّابة.
    //
    // وصفُّ `clean` بلا رفعٍ تالٍ لا يضرّ: تصريحٌ لم يُستعمل، وعمره عشر دقائق.
    await settle(svc, scanId, 'clean', [], verdict.detectedType, finalPath)

    const { error: upErr } = await asUser.storage.from(targetBucket).upload(finalPath, out, {
      contentType: MIME[verdict.detectedType],
      upsert: false,
    })

    if (upErr) {
      // RLS رفضت ⇒ الطالب غير مخوّل لهذا المسار. لا يُرقّى، والملف يُحذف من
      // الحجر: لا شيء يُكسب بإبقائه.
      const denied = /row-level security|not authorized|violates/i.test(upErr.message || '')
      await settle(svc, scanId, denied ? 'rejected' : 'error',
        [denied ? 'type_not_allowed' : 'upload_failed'], verdict.detectedType)
      if (denied) {
        await svc.storage.from(QUARANTINE).remove([quarantinePath])
        return fail(res, 403, 'غير مصرّح بالكتابة في هذا الموضع')
      }
      // فشلٌ غير تصريحي: الملف يبقى في الحجر ليُعاد.
      console.error('scan-document — upload failed', upErr)
      return fail(res, 502, 'تعذّر حفظ الملف — أعد المحاولة')
    }

    await svc.storage.from(QUARANTINE).remove([quarantinePath])

    return res.status(200).json({
      ok: true,
      path: finalPath,
      bucket: targetBucket,
      detectedType: verdict.detectedType,
      sha256: digest,
      sanitized: verdict.sanitized?.method || null,
      size: out.length,
    })
  } catch (err) {
    // الفشل مُغلَق: لا حذف من الحجر، ولا ترقية.
    console.error('scan-document', err)
    if (scanId) {
      try {
        await svc.from('file_scans').update({
          verdict: 'error',
          reasons: JSON.stringify(['scan_exception']),
          scanned_at: new Date().toISOString(),
        }).eq('id', scanId)
      } catch { /* السجلّ ثانوي — لا يُخفي الخطأ الأصلي */ }
    }
    return fail(res, 500, 'تعذّر فحص الملف — لم يُحفظ')
  }
}

/** يكتب الحكم النهائي. المشغّل يتولّى قيد التدقيق عند الرفض. */
async function settle (svc, id, verdict, reasons, detectedType = null, targetPath = undefined) {
  const patch = {
    verdict,
    reasons,
    detected_type: detectedType,
    scanned_at: new Date().toISOString(),
  }
  if (targetPath !== undefined) patch.target_path = targetPath
  const { error } = await svc.from('file_scans').update(patch).eq('id', id)
  if (error) console.error('scan-document — settle failed', error)
}

/** ٤٢٢: الملف مفهوم وغير مقبول. الأسباب بالعربية لأنها تُعرض كما هي. */
function rejected (res, reasons) {
  return res.status(422).json({
    error: 'الملف مرفوض',
    reasons,
    messages: reasons.map(reasonLabel),
  })
}

/** يُصحّح الامتداد ليطابق المحتوى — لا اسم أرسله المتصفّح. */
function withExtension (path, type) {
  const want = EXT[type]
  if (!want) return path
  return `${path.replace(/\.[A-Za-z0-9]{1,8}$/, '')}.${want}`
}
