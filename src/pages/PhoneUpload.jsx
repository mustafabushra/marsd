import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

/**
 * The page a phone opens after scanning the QR code on a laptop.
 *
 * It is deliberately the smallest screen in the product. No header, no
 * sidebar, no sign-in, no navigation away — one sentence saying what is being
 * asked for, one button, one result. Somebody has already decided to do this;
 * everything else on the screen would be in the way.
 *
 * It holds no credentials of its own. The token in the URL is the whole of its
 * authority, it can only be spent on one upload, and every decision about
 * whether that upload is allowed is made by /api/handoff-upload. This file
 * decides nothing — it asks, and it reports what it is told.
 */

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png'

const post = async (payload) => {
  const r = await fetch('/api/handoff-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error || 'تعذّر إتمام العملية')
  return json
}

export default function PhoneUpload() {
  const { token } = useParams()
  const fileInput = useRef(null)

  const [phase, setPhase] = useState('idle')   // idle | working | done | error
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [context, setContext] = useState(null) // what we are being asked for

  // A token in a URL must not reach anywhere else. The header from the API only
  // covers the API's own response; this page carries its own.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(meta, robots)
    const title = document.title
    document.title = 'رفع مستند — مرصد'
    return () => { meta.remove(); robots.remove(); document.title = title }
  }, [])

  const upload = useCallback(async (file) => {
    if (!file) return

    // Said here as well as on the server, because a person who picked a 40MB
    // video should be told before they spend two minutes sending it.
    if (file.size > MAX_BYTES) {
      setPhase('error')
      setMessage('الملف أكبر من 15 ميجابايت')
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setPhase('error')
      setMessage('اختر ملف PDF أو صورة')
      return
    }

    setPhase('working')
    setProgress(0)
    setMessage('جاري التجهيز…')

    try {
      const start = await post({ action: 'start', token, size: file.size, mime: file.type })
      setContext({ companyName: start.companyName, docLabel: start.docLabel })
      setMessage(`جاري رفع ${start.docLabel}…`)

      // XHR rather than fetch, for the one thing fetch cannot do: report how
      // far an upload has got. On a phone connection this is the difference
      // between waiting and wondering whether it froze.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', start.uploadUrl, true)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('تعذّر رفع الملف')))
        xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'))
        xhr.send(file)
      })

      setMessage('جاري الحفظ…')
      await post({ action: 'finish', token, path: start.path, fileName: file.name })

      setPhase('done')
      setMessage('وصل المستند')
    } catch (e) {
      setPhase('error')
      setMessage(e.message)
    }
  }, [token])

  const S = {
    page: {
      minHeight: '100vh', background: '#F8FAFC', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 18px', gap: '18px', textAlign: 'center',
    },
    card: {
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px',
      padding: '28px 22px', width: '100%', maxWidth: '420px',
      boxShadow: '0 8px 28px rgba(15,23,42,.06)',
    },
    button: {
      width: '100%', minHeight: '52px', background: '#16A34A', color: '#fff',
      border: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800,
      fontFamily: 'inherit', cursor: 'pointer', marginTop: '18px',
    },
    quiet: { fontSize: '13.5px', color: '#64748B', lineHeight: 1.9, marginTop: '14px' },
  }

  if (phase === 'done') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ fontSize: '46px' }}>✅</div>
          <div style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', marginTop: '10px' }}>
            وصل المستند
          </div>
          <div style={S.quiet}>
            ظهر الآن على شاشة الحاسوب. يمكنك إغلاق هذه الصفحة.
            <br />
            سيراجعه فريق مرصد قبل اعتماده.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: '40px' }}>📄</div>
        <div style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', marginTop: '10px' }}>
          {context?.docLabel ? `ارفع ${context.docLabel}` : 'ارفع المستند'}
        </div>
        {context?.companyName && (
          <div style={{ fontSize: '14px', color: '#475569', marginTop: '6px' }}>
            {context.companyName}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            upload(f)
          }}
        />

        {phase === 'working' ? (
          <>
            <div style={{
              marginTop: '20px', height: '8px', background: '#E2E8F0',
              borderRadius: '99px', overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`, height: '100%', background: '#16A34A',
                transition: 'width .2s ease',
              }} />
            </div>
            <div style={S.quiet}>{message}</div>
          </>
        ) : (
          <>
            <button style={S.button} onClick={() => fileInput.current?.click()}>
              📷 التقاط أو اختيار ملف
            </button>
            {phase === 'error' && (
              <div style={{
                marginTop: '16px', background: '#FEF2F2', border: '1px solid #FECACA',
                color: '#B91C1C', borderRadius: '11px', padding: '12px',
                fontSize: '13.5px', fontWeight: 700, lineHeight: 1.8,
              }}>
                {message}
              </div>
            )}
            <div style={S.quiet}>
              PDF أو صورة، حتى 15 ميجابايت.
              <br />
              هذا الرابط لمرة واحدة وينتهي خلال خمس دقائق.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
