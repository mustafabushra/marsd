import { useState, useMemo } from 'react'
import { DOC } from '../tokens'

/**
 * كتلة شيفرة بتلوين وزرّ نسخ.
 *
 * ============================================================================
 * لماذا مُلوِّن مكتوب هنا لا مكتبة
 * ============================================================================
 * shiki و prism يزنان مئات الكيلوبايتات ويحملان قواعد مئة لغة. والتوثيق هنا
 * يستعمل خمساً: bash و json و sql و js و http. فمُلوِّنٌ في ثمانين سطراً
 * يُغطّيها ولا يُضيف شيئاً إلى ما يُنزّله القارئ.
 *
 * وهو مُلوِّن **عرض** لا مُحلِّل لغة: يُميّز السلاسل والأرقام والتعليقات
 * والكلمات المحجوزة، ولا يفهم البنية. وهذا كافٍ للقراءة، ولا يُدّعى غيره.
 *
 * ============================================================================
 * والاتجاه
 * ============================================================================
 * الشيفرة \u200Edir="ltr"\u200E دائماً ولو كانت الصفحة عربية. سطرُ \u200Ecurl\u200E في سياق RTL
 * تنقلب أجزاؤه فيصير غير قابل للنسخ ولا للقراءة.
 */

const KEYWORDS = {
  bash: ['curl', 'npm', 'node', 'export', 'cd', 'echo', 'sudo', 'git'],
  json: ['true', 'false', 'null'],
  sql: ['select', 'insert', 'update', 'delete', 'from', 'where', 'and', 'or', 'not',
    'create', 'table', 'alter', 'policy', 'on', 'using', 'check', 'returns', 'begin',
    'end', 'if', 'then', 'null', 'into', 'values', 'set', 'as', 'with'],
  js: ['const', 'let', 'var', 'function', 'return', 'await', 'async', 'import', 'from',
    'export', 'default', 'if', 'else', 'for', 'of', 'new', 'throw', 'try', 'catch', 'null', 'true', 'false'],
  http: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'Authorization', 'Bearer', 'Content-Type'],
}

/** يقسم السطر إلى قطع مُلوَّنة. الترتيب مقصود: التعليق يبتلع بقيّة السطر. */
function tokenize (line, lang) {
  const out = []
  let rest = line
  let guard = 0

  const commentAt = lang === 'sql' ? rest.indexOf('--')
    : (lang === 'js' || lang === 'bash') ? rest.indexOf(lang === 'bash' ? '#' : '//')
      : -1

  let comment = null
  if (commentAt >= 0) {
    // ليس تعليقاً إن كان داخل سلسلة — فحصٌ بسيط يكفي لأمثلة التوثيق.
    const before = rest.slice(0, commentAt)
    const quotes = (before.match(/["']/g) || []).length
    if (quotes % 2 === 0) { comment = rest.slice(commentAt); rest = before }
  }

  const words = KEYWORDS[lang] || []
  while (rest.length && guard < 400) {
    guard += 1
    const m = rest.match(/^("[^"]*"|'[^']*'|`[^`]*`)/)
    if (m) { out.push(['string', m[0]]); rest = rest.slice(m[0].length); continue }
    const n = rest.match(/^\b\d[\d_.]*\b/)
    if (n) { out.push(['number', n[0]]); rest = rest.slice(n[0].length); continue }
    const w = rest.match(/^[A-Za-z_][A-Za-z0-9_-]*/)
    if (w) {
      const isKw = words.some((k) => k.toLowerCase() === w[0].toLowerCase())
      out.push([isKw ? 'keyword' : 'plain', w[0]])
      rest = rest.slice(w[0].length)
      continue
    }
    const p = rest.match(/^[^A-Za-z0-9_"'`]+/)
    if (p) { out.push(['punct', p[0]]); rest = rest.slice(p[0].length); continue }
    out.push(['plain', rest[0]]); rest = rest.slice(1)
  }
  if (comment) out.push(['comment', comment])
  return out
}

const COLOR = (t) => ({
  string: DOC.code.string,
  number: DOC.code.number,
  keyword: DOC.code.keyword,
  comment: DOC.code.comment,
  punct: DOC.code.punct,
  plain: DOC.code.ink,
}[t])

export default function CodeBlock ({ children, language, lines = false, label }) {
  const [copied, setCopied] = useState(false)
  const raw = typeof children === 'string' ? children.replace(/\n$/, '') : String(children ?? '')
  const lang = (language || '').toLowerCase()

  const rows = useMemo(() => raw.split('\n').map((l) => tokenize(l, lang)), [raw, lang])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* الحافظة محجوبة — لا شيء يُقال، الزرّ لا يتغيّر */ }
  }

  return (
    <div style={{
      background: DOC.code.bg, borderRadius: '12px', margin: '18px 0',
      overflow: 'hidden', border: '1px solid #1E293B',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #1E293B', background: DOC.code.tabBg,
      }}>
        <span style={{
          fontSize: '11.5px', fontWeight: 700, color: DOC.code.dim,
          fontFamily: DOC.text.mono, letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label || lang || 'code'}
        </span>
        <button type="button" onClick={copy} aria-label={copied ? 'نُسخ' : 'انسخ الشيفرة'}
                style={{
                  background: copied ? '#14532D' : 'transparent',
                  border: `1px solid ${copied ? '#166534' : '#334155'}`,
                  color: copied ? '#86EFAC' : DOC.code.dim, borderRadius: '7px',
                  padding: '3px 10px', fontSize: '11.5px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
          {copied ? '✓ نُسخ' : 'نسخ'}
        </button>
      </div>

      <pre dir="ltr" style={{
        margin: 0, padding: '14px 16px', overflowX: 'auto',
        fontSize: '13px', lineHeight: 1.75, fontFamily: DOC.text.mono,
        textAlign: 'left', color: DOC.code.ink,
      }}>
        <code>
          {rows.map((toks, i) => (
            <div key={i} style={{ display: 'flex', minWidth: 'max-content' }}>
              {lines && (
                <span aria-hidden="true" style={{
                  color: DOC.code.dim, minWidth: '28px', userSelect: 'none',
                  textAlign: 'right', marginInlineEnd: '14px', opacity: 0.7,
                }}>{i + 1}</span>
              )}
              <span>{toks.map(([t, v], j) => (
                <span key={j} style={{ color: COLOR(t) }}>{v}</span>
              ))}{toks.length === 0 ? ' ' : ''}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
