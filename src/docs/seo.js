/**
 * وسوم الصفحة في تطبيق أحادي الصفحة.
 *
 * ============================================================================
 * ما يستطيعه هذا وما لا يستطيعه — بصراحة
 * ============================================================================
 * المشروع Vite SPA: `index.html` واحد لكل المسارات، ولا عرض على الخادم. فما
 * يُنفَّذ هنا تحديثُ الوسوم بعد التحميل.
 *
 * وأثره:
 *   محرّكات تُنفّذ JavaScript (Google وBing) ترى العنوان والوصف الصحيحين.
 *   زوّار الروابط الاجتماعية (WhatsApp، X، LinkedIn) **لا يرونها** — فهي
 *   تقرأ HTML الأوّلي ولا تُنفّذ سكربتاً.
 *
 * فالبطاقة الاجتماعية لكل صفحة توثيق تعرض وصف مرصد العامّ. وهذا حدٌّ بنيوي لا
 * يُغلق إلا بعرضٍ مسبق (prerender) أو انتقال إلى إطار يُصيّر على الخادم —
 * وكلاهما تغيير في بنية التطبيق كلّه، لا في التوثيق.
 */

const SITE = 'https://marsd-peach.vercel.app'

const upsert = (selector, make) => {
  let el = document.head.querySelector(selector)
  if (!el) { el = make(); document.head.appendChild(el) }
  return el
}

const setMeta = (attr, key, content) => {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta')
    m.setAttribute(attr, key)
    return m
  })
  el.setAttribute('content', content)
}

/** يضبط وسوم صفحة توثيق، ويعيد الوثيقة إلى لغتها واتجاهها. */
export function setDocMeta ({ title, description, slug, lang }) {
  const full = `${title} — مرصد DOC`
  const desc = description || 'توثيق منصّة مرصد: الشركات والمستندات والأمن والواجهة البرمجية.'
  const url = `${SITE}${lang === 'en' ? `/docs/en/${slug}` : `/docs/${slug}`}`

  document.title = full
  setMeta('name', 'description', desc)

  const canon = upsert('link[rel="canonical"]', () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'canonical')
    return l
  })
  canon.setAttribute('href', url)

  setMeta('property', 'og:title', full)
  setMeta('property', 'og:description', desc)
  setMeta('property', 'og:url', url)
  setMeta('property', 'og:type', 'article')
  setMeta('property', 'og:site_name', 'مرصد')
  setMeta('name', 'twitter:card', 'summary')
  setMeta('name', 'twitter:title', full)
  setMeta('name', 'twitter:description', desc)

  // نسخة اللغة الأخرى — تُخبر المحرّك أنهما الصفحة نفسها بلغتين.
  const alt = lang === 'en' ? `${SITE}/docs/${slug}` : `${SITE}/docs/en/${slug}`
  const altEl = upsert(`link[rel="alternate"][hreflang="${lang === 'en' ? 'ar' : 'en'}"]`, () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'alternate')
    l.setAttribute('hreflang', lang === 'en' ? 'ar' : 'en')
    return l
  })
  altEl.setAttribute('href', alt)

  document.documentElement.lang = lang === 'en' ? 'en' : 'ar'
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl'
}

/** يُعيد ما غيّرته صفحة التوثيق حين يخرج القارئ منها. */
export function restoreSiteMeta () {
  document.documentElement.lang = 'ar'
  document.documentElement.dir = 'rtl'
  document.title = 'مرصد — منصة تقييم موثوقية الأعمال'
}
