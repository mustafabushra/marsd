import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { getSupabase } from '../lib/api'

/**
 * «ارفع من جوالك» — a QR code on the laptop, a document a minute later.
 *
 * The commercial registration is a paper, or a PDF sitting in وثائق on
 * somebody's phone. Uploading it from a laptop means e-mailing it to yourself
 * first, and that is where company verification stalls — which matters, because
 * verification is what feeds the trust score.
 *
 * ============================================================================
 * The code is drawn here, in this browser
 * ============================================================================
 * There are QR services that return an image for a URL you hand them. Using one
 * would send this token — a live credential for uploading to a company's file —
 * to a third party, and leave it in their logs. The token never leaves this
 * machine except as pixels.
 *
 * ============================================================================
 * Why it does not poll
 * ============================================================================
 * The panel subscribes to the company's documents. When the phone finishes, the
 * row appears and this closes itself. Polling would have been simpler to write
 * and would have meant the laptop asking «is it there yet» sixty times for an
 * event that happens once.
 */

export default function PhoneHandoff({ docType, docLabel, companyId, onArrived, onClose }) {
  const canvas = useRef(null)
  const [state, setState] = useState('creating') // creating | ready | arrived | error
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)

  // --- The code ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const { data, error: e } = await getSupabase()
          .rpc('create_upload_handoff', { p_doc_type: docType })
        if (e) throw e

        const row = Array.isArray(data) ? data[0] : data
        if (!row?.token) throw new Error('لم يُصدر رمز')
        if (cancelled) return

        // The token is put into the canvas and into nothing else. It is never
        // written to state, so it cannot end up in a React devtools snapshot,
        // and never into the address bar, so it cannot end up in history.
        await QRCode.toCanvas(canvas.current, `${window.location.origin}/u/${row.token}`, {
          width: 208, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' },
        })

        if (cancelled) return
        setSecondsLeft(Math.max(0, Math.round((new Date(row.expires_at) - Date.now()) / 1000)))
        setState('ready')
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'تعذّر إنشاء الرمز')
        setState('error')
      }
    })()

    return () => { cancelled = true }
  }, [docType])

  // --- The countdown -------------------------------------------------------
  // Shown because a code that has quietly expired looks exactly like a code
  // that works, and somebody would scan it and be told the link is invalid with
  // no idea why.
  useEffect(() => {
    if (state !== 'ready' || secondsLeft <= 0) return undefined
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [state, secondsLeft])

  // --- Waiting for it ------------------------------------------------------
  const arrived = useCallback(() => {
    setState('arrived')
    onArrived?.()
  }, [onArrived])

  useEffect(() => {
    if (state !== 'ready' || !companyId) return undefined

    const sb = getSupabase()
    const channel = sb.channel(`handoff-${companyId}-${docType}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'company_documents',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        if (payload.new?.doc_type === docType) arrived()
      })
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [state, companyId, docType, arrived])

  const expired = state === 'ready' && secondsLeft <= 0
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <div style={{ textAlign: 'center' }}>
      {state === 'arrived' ? (
        <div style={{ padding: '18px 0' }}>
          <div style={{ fontSize: '40px' }}>✅</div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', marginTop: '8px' }}>
            وصل {docLabel}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '6px', lineHeight: 1.9 }}>
            سيراجعه فريق مرصد قبل اعتماده.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>
            امسح الرمز بكاميرا جوالك
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '6px', lineHeight: 1.9 }}>
            صوّر {docLabel} أو اخترها من ملفات جوالك — وستظهر هنا مباشرة.
          </div>

          <div style={{
            display: 'inline-block', marginTop: '16px', padding: '12px',
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
            // Dimmed rather than hidden: the frame keeps its size, so the panel
            // does not jump when the code expires.
            opacity: expired || state !== 'ready' ? 0.25 : 1,
            transition: 'opacity .2s ease',
          }}>
            <canvas ref={canvas} style={{ display: 'block', width: '208px', height: '208px' }} />
          </div>

          {state === 'creating' && (
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '12px' }}>
              جاري إنشاء الرمز…
            </div>
          )}

          {state === 'error' && (
            <div style={{
              marginTop: '14px', background: '#FEF2F2', border: '1px solid #FECACA',
              color: '#B91C1C', borderRadius: '11px', padding: '11px',
              fontSize: '13px', fontWeight: 700, lineHeight: 1.8,
            }}>
              {error}
            </div>
          )}

          {expired ? (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '13px', color: '#B45309', fontWeight: 800 }}>
                انتهت صلاحية الرمز
              </div>
              <button
                onClick={onClose}
                style={{
                  marginTop: '10px', minHeight: '44px', padding: '0 18px', background: '#1E2A52',
                  color: '#fff', border: 0, borderRadius: '10px', fontSize: '13.5px',
                  fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                }}>
                إغلاق وإعادة المحاولة
              </button>
            </div>
          ) : state === 'ready' && (
            <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '12px', lineHeight: 1.9 }}>
              ينتهي خلال {mmss} — ويصلح لمستند واحد فقط
            </div>
          )}
        </>
      )}
    </div>
  )
}
