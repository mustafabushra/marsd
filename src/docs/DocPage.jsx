import { useState, useEffect, Suspense, lazy, useMemo } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import { DOC } from './tokens'
import { mdxComponents } from './mdxComponents'
import { neighbours, groupOf, pageAt, hrefFor, HOME_SLUG } from './nav'
import { useDocLang } from './DocLangContext'
import { setDocMeta } from './seo'

/**
 * صفحة توثيق واحدة.
 *
 * ============================================================================
 * كيف يُعثر على المحتوى
 * ============================================================================
 * `import.meta.glob` يُحوّل كل ملفّ .mdx إلى استيراد كسول عند البناء. فالنتيجة
 * أن كل صفحة تصير حزمة مستقلّة تُنزَّل عند فتحها، لا جزءاً من حزمة واحدة تكبر
 * مع كل صفحة تُضاف. وهذا ما يجعل «مئات الصفحات» ممكنة بلا أن يبطؤ أوّل تحميل.
 *
 * والمفتاح هو المسار، فاسم الملف هو العنوان — لا خريطة بينهما تُنسى.
 *
 * ============================================================================
 * لماذا لا توليد ثابت
 * ============================================================================
 * المشروع Vite SPA لا Next.js: لا Server Components ولا SSG. والمُتاح فعلاً —
 * وهو ما يُنفَّذ هنا — أن يُترجَم MDX **وقت البناء** إلى وحدات JavaScript
 * ثابتة. فلا تحليل Markdown في المتصفّح، ولا جلب محتوى بعد التحميل: الصفحة
 * وحدةٌ مُترجَمة تُنزَّل وتُعرض.
 */

const PAGES = import.meta.glob('/content/docs/*/**/*.mdx')

const cache = new Map()
function loadPage (lang, slug) {
  const key = `/content/docs/${lang}/${slug}.mdx`
  if (!PAGES[key]) return null
  if (!cache.has(key)) {
    cache.set(key, {
      Component: lazy(() => PAGES[key]().then((m) => ({ default: m.default }))),
      meta: PAGES[key]().then((m) => m.meta || {}),
    })
  }
  return cache.get(key)
}

export const hasPage = (lang, slug) => Boolean(PAGES[`/content/docs/${lang}/${slug}.mdx`])

export default function DocPage ({ onTocChange }) {
  const lang = useDocLang()
  const params = useParams()
  const slug = params['*'] || HOME_SLUG

  const entry = useMemo(() => loadPage(lang, slug), [lang, slug])
  const [meta, setMeta] = useState({})

  useEffect(() => {
    let alive = true
    if (!entry) return undefined
    entry.meta.then((m) => { if (alive) setMeta(m) })
    return () => { alive = false }
  }, [entry])

  const nav = pageAt(slug)
  const title = meta.title || nav?.title?.[lang] || nav?.title?.ar || slug

  useEffect(() => {
    if (!nav) return
    setDocMeta({ title, description: meta.description, slug, lang })
  }, [title, meta.description, slug, lang, nav])

  // فهرس الصفحة يُقرأ من المعروض لا من المصدر: ما يظهر في الفهرس هو ما في
  // الصفحة بالضبط، فلا يُشير إلى عنوان حُذف ولا يُغفل عنواناً أُضيف.
  useEffect(() => {
    if (!onTocChange) return undefined
    const read = () => {
      const nodes = document.querySelectorAll('#doc-article h2[id], #doc-article h3[id]')
      onTocChange([...nodes].map((n) => ({
        id: n.id, text: n.textContent || '', depth: n.tagName === 'H3' ? 3 : 2,
      })))
    }
    const t = setTimeout(read, 60)
    return () => { clearTimeout(t); onTocChange([]) }
  }, [slug, lang, onTocChange, entry])

  // صفحة غير موجودة بلغة ما: يُعرض بديلها العربي بإشعار، لا 404. ترجمةٌ
  // ناقصة ليست صفحة مفقودة — وإرسال القارئ إلى لا شيء أسوأ من لغة غير لغته.
  if (!entry) {
    if (lang === 'en' && hasPage('ar', slug)) return <Untranslated slug={slug} />
    if (!nav) return <Navigate to={hrefFor(HOME_SLUG, lang)} replace />
    return <Missing slug={slug} lang={lang} />
  }

  const { prev, next } = neighbours(slug)
  const group = groupOf(slug)
  const { Component } = entry

  return (
    <article id="doc-article">
      <Breadcrumb group={group} title={title} lang={lang} />

      <h1 style={{
        fontSize: DOC.text.h1, fontWeight: 900, color: DOC.ink,
        lineHeight: 1.35, margin: '0 0 8px',
      }}>{title}</h1>

      {meta.description && (
        <p style={{
          fontSize: '16px', color: DOC.muted, lineHeight: 1.85, margin: '0 0 6px',
        }}>{meta.description}</p>
      )}

      {meta.updated && (
        <div style={{ fontSize: '12px', color: DOC.faint, marginBottom: '22px' }}>
          آخر تحديث: {meta.updated}
        </div>
      )}

      <Suspense fallback={<PageSkeleton />}>
        <MDXProvider components={mdxComponents}>
          <Component components={mdxComponents} />
        </MDXProvider>
      </Suspense>

      {Array.isArray(meta.related) && meta.related.length > 0 && (
        <RelatedPages items={meta.related} lang={lang} />
      )}

      <PrevNext prev={prev} next={next} lang={lang} />
    </article>
  )
}

