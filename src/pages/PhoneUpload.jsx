import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

/**
 * The page a phone opens after scanning the QR code on a laptop.
 *
 * It is deliberately the smallest screen in the product. No header, no sidebar,
 * no sign-in, no navigation away — one sentence saying what is being asked for,
 * a way to provide it, and one result. Somebody has already decided to do this;
 * everything else on the screen would be in the way.
 *
 * It holds no credentials of its own. The token in the URL is the whole of its
 * authority, it can only be spent on one upload, and every decision about
 * whether that upload is allowed is made by /api/handoff-upload. This file
 * decides nothing — it asks, and it reports what it is told.
 *
 * ============================================================================
 * It asks before it shows anything
 * ============================================================================
 * The first version rendered the upload form immediately and only checked the
 * token when a file was chosen. Reported from a real phone: the laptop's code
 * ran out and said so, and scanning it afterwards still opened a page that
 * looked ready. The upload was refused — it always was — but the screen invited
 * somebody to photograph a document and only then told them it was too late.
 *
 * So nothing is offered until the server has confirmed the link is alive, and
 * the countdown runs here too, so the page goes dead on screen at the same
 * moment the token does.
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

const S = {
  page: {
    minHeight: '100vh', background: '#F8FAFC', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 18px', textAlign: 'center',
  },
  card: {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px',
    padding: '28px 22px', width: '100%', maxWidth: '420px',
    boxShadow: '0 8px 28px rgba(15,23,42,.06)',
  },
  title: { fontSize: '19px', fontWeight: 900, color: '#0F172A', marginTop: '10px' },
  quiet: { fontSize: '13.5px', color: '#64748B', lineHeight: 1.9, marginTop: '14px' },
  primary: {
    width: '100%', minHeight: '52px', background: '#16A34A', color: '#fff',
    border: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800,
    fontFamily: 'inherit', cursor: 'pointer',
  },
  secondary: {
    width: '100%', minHeight: '52px', background: '#fff', color: '#1E2A52',
    border: '1.5px solid #E2E8F0', borderRadius: '12px', fontSize: '15px',
    fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
  },
}

const Shell = ({ children }) => (
  <div style={S.page}><div style={S.card}>{children}</div></div>
)

export default function PhoneUpload() {
  const { token } = useParams()

  // Two inputs, not one.
  //
  // `capture` is not a hint — on a phone it removes the file picker entirely
  // and opens the camera. The first version put it on the only input there was,
  // so a person whose commercial registration was already a PDF in وثائق had no
  // way to send it and was offered a photograph of nothing. Both are ordinary,
  // so both are offered, and the person picks.
  const cameraInput = useRef(null)
  const fileInput = useRef(null)

  const [phase, setPhase] = useState('checking') // checking | ready | working | done | dead
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [context, setContext] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(null)

  // A token in a URL must not reach anywhere else, and this page must not be
  // findable. The API's own headers only cover its responses; this is the page.
  useEffect(() => {
    const tags = [['referrer', 'no-referrer'], ['robots', 'noindex, nofollow']]
      .map(([name, content]) => Object.assign(document.createElement('meta'), { name, content }))
    document.head.append(...tags)
    const title = document.title
    document.title = 'رفع مستند — مرصد'
    return () => { tags.forEach((t) => t.remove()); document.title = title }
  }, [])

  // --- Is this link alive? -------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await post({ action: 'check', token })
        if (cancelled) return
        setContext({ companyName: r.companyName, docLabel: r.docLabel })
        setSecondsLeft(Math.max(0, Math.round((new Date(r.expiresAt) - Date.now()) / 1000)))
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        setMessage(e.message)
        setPhase('dead')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // The same countdown the laptop shows. Without it the page stays inviting
  // after the token is gone, which is the fault this page had.
  useEffect(() => {
    if (phase !== 'ready' || secondsLeft === null) return undefined
    if (secondsLeft <= 0) {
      setMessage('انتهت صلاحية الرابط')
      setPhase('dead')
      return undefined
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, secondsLeft])

  const upload = useCallback(async (file) => {
    if (!file) return

    // Said here as well as on the server, because a person who picked a 40MB
    // video should be told before they spend two minutes sending it.
    if (file.size > MAX_BYTES) {
      setMessage(`الملف ${(file.size / 1024 / 1024).toFixed(1)} م.ب — الحد الأقصى 15`)
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setMessage('اختر ملف PDF أو صورة')
      return
    }

    setPhase('working')
    setProgress(0)
    setMessage('جاري التجهيز…')

    try {
      const start = await post({ action: 'start', token, size: file.size, mime: file.type })
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
          ? resolve() : reject(new Error('تعذّر رفع الملف')))
        xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'))
        xhr.send(file)
      })

      setMessage('جاري الحفظ…')
      await post({ action: 'finish', token, path: start.path, fileName: file.name })

      setPhase('done')
    } catch (e) {
      setMessage(e.message)
      setPhase('ready')
    }
  }, [token])

  const onPick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    upload(f)
  }

  if (phase === 'checking') {
    return (
      <Shell>
        <div style={{ fontSize: '34px' }}>⏳</div>
        <div style={S.quiet}>جاري التحقّق من الرابط…</div>
      </Shell>
    )
  }

  if (phase === 'dead') {
    return (
      <Shell>
        <div style={{ fontSize: '44px' }}>⌛</div>
        <div style={S.title}>{message || 'رابط غير صالح'}</div>
        <div style={S.quiet}>
          افتح صفحة مستندات شركتك على الحاسوب واضغط «من الجوال» مرة أخرى
          للحصول على رمز جديد.
        </div>
      </Shell>
    )
  }

  if (phase === 'done') {
    return (
      <Shell>
        <div style={{ fontSize: '46px' }}>✅</div>
        <div style={S.title}>وصل المستند</div>
        <div style={S.quiet}>
          ظهر الآن على شاشة الحاسوب. يمكنك إغلاق هذه الصفحة.
          <br />
          سيراجعه فريق مرصد قبل اعتماده.
        </div>
      </Shell>
    )
  }

  const mmss = secondsLeft === null ? '' :
    `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <Shell>
      <div style={{ fontSize: '40px' }}>📄</div>
      <div style={S.title}>ارفع {context?.docLabel || 'المستند'}</div>
      {context?.companyName && (
        <div style={{ fontSize: '14px', color: '#475569', marginTop: '6px' }}>
          {context.companyName}
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/jpeg,image/png"
             capture="environment" style={{ display: 'none' }} onChange={onPick} />
      <input ref={fileInput} type="file" accept={ACCEPT}
             style={{ display: 'none' }} onChange={onPick} />

      {phase === 'working' ? (
        <>
          <div style={{
            marginTop: '22px', height: '8px', background: '#E2E8F0',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            <button style={S.primary} onClick={() => cameraInput.current?.click()}>
              📷 التقاط بالكاميرا
            </button>
            <button style={S.secondary} onClick={() => fileInput.current?.click()}>
              📎 اختيار ملف من الجوال
            </button>
          </div>

          {message && (
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
            لمستند واحد — وينتهي خلال {mmss}
          </div>
        </>
      )}
    </Shell>
  )
}
