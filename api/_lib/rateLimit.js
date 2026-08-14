/**
 * حدّ معدّل لدوال الـAPI.
 *
 * العدّ في القاعدة لا في ذاكرة الدالة: نسخة serverless تعيش دقائق، و Vercel
 * يشغّل نسخاً متوازية — فعدّادٌ محلي يبدأ من الصفر مع كل بداية باردة ومع كل
 * نسخة، ويقول إنه يحدّ ولا يحدّ. راجع migration 175.
 *
 * ويُنادى بمفتاح خدمة لأن الدالة محجوبة عن authenticated: مستخدمٌ يستطيع
 * استدعاء عدّاده بنفسه يستطيع استنفاده لغيره أو تخطّيه لنفسه.
 */
import { createClient } from '@supabase/supabase-js'
import { clean } from './secrets.js'

const URL = clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL)
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * يحجز محاولة.
 *
 * يُرجع `{ allowed, remaining, retryAfter }`. وعند تعذّر الفحص نفسه — قاعدة
 * لا تستجيب، أو مفتاح خدمة مفقود — يُسمح بالمرور: حدُّ معدّل يعطّل الخدمة
 * كلّها عند عطبه أسوأ من غيابه، والطبقات الأخرى قائمة.
 */
export async function rateLimit (actor, action, { limit = 10, window = '1 hour' } = {}) {
  if (!URL || !SERVICE || !actor) return { allowed: true, remaining: limit, retryAfter: 0 }
  try {
    const sb = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const { data, error } = await sb.rpc('api_rate_limit', {
      p_actor: String(actor),
      p_action: action,
      p_limit: limit,
      p_window: window,
    })
    if (error) throw error
    return {
      allowed: data?.allowed !== false,
      remaining: data?.remaining ?? 0,
      retryAfter: data?.retry_after_seconds ?? 0,
    }
  } catch (e) {
    console.error('rateLimit check failed — allowing through:', e?.message)
    return { allowed: true, remaining: limit, retryAfter: 0 }
  }
}

/**
 * يردّ 429 مكتملاً، أو يُرجع false إن كان المرور مسموحاً.
 *
 * Retry-After ترويسة قياسية: بدونها يُعيد العميل المحاولة فوراً فيزيد الضغط
 * الذي أوجب الحدّ.
 */
export async function limitOrReject (res, actor, action, opts) {
  const r = await rateLimit(actor, action, opts)
  if (r.allowed) return false
  res.setHeader('Retry-After', String(r.retryAfter))
  res.status(429).json({
    error: `تجاوزت الحدّ المسموح — أعد المحاولة بعد ${Math.ceil(r.retryAfter / 60)} دقيقة`,
    retryAfter: r.retryAfter,
  })
  return true
}
