import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { DOC } from './tokens'
import { NAV, hrefFor } from './nav'
import { useDocLang } from './DocLangContext'

/**
 * هيكل DOC: ترويسة، وشريط جانبي، ومحتوى، وفهرس الصفحة.
 *
 * ============================================================================
 * ثلاثة أعمدة تنهار إلى واحد
 * ============================================================================
 * سطح المكتب: شريط | محتوى | فهرس.
 * اللوحي:      محتوى + فهرس، والشريط يُطوى خلف زرّ.
 * الهاتف:      محتوى وحده، والشريط والفهرس في درج.
 *
 * والانهيار بـ`window.matchMedia` لا بأنماط CSS: المشروع بلا ورقة أنماط
 * للمكوّنات، والأنماط الضمنيّة لا تعرف استعلامات الوسائط. فالقياس في
 * JavaScript، وهو ما يفعله باقي المشروع.
 *
 * ============================================================================
 * تخطّي إلى المحتوى
 * ============================================================================
 * الشريط الجانبي عشرات الروابط. ومن يتنقّل بلوحة المفاتيح يمرّ عليها كلّها
 * قبل أن يبلغ المقال في كل صفحة يفتحها. فرابط التخطّي أوّل ما يستقبل التركيز.
 */

const useBreakpoint = () => {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1400 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return { mobile: w < 900, tablet: w >= 900 && w < 1240, desktop: w >= 1240 }
}

export default function DocsShell ({ children, toc = [], onOpenSearch }) {
  const lang = useDocLang()
  const { mobile, tablet } = useBreakpoint()
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()

  useEffect(() => { setDrawer(false) }, [location.pathname])

  const showSidebar = !mobile && !tablet
  const showToc = !mobile && !tablet && toc.length > 0

  return (
    <div style={{ minHeight: '100vh', background: DOC.bg }}>
      <a href="#doc-main" style={{
        position: 'absolute', insetInlineStart: '-9999px', top: 0, zIndex: 100,
        background: DOC.brand, color: '#fff', padding: '10px 16px',
        borderRadius: '0 0 10px 0', fontSize: '13.5px', fontWeight: 800,
      }}
         onFocus={(e) => { e.target.style.insetInlineStart = '0' }}
         onBlur={(e) => { e.target.style.insetInlineStart = '-9999px' }}>
        تخطَّ إلى المحتوى
      </a>

      <DocsHeader onMenu={() => setDrawer((v) => !v)}
                  showMenu={mobile || tablet}
                  onOpenSearch={onOpenSearch} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: showSidebar
          ? (showToc ? `${DOC.sidebarWidth} minmax(0,1fr) ${DOC.tocWidth}` : `${DOC.sidebarWidth} minmax(0,1fr)`)
          : '1fr',
        maxWidth: '1440px', margin: '0 auto', alignItems: 'start',
      }}>
        {showSidebar && (
          <nav aria-label="أقسام التوثيق" style={{
            position: 'sticky', top: DOC.headerHeight,
            height: `calc(100vh - ${DOC.headerHeight})`, overflowY: 'auto',
            borderInlineEnd: `1px solid ${DOC.border}`, padding: '22px 14px 40px',
            background: DOC.rail,
          }}>
            <SidebarNav />
          </nav>
        )}

        <main id="doc-main" tabIndex={-1} style={{
          padding: mobile ? '20px 16px 60px' : '30px 34px 80px',
          maxWidth: showToc ? 'none' : DOC.readWidth,
          width: '100%', minWidth: 0, justifySelf: showToc ? 'stretch' : 'center',
        }}>
          <div style={{ maxWidth: DOC.readWidth }}>{children}</div>
        </main>

        {showToc && (
          <aside aria-label="في هذه الصفحة" style={{
            position: 'sticky', top: DOC.headerHeight,
            maxHeight: `calc(100vh - ${DOC.headerHeight})`, overflowY: 'auto',
            padding: '30px 18px 40px',
          }}>
            <Toc items={toc} />
          </aside>
        )}
      </div>

      {drawer && (mobile || tablet) && (
        <>
          <div onClick={() => setDrawer(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', zIndex: 45,
          }} />
          <nav aria-label="أقسام التوثيق" style={{
            position: 'fixed', insetBlock: 0, insetInlineStart: 0, zIndex: 46,
            width: 'min(300px, 84vw)', background: DOC.bg, overflowY: 'auto',
            padding: '18px 16px 40px', boxShadow: '0 0 40px rgba(15,23,42,.18)',
          }}>
            <button type="button" onClick={() => setDrawer(false)} aria-label="إغلاق القائمة"
                    style={{
                      background: DOC.subtle, border: `1px solid ${DOC.border}`,
                      borderRadius: '9px', width: '34px', height: '34px',
                      fontSize: '16px', cursor: 'pointer', marginBottom: '14px',
                      fontFamily: 'inherit', color: DOC.muted,
                    }}>✕</button>
            <SidebarNav />
          </nav>
        </>
      )}

      <footer style={{
        borderTop: `1px solid ${DOC.border}`, padding: '22px 20px',
        textAlign: 'center', fontSize: '12.5px', color: DOC.faint,
      }}>
        <Link to={hrefFor('getting-started/introduction', lang)}
              style={{ color: DOC.muted, textDecoration: 'none', fontWeight: 700 }}>
          مرصد DOC
        </Link>
        <span style={{ margin: '0 8px' }}>·</span>
        توثيق منصّة مرصد
      </footer>
    </div>
  )
}

