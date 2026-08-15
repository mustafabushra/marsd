import { CALLOUT, DOC } from '../tokens'
import { useDocLang } from '../DocLangContext'

/**
 * نداء — معلومة أو تنبيه أو تحذير.
 *
 * ============================================================================
 * لماذا لا يُميَّز باللون وحده
 * ============================================================================
 * قارئٌ لا يميّز الأحمر من الأخضر يرى صندوقين متطابقين. فلكلٍّ عنوانٌ مكتوب
 * («تحذير»، «نصيحة») ورمزٌ مختلف الشكل — واللون ثالثهما لا أوّلهما.
 *
 * و`role="note"` يجعل قارئ الشاشة يُعلن أنه مقطعٌ جانبي لا متن.
 */
export default function Callout ({ type = 'info', title, children }) {
  const lang = useDocLang()
  const c = CALLOUT[type] || CALLOUT.info
  const MARK = { info: 'ℹ', tip: '◆', success: '✓', warning: '▲', danger: '✕' }[type] || 'ℹ'

  return (
    <div role="note" style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: '12px', padding: '14px 16px', margin: '18px 0',
      display: 'flex', gap: '12px', alignItems: 'flex-start',
    }}>
      <span aria-hidden="true" style={{
        color: c.mark, fontSize: '15px', fontWeight: 900, lineHeight: 1.6, flex: 'none',
      }}>{MARK}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: '13px', fontWeight: 800, color: c.ink, marginBottom: '4px',
        }}>
          {title || c.label[lang] || c.label.ar}
        </div>
        <div style={{
          fontSize: '14.5px', lineHeight: 1.9, color: c.ink, opacity: 0.92,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** شارة صغيرة — لحالة أو نسخة أو طريقة. */
export function Badge ({ tone = 'neutral', children }) {
  const tones = {
    neutral: { bg: DOC.subtle, ink: DOC.muted, border: DOC.border },
    brand: { bg: '#EEF2FF', ink: '#3730A3', border: '#C7D2FE' },
    success: { bg: '#ECFDF5', ink: '#15803D', border: '#BBF7D0' },
    warning: { bg: '#FFFBEB', ink: '#92400E', border: '#FDE68A' },
    danger: { bg: '#FEF2F2', ink: '#B91C1C', border: '#FECACA' },
  }
  const t = tones[tone] || tones.neutral
  return (
    <span style={{
      display: 'inline-block', background: t.bg, color: t.ink,
      border: `1px solid ${t.border}`, borderRadius: '6px',
      padding: '1px 8px', fontSize: '12px', fontWeight: 800,
      verticalAlign: 'middle', margin: '0 2px',
    }}>{children}</span>
  )
}
