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

/** ثانيتان من الصمت خير من نغمتين متتاليتين على دفعة إشعارات واحدة. */
let lastAt = 0
const MIN_GAP_MS = 1500

export async function playChime () {
  const now = Date.now()
  if (now - lastAt < MIN_GAP_MS) return false
  lastAt = now

  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return false
    ctx = ctx || new Ctor()

    // مُعلَّق حتى يتفاعل المستخدم — تُحاوَل مرة، ولا يُصرَخ إن رُفضت.
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch { /* سياسة المتصفح */ }
    }
    if (ctx.state !== 'running') return false

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
