import { DOC, METHOD } from '../tokens'

/**
 * مرجع نقطة نهاية في الواجهة البرمجية.
 *
 * ============================================================================
 * لماذا مكوّنة لا جدول مكتوب بيد
 * ============================================================================
 * ستّ نقاط اليوم، وستّون غداً. وكل واحدة تحتاج الحقول نفسها: الطريقة، المسار،
 * المصادقة، المُعامِلات، الردّ، الأخطاء. وكتابتها بيد في MDX تعني ستّين نسخة
 * تفترق في ترتيبها وتسميتها — ومرجعٌ يختلف شكله بين صفحتين يُقرأ ببطء.
 *
 * والمسار \u200Edir="ltr"\u200E دائماً: مسارٌ فيه شرطات مائلة داخل نصّ عربي تنقلب
 * أجزاؤه فيصير غير قابل للنسخ.
 */
export default function Endpoint ({ method = 'GET', path, auth, summary, children }) {
  const m = METHOD[method.toUpperCase()] || METHOD.GET
  return (
    <div style={{
      border: `1px solid ${DOC.border}`, borderRadius: '12px',
      margin: '20px 0', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        padding: '12px 14px', background: DOC.subtle,
        borderBottom: `1px solid ${DOC.border}`,
      }}>
        <span style={{
          background: m.bg, color: m.ink, borderRadius: '6px',
          padding: '3px 10px', fontSize: '12px', fontWeight: 900,
          fontFamily: DOC.text.mono, letterSpacing: '.03em',
        }}>{method.toUpperCase()}</span>
        <code dir="ltr" style={{
          fontFamily: DOC.text.mono, fontSize: '13.5px', fontWeight: 700,
          color: DOC.ink, direction: 'ltr', unicodeBidi: 'isolate',
        }}>{path}</code>
        {auth && (
          <span style={{
            marginInlineStart: 'auto', fontSize: '11.5px', fontWeight: 800,
            color: auth === 'none' ? DOC.muted : '#B45309',
            background: auth === 'none' ? DOC.subtle : '#FFFBEB',
            border: `1px solid ${auth === 'none' ? DOC.border : '#FDE68A'}`,
            borderRadius: '6px', padding: '2px 9px',
          }}>
            {auth === 'none' ? 'بلا مصادقة' : auth === 'token' ? 'رمز في المسار' : 'Clerk مطلوب'}
          </span>
        )}
      </div>
      {summary && (
        <p style={{
          margin: 0, padding: '12px 14px', fontSize: '14.5px',
          color: DOC.body, lineHeight: 1.9, borderBottom: `1px solid ${DOC.border}`,
        }}>{summary}</p>
      )}
      <div style={{ padding: '4px 14px 14px' }}>{children}</div>
    </div>
  )
}

/** جدول مُعامِلات أو حقول ردّ. */
export function Fields ({ title, rows = [] }) {
  return (
    <div style={{ margin: '14px 0' }}>
      {title && (
        <div style={{
          fontSize: '12.5px', fontWeight: 800, color: DOC.muted,
          marginBottom: '7px', letterSpacing: '.02em',
        }}>{title}</div>
      )}
      <div style={{ border: `1px solid ${DOC.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.name} style={{
            display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr',
            gap: '12px', padding: '10px 13px',
            borderTop: i ? `1px solid ${DOC.border}` : 0,
            alignItems: 'baseline',
          }}>
            <div>
              <code dir="ltr" style={{
                fontFamily: DOC.text.mono, fontSize: '12.5px',
                fontWeight: 800, color: DOC.brand,
              }}>{r.name}</code>
              {r.required && (
                <span style={{ color: '#B91C1C', fontSize: '11px', fontWeight: 800, marginInlineStart: '5px' }}>
                  مطلوب
                </span>
              )}
              {r.type && (
                <div style={{ fontSize: '11.5px', color: DOC.faint, fontFamily: DOC.text.mono, marginTop: '2px' }}>
                  {r.type}
                </div>
              )}
            </div>
            <div style={{ fontSize: '13.5px', color: DOC.body, lineHeight: 1.85 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** رموز الحالة التي تُعيدها نقطة النهاية فعلاً. */
export function Statuses ({ rows = [] }) {
  const tone = (c) => (c < 300 ? { bg: '#ECFDF5', ink: '#15803D' }
    : c < 400 ? { bg: '#EFF6FF', ink: '#1D4ED8' }
      : c < 500 ? { bg: '#FFFBEB', ink: '#B45309' }
        : { bg: '#FEF2F2', ink: '#B91C1C' })
  return (
    <div style={{ margin: '14px 0' }}>
      <div style={{ fontSize: '12.5px', fontWeight: 800, color: DOC.muted, marginBottom: '7px' }}>
        رموز الحالة
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {rows.map((r) => {
          const t = tone(Number(r.code))
          return (
            <div key={r.code} style={{
              display: 'flex', gap: '11px', alignItems: 'baseline',
              padding: '8px 12px', background: DOC.subtle,
              border: `1px solid ${DOC.border}`, borderRadius: '9px',
            }}>
              <span style={{
                background: t.bg, color: t.ink, borderRadius: '5px',
                padding: '1px 8px', fontSize: '12px', fontWeight: 900,
                fontFamily: DOC.text.mono, flex: 'none',
              }}>{r.code}</span>
              <span style={{ fontSize: '13.5px', color: DOC.body, lineHeight: 1.8 }}>{r.desc}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
