import { Link } from 'react-router-dom'
import { DOC } from './tokens'
import CodeBlock from './components/CodeBlock'
import Callout, { Badge } from './components/Callout'
import DocScreenshot from './components/DocScreenshot'
import Tabs, { Tab } from './components/Tabs'
import Endpoint, { Fields, Statuses } from './components/Endpoint'
import Pipeline from './components/Pipeline'

/**
 * خريطة عناصر Markdown إلى هويّة مرصد.
 *
 * ============================================================================
 * لماذا هنا لا في CSS
 * ============================================================================
 * المشروع كلّه أنماط ضمنيّة بلا Tailwind ولا ملفّات CSS للمكوّنات. وإضافة
 * ورقة أنماط للتوثيق وحده تُدخل نظاماً ثانياً في مشروعٍ نظامه واحد.
 *
 * ============================================================================
 * المعرّفات على العناوين
 * ============================================================================
 * كل h2 و h3 يأخذ `id` مشتقّاً من نصّه، لأمرين: الروابط العميقة، وفهرس
 * «في هذه الصفحة» الذي يقفز إليها. والاشتقاق يجب أن يطابق ما يفعله مُولّد
 * الفهرس حرفاً بحرف — وإلا قفز الفهرس إلى لا شيء. ولذلك الدالة مُصدَّرة
 * ويستوردها المُولّد بدل أن يكتب نظيرتها.
 */

/**
 * نصّ العنوان → معرّف.
 *
 * العربية تُحفظ كما هي: `encodeURIComponent` يجعلها صالحة في الرابط، وحذف
 * غير اللاتيني كان يُنتج معرّفات فارغة لكل عنوان عربي — أي فهرساً بلا وجهات.
 */
export function slugifyHeading (text) {
  return String(text ?? '')
    .trim()
    .replace(/[\s ]+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

const textOf = (node) => {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.props?.children) return textOf(node.props.children)
  return ''
}

const heading = (level) => function Heading ({ children, ...rest }) {
  const Tag = `h${level}`
  const id = slugifyHeading(textOf(children))
  const size = { 1: DOC.text.h1, 2: DOC.text.h2, 3: DOC.text.h3, 4: '15px' }[level]
  return (
    <Tag id={id} {...rest} style={{
      fontSize: size,
      fontWeight: level === 1 ? 900 : 800,
      color: DOC.ink,
      lineHeight: 1.45,
      margin: level === 1 ? '0 0 10px' : level === 2 ? '38px 0 12px' : '26px 0 8px',
      scrollMarginTop: '78px',
      ...(level === 2 ? { paddingTop: '4px', borderTop: `1px solid ${DOC.border}` } : null),
    }}>
      {children}
    </Tag>
  )
}

/** رابطٌ داخلي يمرّ بالموجّه، وخارجي يفتح في تبويب جديد بـrel آمن. */
function Anchor ({ href = '', children, ...rest }) {
  const style = { color: '#1D4ED8', textDecoration: 'none', borderBottom: '1px solid #BFDBFE' }
  const external = /^https?:\/\//i.test(href)
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style} {...rest}>
        {children}
        <span aria-hidden="true" style={{ fontSize: '10px', marginInlineStart: '3px', opacity: 0.7 }}>↗</span>
      </a>
    )
  }
  if (href.startsWith('/')) return <Link to={href} style={style} {...rest}>{children}</Link>
  return <a href={href} style={style} {...rest}>{children}</a>
}

/**
 * ```lang``` → كتلة شيفرة · `code` → شيفرة داخل السطر.
 *
 * MDX يُغلّف الكتلة بـ<pre><code>، فالتمييز بينهما بوجود className اللغة.
 */
function Pre ({ children }) {
  const child = Array.isArray(children) ? children[0] : children
  const cls = child?.props?.className || ''
  const lang = /language-(\w+)/.exec(cls)?.[1] || ''
  return <CodeBlock language={lang}>{child?.props?.children}</CodeBlock>
}

function InlineCode ({ children }) {
  return (
    <code dir="auto" style={{
      background: DOC.subtle, border: `1px solid ${DOC.border}`,
      borderRadius: '5px', padding: '1px 6px',
      fontSize: '13px', fontFamily: DOC.text.mono, color: '#B91C1C',
      unicodeBidi: 'isolate',
    }}>{children}</code>
  )
}

export const mdxComponents = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  p: ({ children, ...r }) => (
    <p {...r} style={{
      fontSize: DOC.text.size, lineHeight: DOC.text.line,
      color: DOC.body, margin: '0 0 15px',
    }}>{children}</p>
  ),
  a: Anchor,
  ul: ({ children, ...r }) => (
    <ul {...r} style={{
      margin: '0 0 15px', paddingInlineStart: '22px',
      fontSize: DOC.text.size, lineHeight: DOC.text.line, color: DOC.body,
    }}>{children}</ul>
  ),
  ol: ({ children, ...r }) => (
    <ol {...r} style={{
      margin: '0 0 15px', paddingInlineStart: '22px',
      fontSize: DOC.text.size, lineHeight: DOC.text.line, color: DOC.body,
    }}>{children}</ol>
  ),
  li: ({ children, ...r }) => <li {...r} style={{ margin: '0 0 6px' }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 800, color: DOC.ink }}>{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote style={{
      margin: '18px 0', padding: '12px 16px',
      borderInlineStart: `3px solid ${DOC.border}`,
      background: DOC.subtle, borderRadius: '0 10px 10px 0',
      color: DOC.muted, fontSize: '14.5px', lineHeight: 1.9,
    }}>{children}</blockquote>
  ),
  hr: () => <hr style={{ border: 0, borderTop: `1px solid ${DOC.border}`, margin: '30px 0' }} />,
  // الجدول داخل حاوية تمرّر أفقياً: جدولٌ عريض يجعل الصفحة كلّها تمرّر على
  // الهاتف، وهو أسوأ من تمرير الجدول وحده.
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '18px 0', border: `1px solid ${DOC.border}`, borderRadius: '11px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '380px' }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: DOC.subtle }}>{children}</thead>,
  th: ({ children, ...r }) => (
    <th {...r} style={{
      textAlign: 'start', padding: '10px 13px', fontWeight: 800,
      color: DOC.ink, borderBottom: `1px solid ${DOC.border}`, whiteSpace: 'nowrap',
    }}>{children}</th>
  ),
  td: ({ children, ...r }) => (
    <td {...r} style={{
      padding: '10px 13px', color: DOC.body, lineHeight: 1.8,
      borderTop: `1px solid ${DOC.border}`, verticalAlign: 'top',
    }}>{children}</td>
  ),
  pre: Pre,
  code: InlineCode,
  img: ({ src, alt }) => <DocScreenshot src={src} alt={alt} />,

  // مكوّنات التوثيق — تُستعمل في MDX بلا استيراد
  Callout,
  Badge,
  DocScreenshot,
  Tabs,
  Tab,
  Endpoint,
  Fields,
  Statuses,
  Pipeline,
}
