/**
 * الطريق الوحيد الذي يصل به ملف إلى تخزين مرصد.
 *
 * ============================================================================
 * لماذا خطوتان لا واحدة
 * ============================================================================
 * الملف يُرفع أولاً إلى دلو الحجر، ثم تُنادى البوّابة بمساره. ولا يبلغ دلواً
 * دائماً إلا بحكمٍ من الخادم.
 *
 * والسبب أن دالة Vercel تقبل ٤٫٥ م.ب في جسم الطلب، ومستندات مرصد تبلغ ٢١.
 * فالملف لا يمرّ عبر الدالة — تُنزّله الدالة من التخزين، وهو اتصال خادم بخادم
 * لا يحدّه ذلك السقف.
 *
 * ============================================================================
 * ما يفعله الفحص في المتصفّح هنا
 * ============================================================================
 * لا شيء أمنياً. هو مجاملةٌ تقول للمستخدم مبكراً إن ملفه لن يُقبل، بدل أن
 * يرفع عشرين ميغابايت ثم يُردّ. ومن يتجاوز الواجهة يتجاوزه — والحكم الفعلي
 * في `api/scan-document.js` وحده.
 */

import { getSupabase } from './api'
import { inspectFile, safeStorageName } from './fileSafety'

const QUARANTINE = 'quarantine'

/** ما يقبله كل دلو — نسخةٌ من جدول البوّابة، للرفض المبكر لا للحكم. */
const TARGET_LIMITS = {
  'company-documents': { allow: ['application/pdf', 'image/png', 'image/jpeg'], maxBytes: 21 * 1024 * 1024 },
  'report-documents': { allow: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
  'support-attachments': { allow: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
}

const clerk = () => (globalThis).Clerk

/**
 * يرفع ملفاً عبر بوّابة الفحص.
 *
 * @param {File} file
 * @param {{ targetBucket: string, targetPath: string }} opts
 * @returns {Promise<{ path: string, sha256: string, sanitized: string|null }>}
 *
 * يرمي خطأً برسالة عربية جاهزة للعرض. والرسالة تقول **لماذا** رُفض: «الملف
 * مرفوض» وحدها تجعل صاحب مستند سليم يعيد المحاولة بلا فهم.
 */
export async function uploadViaGateway (file, { targetBucket, targetPath }) {
  const limits = TARGET_LIMITS[targetBucket]
  if (!limits) throw new Error('وجهة غير معروفة')

  const session = clerk()?.session
  const userId = clerk()?.user?.id
  if (!session || !userId) throw new Error('انتهت الجلسة — أعد تحميل الصفحة')

  // فحصٌ مبكر: يوفّر رفع ملف سيُردّ.
  const early = await inspectFile(file, { maxBytes: limits.maxBytes, allow: limits.allow })
  if (!early.ok) throw new Error(early.reason)

  const sb = getSupabase()
  const qPath = `${userId}/${safeStorageName(early.ext)}`

  const { error: upErr } = await sb.storage.from(QUARANTINE)
    .upload(qPath, file, { contentType: file.type || undefined, upsert: false })
  if (upErr) throw new Error('تعذّر رفع الملف — أعد المحاولة')

  const token = await session.getToken()
  const res = await fetch('/api/scan-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quarantinePath: qPath,
      targetBucket,
      targetPath,
      declaredMime: file.type || null,
    }),
  })

  let body = null
  try { body = await res.json() } catch { /* ردٌّ بلا JSON */ }

  if (!res.ok) {
    // ٤٢٢: مفهومٌ وغير مقبول — والأسباب تُعرض كما هي.
    const why = Array.isArray(body?.messages) && body.messages.length
      ? body.messages.join(' · ')
      : (body?.error || 'تعذّر فحص الملف')
    throw new Error(why)
  }

  return { path: body.path, sha256: body.sha256, sanitized: body.sanitized || null }
}
