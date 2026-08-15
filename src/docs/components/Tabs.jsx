import { useState, useRef, useId } from 'react'
import { DOC } from '../tokens'

/**
 * تبويبات — لعرض المثال نفسه بلغات أو سياقات مختلفة.
 *
 * ============================================================================
 * لوحة المفاتيح
 * ============================================================================
 * نمط ARIA للتبويبات يقتضي أن تكون الأسهم هي المتنقّل لا Tab: مفتاح Tab يخرج
 * من شريط التبويبات إلى المحتوى، والسهمان يتنقّلان بين التبويبات. وبدون ذلك
 * يمرّ من يتنقّل بلوحة المفاتيح على كل تبويب في طريقه إلى المحتوى.
 *
 * الاستعمال:
 *   <Tabs items={['cURL','JSON']}>
 *     <Tab>…</Tab>
 *     <Tab>…</Tab>
 *   </Tabs>
 */
export default function Tabs ({ items = [], children }) {
  const [active, setActive] = useState(0)
  const id = useId()
  const refs = useRef([])
  const panels = Array.isArray(children) ? children : [children]

  const onKey = (e) => {
    // RTL: السهم الأيسر يتقدّم. يُقرأ الاتجاه من الوثيقة لا يُفترض.
    const rtl = typeof document !== 'undefined' && document.dir === 'rtl'
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    let next = null
    if (e.key === fwd) next = (active + 1) % items.length
    else if (e.key === back) next = (active - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next === null) return
    e.preventDefault()
    setActive(next)
    refs.current[next]?.focus()
  }

  return (
    <div style={{ margin: '18px 0' }}>
      <div role="tablist" aria-label="أمثلة" onKeyDown={onKey}
           style={{
             display: 'flex', gap: '3px', borderBottom: `1px solid ${DOC.border}`,
             marginBottom: '-1px', overflowX: 'auto',
           }}>
        {items.map((label, i) => (
          <button key={label} role="tab" type="button"
                  ref={(el) => { refs.current[i] = el }}
                  id={`${id}-tab-${i}`}
                  aria-selected={active === i}
                  aria-controls={`${id}-panel-${i}`}
                  tabIndex={active === i ? 0 : -1}
                  onClick={() => setActive(i)}
                  style={{
                    background: 'transparent', border: 0,
                    borderBottom: `2px solid ${active === i ? DOC.brand : 'transparent'}`,
                    color: active === i ? DOC.brand : DOC.muted,
                    padding: '9px 14px', fontSize: '13.5px',
                    fontWeight: active === i ? 800 : 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={i} role="tabpanel" id={`${id}-panel-${i}`}
             aria-labelledby={`${id}-tab-${i}`} hidden={active !== i} tabIndex={0}>
          {active === i ? panel : null}
        </div>
      ))}
    </div>
  )
}

export function Tab ({ children }) { return <>{children}</> }
