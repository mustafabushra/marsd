/**
 * نغمة قصيرة عند وصول إشعار.
 *
 * ============================================================================
 * لماذا لا يوجد ملف صوت
 * ============================================================================
 * مولّدة بـ Web Audio لا مقروءة من mp3. ملف الصوت أصلٌ إضافي يُحمَّل، ويمكن
 * أن يفشل تحميله فيصمت الإشعار دون أن يعرف أحد، ويحتاج شبكة في لحظة قد لا
 * تكون فيها. النغمة هنا نغمتان جيبيتان تُبنيان في المتصفح: لا طلب، ولا شيء
 * ينقص من الحزمة، ولا شيء يمكن أن يعود 404.
 *
 * ============================================================================
 * سياسة التشغيل التلقائي
 * ============================================================================
 * المتصفح يرفض تشغيل صوت قبل أن يتفاعل المستخدم مع الصفحة، ويترك السياق
 * 'suspended'. لا يُعالَج هذا بمحاولة أعلى صوتاً — يُحاوَل الاستئناف، وإن
 * رفض المتصفح تُبتلع النتيجة بصمت. إشعار بلا صوت أفضل من خطأ في وحدة التحكم
 * عند كل إشعار.
 *
 * السياق يُنشأ عند أول تشغيل لا عند تحميل الوحدة: AudioContext يُنشأ مع كل
 * صفحة سيكون موردًا مفتوحًا لا يستعمله أحد.
 */

let ctx = null

const makeCtx = () => {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  ctx = ctx || new Ctor()
  return ctx
}

/**
 * فكّ قفل الصوت عند أول تفاعل، مرة واحدة.
 *
 * هذا هو ما كان ناقصاً. المتصفح ينشئ AudioContext معلّقاً ما لم يكن هناك
 * تفاعل سابق، واستئنافه من داخل حدث realtime — أي خارج أي تفاعل — يُرفض
 * صامتاً. فالإشعار يصل والنغمة تُطلَب ولا يُسمع شيء.
 *
 * العلاج أن يُستأنف السياق داخل معالج تفاعل حقيقي: أول ضغطة أو مفتاح في
 * الصفحة، أيّاً كان موضعها. بعدها يبقى السياق 'running' ويعمل التشغيل من أي
 * مكان، بما فيه حدث قادم من الشبكة.
 *
 * المستمعان يُنزعان عند **النجاح** لا عند أول نداء. `once: true` كان ينزعهما
 * بعد أول ضغطة أيّاً كانت نتيجتها — فإن رفض المتصفح الاستئناف في تلك اللحظة
 * لم تبقَ فرصة ثانية، وصمت الصوت إلى الأبد. وكان نزع «pointerdown» يترك
 * «keydown» معلّقاً على النافذة.
 *
 * والدالة غير ضارّة إن نوديت مرّات: الجرس موجود في لوحتين، وكل انتقال بينهما
 * يُعيد تركيبه.
 */
let armed = false
let listening = false

export function armAudio () {
  if (armed || listening) return

  const cleanup = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    listening = false
  }

  async function unlock () {
    const c = makeCtx()
    if (!c) { cleanup(); return }        // لا Web Audio أصلاً — لا فائدة من الانتظار
    if (c.state === 'suspended') {
      try { await c.resume() } catch { /* رفض المتصفح — تُترك فرصة أخرى */ }
    }
    // يُنزع المستمعان فقط بعد أن يصير السياق قابلاً للتشغيل. وإلا يُترَكان
    // للضغطة التالية.
    if (c.state === 'running') { armed = true; cleanup() }
  }

  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  listening = true
}

/** هل السياق جاهز فعلاً؟ للتشخيص من وحدة التحكم عند الحاجة. */
export const audioReady = () => !!ctx && ctx.state === 'running'

/** ثانية ونصف من الصمت خير من نغمتين متتاليتين على دفعة إشعارات واحدة. */
let lastAt = 0
const MIN_GAP_MS = 1500

export async function playChime () {
  const now = Date.now()
  if (now - lastAt < MIN_GAP_MS) return false

  try {
    if (!makeCtx()) return false

    // مُعلَّق حتى يتفاعل المستخدم — تُحاوَل مرة، ولا يُصرَخ إن رُفضت.
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch { /* سياسة المتصفح */ }
    }
    // المهلة تُسجَّل عند التشغيل الفعلي لا عند المحاولة. تسجيلها قبل ذلك كان
    // يجعل محاولةً فاشلة تكتم النغمة التالية بعدها مباشرة.
    if (ctx.state !== 'running') return false
    lastAt = now

    const t0 = ctx.currentTime

    // نغمتان صاعدتان قصيرتان — تُسمع كإشعار لا كإنذار. الذروة 0.14 لأن هذا
    // صوت يتكرّر طول اليوم في مكتب، والصوت الذي يُزعج يُكتَم في أول أسبوع
    // ثم لا يُسمع في اليوم الذي يهمّ.
    for (const [freq, at] of [[880, 0], [1174.7, 0.11]]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)

      // منحنى أسّي — الخطّي يُسمع طقطقة عند البداية والنهاية.
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.26)

      osc.start(t0 + at)
      osc.stop(t0 + at + 0.28)
    }
    return true
  } catch {
    return false
  }
}

/**
 * تشغيل الصوت مسموح؟
 *
 * الافتراض «نعم» — الميزة مطلوبة لتُسمع. والاختيار يُحفظ لأن صوتاً لا يُكتَم
 * يُغلَق بإغلاق التبويب.
 */
const KEY = 'marsad.notifSound'

export const soundOn = () => {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export const setSoundOn = (on) => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* وضع خاص */ }
}
