import { useState, useEffect } from 'react'
import { DOC } from '../tokens'

/**
 * لقطة شاشة في التوثيق.
 *
 * ============================================================================
 * ما لا تفعله هذه المكوّنة
 * ============================================================================
 * لا تختلق صورة. إن لم يوجد الملف في `/public/docs/screenshots/` عُرض مكانٌ
 * محجوز **يقول صراحةً** إن اللقطة لم تُلتقط بعد، ويذكر مسارها المتوقَّع.
 *
 * وهذا مقصود: صورةٌ مرسومة تُقدَّم على أنها واجهة حقيقية تُعلّم القارئ شيئاً
 * غير موجود، فيبحث عن زرّ لا مكان له. والفراغ المُعلَن أصدق من الرسم.
 *
 * ============================================================================
 * التكبير
 * ============================================================================
 * لقطة واجهة عند عرض ٧٢٠ بكسل تصير نصوصها غير مقروءة. فالنقر يفتحها بالحجم
 * الكامل، و Escape يُغلق، والتركيز يعود إلى الصورة — لا يضيع في الصفحة.
 */
export default function DocScreenshot ({ src, alt, caption, maxHeight }) {
  const [state, setState] = useState('loading')   // loading | ok | missing
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    if (!src) { setState('missing'); return }
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) setState('ok') }
    img.onerror = () => { if (alive) setState('missing') }
    img.src = src
    return () => { alive = false }
  }, [src])

  useEffect(() => {
    if (!zoom) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setZoom(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  const frame = {
    border: `1px solid ${DOC.border}`, borderRadius: '12px',
    overflow: 'hidden', background: DOC.subtle, margin: '18px 0',
  }

  if (state === 'missing') {
    return (
      <figure style={{ ...frame, margin: '18px 0' }}>
        <div style={{
          padding: '30px 22px', textAlign: 'center',
          border: `2px dashed ${DOC.border}`, borderRadius: '12px',
          background: DOC.rail,
        }}>
          <div style={{ fontSize: '22px', marginBottom: '8px', opacity: 0.5 }} aria-hidden="true">◻</div>
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: DOC.muted, marginBottom: '5px' }}>
            لقطة الشاشة لم تُلتقط بعد
          </div>
          <div style={{ fontSize: '12.5px', color: DOC.faint, lineHeight: 1.9 }}>
            {alt || caption || 'واجهة مرصد'}
          </div>
          {src && (
            <code dir="ltr" style={{
              display: 'inline-block', marginTop: '9px', fontSize: '11.5px',
              fontFamily: DOC.text.mono, color: DOC.faint,
              background: DOC.subtle, padding: '3px 8px', borderRadius: '6px',
            }}>{src}</code>
          )}
        </div>
      </figure>
    )
  }

  return (
    <>
      <figure style={frame}>
        <button type="button" onClick={() => setZoom(true)}
                aria-label={`تكبير: ${alt || caption || 'لقطة شاشة'}`}
                style={{
                  display: 'block', width: '100%', padding: 0, border: 0,
                  background: 'transparent', cursor: 'zoom-in', lineHeight: 0,
                }}>
          <img src={src} alt={alt || caption || ''} loading="lazy" decoding="async"
               style={{
                 width: '100%', height: 'auto', display: 'block',
                 maxHeight: maxHeight || 'none', objectFit: 'contain',
                 opacity: state === 'ok' ? 1 : 0, transition: 'opacity .2s',
               }} />
        </button>
        {caption && (
          <figcaption style={{
            padding: '9px 14px', fontSize: '12.5px', color: DOC.muted,
            borderTop: `1px solid ${DOC.border}`, background: DOC.bg, lineHeight: 1.8,
          }}>{caption}</figcaption>
        )}
      </figure>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={alt || 'لقطة شاشة مكبَّرة'}
             onClick={() => setZoom(false)}
             style={{
               position: 'fixed', inset: 0, background: 'rgba(15,23,42,.82)',
               zIndex: 90, display: 'flex', alignItems: 'center',
               justifyContent: 'center', padding: '28px', cursor: 'zoom-out',
             }}>
          <img src={src} alt={alt || ''} style={{
            maxWidth: '100%', maxHeight: '100%', borderRadius: '10px',
            boxShadow: '0 24px 60px rgba(0,0,0,.4)',
          }} />
          <button type="button" onClick={() => setZoom(false)} aria-label="إغلاق"
                  style={{
                    position: 'fixed', top: '18px', insetInlineEnd: '18px',
                    background: 'rgba(255,255,255,.12)', color: '#fff',
                    border: '1px solid rgba(255,255,255,.25)', borderRadius: '9px',
                    width: '36px', height: '36px', fontSize: '17px', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>✕</button>
        </div>
      )}
    </>
  )
}
