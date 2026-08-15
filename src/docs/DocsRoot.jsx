import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import DocsShell from './DocsShell'
import DocPage from './DocPage'
import DocsSearch from './DocsSearch'
import { DocLangContext } from './DocLangContext'
import { restoreSiteMeta } from './seo'

/**
 * جذر DOC — يربط اللغة والهيكل والبحث.
 *
 * ============================================================================
 * اللغة من المسار
 * ============================================================================
 * `/docs/en/...` إنجليزية، وما عداه عربية. والمسار هو المصدر لا حالةٌ في
 * الذاكرة: رابطٌ يُشارَك يفتح باللغة التي كُتب بها، والرجوع بالمتصفّح يعود
 * إلى اللغة الصحيحة.
 *
 * ============================================================================
 * وإعادة الوثيقة إلى حالها عند الخروج
 * ============================================================================
 * صفحة إنجليزية تضبط `dir="ltr"` على الوثيقة كلّها. فالخروج منها إلى التطبيق
 * دون إعادة الضبط يترك مرصد العربي مقلوب الاتجاه — عطلٌ يظهر في شاشة أخرى
 * فيُبحث عن سببه في المكان الخطأ.
 */
export default function DocsRoot () {
  const { pathname } = useLocation()
  const lang = pathname.startsWith('/docs/en') ? 'en' : 'ar'
  const [toc, setToc] = useState([])
  const [search, setSearch] = useState(false)

  const onTocChange = useCallback((items) => setToc(items), [])

  useEffect(() => () => restoreSiteMeta(), [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch((v) => !v)
      }
      // «/» تفتح البحث ما لم يكن التركيز في حقل — وإلا مُنع كتابة المحرف.
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // القفز إلى مرساة بعد أن يُعرض المحتوى: العنوان لا يوجد لحظةَ تغيّر المسار،
  // فالمتصفّح لا يجد ما يقفز إليه ويبقى في أعلى الصفحة.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (!hash) { window.scrollTo(0, 0); return undefined }
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    }, 120)
    return () => clearTimeout(t)
  }, [pathname])

  return (
    <DocLangContext.Provider value={lang}>
      <DocsShell toc={toc} onOpenSearch={() => setSearch(true)}>
        <DocPage onTocChange={onTocChange} />
      </DocsShell>
      <DocsSearch open={search} onClose={() => setSearch(false)} />
    </DocLangContext.Provider>
  )
}