function DocsHeader ({ onMenu, showMenu, onOpenSearch }) {
  const lang = useDocLang()
  const location = useLocation()
  const navigate = useNavigate()

  // تبديل اللغة يُبقي المسار: من يقرأ صفحة الرفع بالعربية يصل إلى صفحة الرفع
  // بالإنجليزية، لا إلى أوّل التوثيق.
  const switchLang = () => {
    const p = location.pathname
    const to = lang === 'en'
      ? p.replace(/^\/docs\/en(\/|$)/, '/docs$1')
      : p.replace(/^\/docs(\/|$)/, '/docs/en$1')
    navigate(to || '/docs')
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(8px)', borderBottom: `1px solid ${DOC.border}`,
      height: DOC.headerHeight, display: 'flex', alignItems: 'center',
      gap: '12px', padding: '0 16px',
    }}>
      {showMenu && (
        <button type="button" onClick={onMenu} aria-label="فتح قائمة الأقسام"
                style={{
                  background: 'transparent', border: `1px solid ${DOC.border}`,
                  borderRadius: '9px', width: '34px', height: '34px',
                  fontSize: '15px', cursor: 'pointer', color: DOC.muted,
                  fontFamily: 'inherit', flex: 'none',
                }}>☰</button>
      )}

      <Link to={hrefFor('getting-started/introduction', lang)} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        textDecoration: 'none', flex: 'none',
      }}>
        <span aria-hidden="true" style={{
          width: '24px', height: '24px', borderRadius: '7px',
          background: 'linear-gradient(to bottom right,#1E2A52,#1F6E43,#16A34A)',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: '15px', fontWeight: 900, color: DOC.ink }}>مرصد</span>
        <span style={{
          fontSize: '11px', fontWeight: 800, color: DOC.brand,
          background: '#EEF2FF', border: '1px solid #C7D2FE',
          borderRadius: '5px', padding: '1px 6px', letterSpacing: '.06em',
        }}>DOC</span>
      </Link>

      <button type="button" onClick={onOpenSearch}
              aria-label="ابحث في التوثيق"
              style={{
                flex: 1, maxWidth: '380px', display: 'flex', alignItems: 'center',
                gap: '8px', background: DOC.subtle, border: `1px solid ${DOC.border}`,
                borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
                color: DOC.faint, fontSize: '13.5px', fontFamily: 'inherit',
                marginInlineStart: '6px',
              }}>
        <span aria-hidden="true">⌕</span>
        <span style={{ flex: 1, textAlign: 'start' }}>ابحث في التوثيق</span>
        <kbd style={{
          fontSize: '11px', fontFamily: DOC.text.mono, color: DOC.faint,
          border: `1px solid ${DOC.border}`, borderRadius: '5px',
          padding: '1px 5px', background: '#fff',
        }}>Ctrl K</kbd>
      </button>

      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={switchLang}
                aria-label={lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
                style={{
                  background: 'transparent', border: `1px solid ${DOC.border}`,
                  borderRadius: '8px', padding: '5px 10px', fontSize: '12.5px',
                  fontWeight: 800, color: DOC.muted, cursor: 'pointer', fontFamily: 'inherit',
                }}>
          {lang === 'en' ? 'ع' : 'EN'}
        </button>
        <Link to="/dashboard" style={{
          background: DOC.brand, color: '#fff', borderRadius: '9px',
          padding: '7px 15px', fontSize: '13px', fontWeight: 800,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          لوحة التحكّم
        </Link>
      </div>
    </header>
  )
}

function SidebarNav () {
  const lang = useDocLang()
  const { pathname } = useLocation()
  return (
    <>
      {NAV.map((g) => (
        <div key={g.id} style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11.5px', fontWeight: 900, color: DOC.faint,
            letterSpacing: '.07em', textTransform: 'uppercase',
            padding: '0 10px', marginBottom: '7px',
          }}>
            {g.title[lang] || g.title.ar}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {g.pages.map((p) => {
              const href = hrefFor(p.slug, lang)
              const active = pathname === href
              return (
                <li key={p.slug}>
                  <Link to={href} aria-current={active ? 'page' : undefined} style={{
                    display: 'block', padding: '6px 10px', borderRadius: '8px',
                    fontSize: '13.5px', textDecoration: 'none', lineHeight: 1.7,
                    fontWeight: active ? 800 : 600,
                    color: active ? DOC.brand : DOC.body,
                    background: active ? '#EEF2FF' : 'transparent',
                  }}>
                    {p.title[lang] || p.title.ar}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}

/**
 * «في هذه الصفحة» — يتتبّع العنوان المرئي.
 *
 * IntersectionObserver لا حساب مواضع عند التمرير: الثاني يعمل في كل إطار
 * ويُثقل التمرير على الهاتف.
 */
function Toc ({ items }) {
  const [active, setActive] = useState('')
  const seen = useRef(new Set())

  useEffect(() => {
    const set = seen.current
    set.clear()
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) set.add(e.target.id)
        else set.delete(e.target.id)
      }
      const first = items.find((i) => set.has(i.id))
      if (first) setActive(first.id)
    }, { rootMargin: '-70px 0px -70% 0px' })

    for (const i of items) {
      const el = document.getElementById(i.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [items])

  if (!items.length) return null
  return (
    <>
      <div style={{
        fontSize: '11.5px', fontWeight: 900, color: DOC.faint,
        letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '9px',
      }}>
        في هذه الصفحة
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} style={{
              display: 'block', paddingBlock: '4px',
              fontSize: '12.5px', lineHeight: 1.75, textDecoration: 'none',
              color: active === i.id ? DOC.brand : DOC.muted,
              fontWeight: active === i.id ? 800 : 600,
              borderInlineStart: `2px solid ${active === i.id ? DOC.brand : 'transparent'}`,
              // العناوين الفرعية تُزاح لتُقرأ الشجرة — قيمة واحدة لا اثنتان.
              paddingInlineStart: i.depth === 3 ? '20px' : '10px',
            }}>
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
