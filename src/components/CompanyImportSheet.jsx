import { useCallback, useEffect, useRef, useState } from 'react'
import { FIELD_LABELS, CONFIDENCE } from '../lib/companyImport/normalize'
import { useAuth } from '@clerk/react'
import { qrSource, FILE_SOURCES } from '../lib/companyImport/extractors'
import { aiSource, DOC_TYPES } from '../lib/companyImport/aiSource'
import { isViewcrUrl, VIEWCR_HOST } from '../lib/companyImport/viewcrParser'
import { extractForForm } from '../lib/extraction/toFormPatch'

/**
 * استيراد بيانات الشركة — read a commercial registration instead of typing it.
 *
 * Three ways in: the camera looking for a QR, a PDF, or a photo. All three end
 * at the same review screen, because they all return the same shape (see
 * lib/companyImport/normalize.js). An official registry lookup added later ends
 * up here too, unchanged.
 *
 * Nothing is written on the person's behalf without being shown first. Every
 * imported field is marked with where it came from and how much to trust it,
 * every field that could not be read is listed as still needing typing, and any
 * value can be edited before it reaches the form. OCR over a photograph of an
 * Arabic document is a guess, and a screen that quietly filled eighteen fields
 * with guesses would be worse than the typing it replaced.
 */

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
  display: 'grid', placeItems: 'center', zIndex: 400, padding: '20px',
}
const panel = {
  background: '#fff', borderRadius: '16px', padding: '24px',
  width: '100%', maxWidth: '720px', maxHeight: '92vh', overflowY: 'auto',
}
/**
 * Pasting the link is a first-class way in, not a fallback.
 *
 * A verification link arrives by WhatsApp or email far more often than somebody
 * is standing in front of the paper with a camera — the person forwarding it
 * already scanned the code once, and asking them to scan it again is asking them
 * to find the document.
 */
// Labels for the official facts the add-company form has no field for.
const EXTRA_LABELS = {
  companyName: 'اسم الشركة', registryNumber: 'رقم السجل التجاري', crStatus: 'حالة السجل',
  establishmentType: 'نوع المنشأة', companyType: 'نوع الشركة', companyTraits: 'صفات الشركة',
  registrationDate: 'تاريخ قيد السجل', annualConfirmDate: 'تاريخ التأكيد السنوي',
  crVersionNumber: 'رقم نسخة السجل', capital: 'رأس المال', city: 'المدينة',
  address: 'العنوان', phone: 'رقم الجوال', email: 'البريد الإلكتروني',
  website: 'الموقع الإلكتروني', unifiedNumber: 'الرقم الموحد', expiryDate: 'تاريخ انتهاء السجل',
  activities: 'الأنشطة', managers: 'المديرين',
}

const LINK_SOURCE = {
  id: 'link',
  label: 'لصق نص السجل',
  icon: '📋',
  hint: 'من منصة الأعمال أو شهادة السجل أو ملف PDF — الصق النص كما هو',
}

/**
 * Sources that are built but not offered.
 *
 * The camera and the two file readers all end at OCR, and OCR on a photographed
 * Arabic certificate reads a handful of fields where pasting the page reads
 * twenty. Leaving them enabled meant people reached for the weakest path first
 * and judged the whole feature by it.
 *
 * Marked rather than deleted: the code is tested and working, the review screen
 * and the extractor need nothing changed, and re-offering one is removing its
 * id from this set. A disabled control that says «قريباً» is also a more honest
 * screen than one that quietly loses three buttons between releases.
 */
const NOT_YET = new Set(['qr', 'pdf', 'image'])

const btn = (primary) => ({
  padding: '11px 22px', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
  border: primary ? 0 : '1.5px solid #E2E8F0',
  background: primary ? '#1E2A52' : '#fff',
  color: primary ? '#fff' : '#475569',
})