function Breadcrumb ({ group, title, lang }) {
  return (
    <nav aria-label="مسار التنقّل" style={{ marginBottom: '12px' }}>
      <ol style={{
        listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: '7px', margin: 0, padding: 0, fontSize: '12.5px', color: DOC.faint,
      }}>
        <li>
          <Link to={hrefFor(HOME_SLUG, lang)} style={{ color: DOC.muted, textDecoration: 'none', fontWeight: 700 }}>
            مرصد DOC
          </Link>
        </li>
        {group && (
          <>
            <li aria-hidden="true">/</li>
            <li style={{ fontWeight: 700 }}>{group.title[lang] || group.title.ar}</li>
          </>
        )}
        <li aria-hidden="true">/</li>
        <li aria-current="page" style={{ color: DOC.body, fontWeight: 700 }}>{title}</li>
      </ol>
    </nav>
  )
}

function RelatedPages ({ items, lang }) {
  const rows = items.map((s) => pageAt(s)).filter(Boolean)
  if (!rows.length) return null
  return (
    <section aria-labelledby="related-h" style={{ marginTop: '38px' }}>
      <h2 id="related-h" style={{
        fontSize: '15px', fontWeight: 800, color: DOC.ink, margin: '0 0 11px',
      }}>صفحات ذات صلة</h2>
      <div style={{ display: 'grid', gap: '8px' }}>
        {rows.map((r) => (
          <Link key={r.slug} to={hrefFor(r.slug, lang)} style={{
            display: 'block', padding: '11px 14px', textDecoration: 'none',
            border: `1px solid ${DOC.border}`, borderRadius: '10px',
            fontSize: '13.5px', fontWeight: 700, color: DOC.brand, background: DOC.rail,
          }}>
            {r.title[lang] || r.title.ar}
            <span style={{ color: DOC.faint, fontWeight: 600, marginInlineStart: '7px', fontSize: '12px' }}>
              {r.groupTitle[lang] || r.groupTitle.ar}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function PrevNext ({ prev, next, lang }) {
  if (!prev && !next) return null
  const box = {
    flex: 1, minWidth: '180px', padding: '13px 15px', textDecoration: 'none',
    border: `1px solid ${DOC.border}`, borderRadius: '11px', background: DOC.bg,
  }
  return (
    <nav aria-label="التنقّل بين الصفحات" style={{
      display: 'flex', gap: '11px', flexWrap: 'wrap',
      marginTop: '40px', paddingTop: '22px', borderTop: `1px solid ${DOC.border}`,
    }}>
      {prev && (
        <Link to={hrefFor(prev.slug, lang)} style={box}>
          <div style={{ fontSize: '11.5px', color: DOC.faint, fontWeight: 700, marginBottom: '3px' }}>السابق</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: DOC.brand }}>
            {prev.title[lang] || prev.title.ar}
          </div>
        </Link>
      )}
      {next && (
        <Link to={hrefFor(next.slug, lang)} style={{ ...box, textAlign: 'end' }}>
          <div style={{ fontSize: '11.5px', color: DOC.faint, fontWeight: 700, marginBottom: '3px' }}>التالي</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: DOC.brand }}>
            {next.title[lang] || next.title.ar}
          </div>
        </Link>
      )}
    </nav>
  )
}

function PageSkeleton () {
  const bar = (w) => (
    <div style={{
      height: '13px', width: w, background: DOC.subtle,
      borderRadius: '6px', marginBottom: '11px',
    }} />
  )
  return <div aria-hidden="true" style={{ marginTop: '20px' }}>{bar('92%')}{bar('86%')}{bar('70%')}</div>
}

function Untranslated ({ slug }) {
  return (
    <article id="doc-article">
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px',
        padding: '18px 20px', margin: '10px 0 20px',
      }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#92400E', marginBottom: '6px' }}>
          Not translated yet
        </div>
        <p style={{ fontSize: '14px', color: '#92400E', lineHeight: 1.9, margin: '0 0 12px' }}>
          This page exists in Arabic only for now. The Arabic version is complete
          and kept in sync with the implementation.
        </p>
        <Link to={`/docs/${slug}`} style={{
          display: 'inline-block', background: DOC.brand, color: '#fff',
          borderRadius: '9px', padding: '8px 16px', fontSize: '13.5px',
          fontWeight: 800, textDecoration: 'none',
        }}>
          اقرأ النسخة العربية
        </Link>
      </div>
    </article>
  )
}

function Missing ({ slug, lang }) {
  return (
    <article id="doc-article">
      <h1 style={{ fontSize: DOC.text.h1, fontWeight: 900, color: DOC.ink, margin: '0 0 10px' }}>
        هذه الصفحة لم تُكتب بعد
      </h1>
      <p style={{ fontSize: DOC.text.size, color: DOC.body, lineHeight: DOC.text.line }}>
        القسم مُدرَج في الشريط الجانبي وملفّه لم يُنشأ. وهذا مقصود: الشجرة تُظهر
        ما هو مخطَّط، والصفحة تقول صراحةً إنها فارغة بدل أن تعرض محتوى مُختلَقاً.
      </p>
      <code dir="ltr" style={{
        display: 'inline-block', marginTop: '10px', fontSize: '12.5px',
        fontFamily: DOC.text.mono, color: DOC.muted, background: DOC.subtle,
        border: `1px solid ${DOC.border}`, padding: '5px 10px', borderRadius: '7px',
      }}>content/docs/{lang}/{slug}.mdx</code>
    </article>
  )
}