export default function CompanyImportSheet({ open, onClose, onApply }) {
  const [mode, setMode] = useState(null)        // null | 'qr' | 'pdf' | 'image'
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, note: '' })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)    // the extraction under review
  const [edited, setEdited] = useState({})      // field → value the person changed
  const [camError, setCamError] = useState('')
  const [pasted, setPasted] = useState('')
  // The verification link, whether it came from the camera or was pasted from a
  // message. Kept beside the extraction so it is stored with the company.
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')
  // Which certificate the model is being handed. Naming it beats making the
  // model guess, so it is asked for before the file picker opens.
  const [docType, setDocType] = useState('commercial_registration')
  // Which field the person is pointing at, so its source line can be lit up in
  // the pasted text. Checking a value against the line it came from is far
  // faster than re-reading the page.
  const [hovered, setHovered] = useState(null)
  // Fields struck out before applying. Excluded here rather than cleared, so
  // the extracted value stays visible and the decision stays reversible.
  const [dropped, setDropped] = useState(() => new Set())
  const { getToken } = useAuth()

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanRef = useRef(null)
  const fileRef = useRef(null)
  const pendingSource = useRef(null)

  const stopCamera = useCallback(() => {
    if (scanRef.current) { cancelAnimationFrame(scanRef.current); scanRef.current = null }
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // The camera must stop when this closes, when the mode changes, and when the
  // component unmounts. A light left on after the sheet is dismissed is the kind
  // of bug people notice and do not forgive.
  useEffect(() => stopCamera, [stopCamera])
  useEffect(() => { if (!open) { stopCamera(); reset() } }, [open, stopCamera])

  const reset = () => {
    setMode(null); setBusy(false); setError(''); setCamError('')
    setResult(null); setEdited({}); setProgress({ pct: 0, note: '' })
    setPasted(''); setLink(''); setLinkError('')
    setHovered(null); setDropped(new Set())
  }

  // ---- camera --------------------------------------------------------------

  const startCamera = async () => {
    setMode('qr'); setError(''); setCamError(''); setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) { stopCamera(); return }
      v.srcObject = stream
      await v.play()

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const tick = async () => {
        if (!streamRef.current || !v.videoWidth) {
          scanRef.current = requestAnimationFrame(tick)
          return
        }
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        try {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const found = await qrSource.runOnImageData(data)
          if (found) {
            stopCamera()
            // A Business Centre code carries a verification link, not the record.
            // Take the link and move to the step that turns it into fields.
            const url = found.unparsed || ''
            if (isViewcrUrl(url)) {
              setLink(url)
              setMode('link')
              return
            }
            setResult(found)
            return
          }
        } catch { /* keep scanning; a bad frame is not a failure */ }
        scanRef.current = requestAnimationFrame(tick)
      }
      scanRef.current = requestAnimationFrame(tick)
    } catch (err) {
      const denied = err?.name === 'NotAllowedError'
      setCamError(denied
        ? 'الكاميرا مرفوضة من المتصفح — اسمح بالوصول ثم أعد المحاولة، أو ارفع صورة للرمز بدلاً من ذلك.'
        : 'تعذّر فتح الكاميرا على هذا الجهاز — ارفع صورة للرمز بدلاً من ذلك.')
    }
  }

  // ---- files ---------------------------------------------------------------

  const pickFile = (source) => {
    pendingSource.current = source
    setMode(source.id)
    if (fileRef.current) {
      fileRef.current.accept = source.accepts || ''
      fileRef.current.value = ''
      fileRef.current.click()
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    const source = pendingSource.current
    if (!file || !source) return
    setBusy(true); setError(''); setResult(null); setProgress({ pct: 0, note: 'يبدأ…' })
    try {
      const extraction = await source.run(
        file,
        (pct, note) => setProgress({ pct: pct || 0, note: note || '' }),
        // Only the model-backed source uses these; the OCR sources ignore the
        // third argument entirely.
        { docType, getToken },
      )
      setResult(extraction)
    } catch (err) {
      setError(err?.message || 'تعذّرت قراءة الملف')
    } finally {
      setBusy(false)
    }
  }

  // ---- applying ------------------------------------------------------------

  const valueOf = (key) => (key in edited ? edited[key] : (result?.fields?.[key]?.value ?? ''))

  const apply = () => {
    const patch = {}
    for (const key of Object.keys(FIELD_LABELS)) {
      // A struck-out field is not applied, even though its value is still on
      // screen. The person looked at it and said no; that is the whole point of
      // a review step.
      if (dropped.has(key)) continue
      const v = String(valueOf(key) ?? '').trim()
      if (v) patch[key] = v
    }
    // Everywhere the person disagreed with the reading.
    //
    // This is the only signal that tells us which rule is wrong on real
    // documents, and it exists for exactly as long as this sheet is open. The
    // pasted text is not included — a commercial registration belongs to
    // somebody, and a field name with two short values is enough to write a
    // rule from.
    const corrections = []
    for (const key of Object.keys(FIELD_LABELS)) {
      const got = result?.fields?.[key]
      const typed = key in edited ? String(edited[key] ?? '').trim() : null
      const struck = dropped.has(key)
      const was = got?.value ?? null

      if (!struck && (typed === null || typed === (was ?? ''))) continue

      corrections.push({
        field: key,
        extracted: was,
        corrected: struck ? null : typed,
        method: got?.method ?? null,
        score: got?.score ?? null,
        layout_mode: result?.meta?.layoutMode ?? null,
      })
    }

    // Where it came from travels with what came from it. A registry entry whose
    // origin cannot be named is one nobody can re-check.
    onApply(patch, result?.source || 'import', {
      corrections,
      // The managers list has no text box on the review screen — it is a tags
      // field on the form — so it travels beside the patch rather than in it.
      managers: result?.managers ?? [],
      verificationUrl: result?.meta?.url || null,
      officialData: result?.extras && Object.keys(result.extras).length
        ? { ...result.extras, parser: result.meta?.parser || null,
            reference: result.meta?.reference || null, read_at: new Date().toISOString() }
        : null,
    })
    onClose()
  }

  if (!open) return null

  const filled = result
    ? Object.keys(FIELD_LABELS).filter((k) => !dropped.has(k) && String(valueOf(k)).trim())
    : []
  const missing = result ? Object.keys(FIELD_LABELS).filter((k) => !String(valueOf(k)).trim()) : []

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div style={panel} dir="rtl">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>
              📥 استيراد بيانات الشركة
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.7 }}>
              الصق نص السجل التجاري وسيُعبَّأ النموذج. تراجع كل حقل — ومصدره —
              قبل الحفظ، ولا يُحفظ شيء لم تره.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="إغلاق"
                  style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: busy ? 'default' : 'pointer', color: '#64748B', flex: 'none', fontFamily: 'inherit' }}>✕</button>
        </div>

        <input ref={fileRef} type="file" onChange={onFile} style={{ display: 'none' }} />

        {/* ---- choosing a source ---- */}
        {!result && !busy && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px', marginTop: '20px' }}>
              {[LINK_SOURCE, qrSource, ...FILE_SOURCES].map((s) => {
                const soon = NOT_YET.has(s.id)
                return (
                  <button key={s.id}
                          disabled={soon}
                          // A disabled button still has to say why. Without the
                          // title an unexplained grey card reads as broken.
                          title={soon ? 'قيد التطوير — استخدم لصق نص السجل' : undefined}
                          onClick={() => {
                            if (soon) return
                            if (s.id === 'qr') return startCamera()
                            if (s.id === 'link') { setMode('link'); setCamError(''); return }
                            if (s.id === 'ai') { setMode('ai'); setCamError(''); return }
                            return pickFile(s)
                          }}
                          style={{ textAlign: 'right', position: 'relative',
                                   background: soon ? '#F8FAFC' : mode === s.id ? '#EEF2FF' : '#fff',
                                   border: `1.5px solid ${soon ? '#E2E8F0' : mode === s.id ? '#1E2A52' : '#E2E8F0'}`,
                                   borderRadius: '13px', padding: '16px', fontFamily: 'inherit',
                                   cursor: soon ? 'not-allowed' : 'pointer',
                                   opacity: soon ? 0.55 : 1 }}>
                    {soon && (
                      <span style={{ position: 'absolute', top: '12px', insetInlineStart: '12px',
                                     background: '#F1F5F9', color: '#64748B', borderRadius: '6px',
                                     padding: '2px 9px', fontSize: '10.5px', fontWeight: 800 }}>
                        قريباً
                      </span>
                    )}
                    <div style={{ fontSize: '22px', marginBottom: '7px' }}>{s.icon}</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: soon ? '#64748B' : '#0F172A', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>{s.hint}</div>
                  </button>
                )
              })}
            </div>

            {/* Three greyed cards with no explanation read as a broken screen.
                One line turns them into a roadmap. */}
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '12px 0 0', lineHeight: 1.9 }}>
              الطرق الثلاث الأخرى قيد التطوير — تعتمد على قراءة الصور ودقّتها أقل بكثير.
              لصق نص السجل ينسخ الحروف كما هي، فيقرأ عشرين حقلاً بدل بضعة.
            </p>

            {mode === 'ai' && (
              <div style={{ marginTop: '18px' }}>
                <label>
                  <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    أي مستند هذا؟
                  </span>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)}
                          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontFamily: 'inherit', background: '#fff' }}>
                    {DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.t}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '7px', lineHeight: 1.8 }}>
                  تحديد نوع المستند يرفع الدقة كثيراً — لا تتركه على «تعرّف تلقائياً» إن كنت تعرفه.
                </div>

                <button onClick={() => pickFile(aiSource)}
                        style={{ ...btn(true), marginTop: '14px' }}>
                  اختر الملف (PDF أو صورة)
                </button>

                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '16px', lineHeight: 1.9 }}>
                  تُرسل صفحات المستند لخدمة قراءة خارجية ثم تُهمَل — مرصد لا يحفظ الملف.
                  <br />
                  المسح بالـQR ولصق صفحة التحقّق يبقيان أدقّ حين يتوفّران، لأن حروفهما منسوخة لا مقروءة.
                </p>
              </div>
            )}

            {mode === 'link' && (
              <div style={{ marginTop: '18px' }}>
                <label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    رابط صفحة التحقّق
                    {/* It was never required, and a field that looks required
                        stops people who do not have one. */}
                    <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '6px', padding: '2px 8px', fontSize: '10.5px', fontWeight: 800 }}>
                      اختياري
                    </span>
                  </span>
                  <input dir="ltr" value={link}
                         onChange={(e) => { setLink(e.target.value); setLinkError('') }}
                         placeholder={`https://${VIEWCR_HOST}/viewcr?nCrNumber=…`}
                         style={{ width: '100%', padding: '11px 13px', border: `1.5px solid ${linkError ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace' }} />
                </label>
                {linkError && (
                  <div style={{ color: '#B91C1C', fontSize: '12.5px', fontWeight: 700, marginTop: '7px', lineHeight: 1.8 }}>{linkError}</div>
                )}

                {isViewcrUrl(link) && (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'inline-block', background: '#1E2A52', color: '#fff', borderRadius: '9px', padding: '10px 20px', fontSize: '13px', fontWeight: 800, textDecoration: 'none', marginTop: '12px' }}>
                    فتح صفحة السجل ↗
                  </a>
                )}

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '15px 17px', margin: '14px 0 13px', fontSize: '13px', color: '#334155', lineHeight: 2 }}>
                  <div style={{ fontWeight: 800, marginBottom: '6px' }}>أي نص من السجل التجاري يصلح</div>
                  <div>صفحة منصة الأعمال، أو شهادة السجل، أو نص منسوخ من ملف PDF.</div>
                  <div>لا يهم ترتيب الأسطر ولا الفراغات — النص غير المرتّب مقروء أيضاً.</div>
                  <div style={{ color: '#64748B' }}>
                    الحروف منسوخة لا مقروءة ضوئياً، فالاستخراج مطابق — ولا تُستخرج قيمة
                    غير موجودة حرفياً في النص الذي لصقته.
                  </div>
                </div>

                <textarea value={pasted} onChange={(e) => setPasted(e.target.value)}
                          rows={7} placeholder="الصق نص السجل التجاري هنا…"
                          style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E2E8F0', borderRadius: '11px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />

                <button onClick={() => {
                          if (link.trim() && !isViewcrUrl(link)) {
                            setLinkError(`الرابط يجب أن يكون من ${VIEWCR_HOST} — الروابط الأخرى لا تُقبل كمصدر رسمي.`)
                            return
                          }
                          const out = extractForForm(pasted)
                          // The verification link rides along with the reading,
                          // so the record still says where it can be checked.
                          if (isViewcrUrl(link.trim())) out.meta = { ...out.meta, url: link.trim() }
                          setResult(out)
                        }}
                        disabled={!pasted.trim()}
                        style={{ ...btn(true), marginTop: '11px', background: pasted.trim() ? '#1E2A52' : '#CBD5E1' }}>
                  استخراج بيانات السجل
                </button>
              </div>
            )}

            {mode === 'qr' && (
              <div style={{ marginTop: '18px' }}>
                {camError ? (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '11px', padding: '14px 16px', fontSize: '13.5px', fontWeight: 700, lineHeight: 1.8 }}>
                    {camError}
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} playsInline muted
                           style={{ width: '100%', maxHeight: '340px', objectFit: 'cover', background: '#0F172A', borderRadius: '13px' }} />
                    <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginTop: '9px', textAlign: 'center' }}>
                      يجري البحث عن رمز QR… ثبّت الكاميرا على الرمز
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Exact, because a privacy claim that is slightly too broad is worse
                than none. The document genuinely never leaves the browser. The
                OCR engine, however, is fetched from a CDN the first time it runs
                — that is a different fact and it is stated as one. */}
            <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '18px', lineHeight: 1.9 }}>
              تتم قراءة المستند داخل متصفحك — لا يُرفع الملف ولا الصورة إلى أي خادم،
              ولا يوجد ربط مع وزارة التجارة أو مركز الأعمال في هذه المرحلة.
              <br />
              يُنزَّل محرّك القراءة الضوئية من مصدره عند أول استخدام فقط (بضعة ميغابايت)،
              ثم يُخزَّن في المتصفح.
            </p>
          </>
        )}

        {/* ---- working ---- */}
        {busy && (
          <div style={{ marginTop: '26px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
              {progress.note || 'يقرأ المستند…'}
            </div>
            <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: '#1E2A52', transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '10px', lineHeight: 1.8 }}>
              قراءة المستندات العربية تستغرق وقتاً — لا تُغلق هذه النافذة.
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '11px', padding: '14px 16px', marginTop: '18px', fontSize: '13.5px', fontWeight: 700 }}>
            {error}
          </div>
        )}

        {/* ---- review ---- */}
        {result && !busy && (
          <div style={{ marginTop: '20px' }}>
            {result.note && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '11px', padding: '13px 16px', marginBottom: '16px', fontSize: '13px', fontWeight: 700, lineHeight: 1.8 }}>
                {result.note}
              </div>
            )}

            <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                {filled.length} حقل جاهز
              </span>
              <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                {missing.length} تحتاج إكمالاً يدوياً
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px' }}>
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const got = result.fields?.[key]
                const touched = key in edited
                const conf = got && !touched ? CONFIDENCE[got.confidence] : null
                const off = dropped.has(key)
                return (
                  <label key={key}
                         onMouseEnter={() => setHovered(key)}
                         onFocus={() => setHovered(key)}
                         style={{ opacity: off ? 0.45 : 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '5px', flexWrap: 'wrap' }}>
                      {label}
                      {conf && (
                        <span style={{ background: conf.bg, color: conf.color, borderRadius: '6px', padding: '2px 7px', fontSize: '10.5px', fontWeight: 800 }}>
                          {conf.label}
                        </span>
                      )}
                      {touched && (
                        <span style={{ background: '#EEF2FF', color: '#1E40AF', borderRadius: '6px', padding: '2px 7px', fontSize: '10.5px', fontWeight: 800 }}>عدّلته</span>
                      )}
                      {got?.value && (
                        <button type="button"
                                onClick={() => setDropped((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(key)) next.delete(key); else next.add(key)
                                  return next
                                })}
                                style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: off ? '#1E40AF' : '#94A3B8', padding: 0 }}>
                          {off ? 'أعِده' : 'استبعده'}
                        </button>
                      )}
                    </span>
                    <input value={valueOf(key)}
                           onChange={(e) => setEdited((s) => ({ ...s, [key]: e.target.value }))}
                           placeholder={got?.raw && !got.value ? String(got.raw) : 'لم يُستخرج — أدخله يدوياً'}
                           style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit',
                                    border: `1.5px solid ${conf ? conf.color + '55' : '#E2E8F0'}`,
                                    background: conf ? conf.bg : '#fff' }} />
                  </label>
                )
              })}
            </div>

            {result.meta?.lines?.length > 0 && (
              <details style={{ marginTop: '18px' }} open>
                <summary style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                  النص المصدر — مرّر على أي حقل أعلاه ليظهر السطر الذي جاء منه
                </summary>
                <div dir="auto"
                     style={{ marginTop: '9px', maxHeight: '230px', overflowY: 'auto', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', lineHeight: 2 }}>
                  {result.meta.lines.map((line, i) => {
                    const lit = hovered && result.fields?.[hovered]?.sourceIndex === i
                    return (
                      <div key={i}
                           style={{ background: lit ? '#FEF3C7' : 'transparent',
                                    color: lit ? '#92400E' : '#475569',
                                    fontWeight: lit ? 800 : 400,
                                    borderRadius: '5px', padding: '1px 6px' }}>
                        {line}
                      </div>
                    )
                  })}
                </div>
                {hovered && result.fields?.[hovered]?.value && result.fields[hovered].sourceIndex == null && (
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '7px', lineHeight: 1.8 }}>
                    هذا الحقل مستنتج ولم يُقرأ من سطر — {result.fields[hovered].method}
                  </div>
                )}
              </details>
            )}

            {result.unparsed && (
              <details style={{ marginTop: '18px' }}>
                <summary style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                  المحتوى الخام المقروء من المستند
                </summary>
                <textarea readOnly value={result.unparsed} rows={6}
                          onFocus={(e) => e.target.select()}
                          style={{ width: '100%', marginTop: '9px', padding: '11px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '12.5px', fontFamily: 'monospace', direction: 'ltr', resize: 'vertical' }} />
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                  انقر داخل الصندوق لتحديد المحتوى ونسخه.
                </div>
              </details>
            )}

            {/* A QR on these certificates is usually a link to a verification page
                that renders in JavaScript — there is nothing in its HTML to read,
                and the portal sits behind an anti-automation challenge, so it is
                not something to pull from a server. Opening it and copying the
                page is what a scraper extension does too, and it yields exact
                text rather than a reading of a photograph. */}
            {/* What the portal showed that the form has no box for. Displayed
                rather than hidden: it is stored with the record, so the person
                approving the import should see it. */}
            {result.extras && Object.keys(result.extras).length > 0 && (
              <details style={{ marginTop: '18px' }} open>
                <summary style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                  بيانات رسمية إضافية تُحفظ مع السجل
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '10px', marginTop: '10px' }}>
                  {Object.entries(result.extras).map(([k, v]) => (
                    <div key={k} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700 }}>{EXTRA_LABELS[k] || k}</div>
                      <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, marginTop: '3px', lineHeight: 1.7 }}>
                        {Array.isArray(v) ? v.join('، ') : String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {result.meta?.reader && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 16px', marginTop: '14px', fontSize: '12.5px', color: '#475569', fontWeight: 700, lineHeight: 1.9 }}>
                قُرئ المستند آلياً — راجع الحقول، وخاصّة الموسومة «تخمين».
                {result.meta.detected && ` تعرّف عليه كـ${DOC_TYPES.find((d) => d.v === result.meta.detected)?.t || result.meta.detected}.`}
                {typeof result.meta.remaining === 'number' && ` بقي لك ${result.meta.remaining} قراءة اليوم.`}
              </div>
            )}

            {result.meta?.url && (
              <div style={{ background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: '11px', padding: '13px 16px', marginTop: '14px', fontSize: '12.5px', color: '#15803D', fontWeight: 700, lineHeight: 1.9 }}>
                يُحفظ رابط صفحة التحقّق مع سجل الشركة للرجوع إليه ومطابقته لاحقاً.
              </div>
            )}

            <div style={{ display: 'flex', gap: '9px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button onClick={apply} disabled={!filled.length} style={btn(true)}>
                تعبئة النموذج بـ {filled.length} حقل
              </button>
              <button onClick={reset} style={btn(false)}>استيراد من مصدر آخر</button>
              <button onClick={onClose} style={btn(false)}>إلغاء</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
