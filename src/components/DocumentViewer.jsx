import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/api'

/**
 * The document, on screen, where the decision is being made.
 *
 * ============================================================================
 * Why this exists
 * ============================================================================
 * Verifying a document meant downloading it. The reviewer left the company
 * file, opened a PDF in whatever their machine opens PDFs with, read it there,
 * came back, and clicked a button on a row whose contents they were now
 * recalling from memory. Everything that makes a verification worth anything —
 * does the name match, is the number the one on file, has it expired — was
 * being done against a window that is not this one.
 *
 * So the document renders here, beside the decision.
 *
 * ============================================================================
 * pdfjs, and why it is imported the way it is
 * ============================================================================
 * The library is several megabytes. It is loaded on first open of a PDF and
 * never for an image, because most of what companies send are photographs of
 * paper and nobody should pay for a PDF renderer to look at a JPEG. The worker
 * is bundled by Vite rather than fetched from a CDN — nothing here should need
 * the open internet at the moment somebody is reviewing a document.
 *
 * The pattern matches src/lib/companyImport/pageImages.js, which already does
 * this for the import flow; the same reasoning about worker source and white
 * page backgrounds applies, and is not re-derived here.
 *
 * ============================================================================
 * The URL is signed and short-lived
 * ============================================================================
 * `company-documents` is private. A link is minted when the viewer opens and
 * expires; it is never stored, because a URL to somebody's commercial
 * registration that outlives the review is a copy of that document loose in the
 * world.
 */

const BUCKET = 'company-documents'
const SIGN_SECONDS = 300

const isPdf = (name, mime) =>
  (mime || '').includes('pdf') || /\.pdf$/i.test(name || '')

export default function DocumentViewer ({ open, docKey, fileName, mimeType, onClose, title }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [rotate, setRotate] = useState(0)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const panel = useRef(null)

  const pdf = isPdf(fileName, mimeType)

  // A signed link, made now and not kept.
  useEffect(() => {
    if (!open || !docKey) return
    let alive = true
    setLoading(true); setError(''); setUrl(null)
    setPage(1); setPages(0); setRotate(0); setScale(1.2)

    // الصفوف التي سبقت وجود الـ bucket تخزّن الملف نفسه في العمود — data: —
    // وبعضها رابط كامل. توقيع هذه يفشل، والفشل يظهر «تعذّر فتح المستند» على
    // مستند سليم. تُقرأ القيمة كما هي بدل افتراض شكل واحد، وهو نفس ما تفعله
    // شاشة المستندات منذ أن ظهرت الحالتان معاً.
    if (docKey.startsWith('data:') || docKey.startsWith('http')) {
      setUrl(docKey)
      setLoading(false)
      return () => { alive = false }
    }

    getSupabase().storage.from(BUCKET).createSignedUrl(docKey, SIGN_SECONDS)
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) throw e
        setUrl(data.signedUrl)
      })
      .catch((e) => { if (alive) setError(e.message || 'تعذّر فتح المستند') })
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [open, docKey])

  // Load the PDF once the link exists. Images need none of this.
  useEffect(() => {
    if (!open || !url || !pdf) return
    let alive = true
    setLoading(true)

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
        const doc = await pdfjs.getDocument({ url }).promise
        if (!alive) return
        pdfRef.current = doc
        setPages(doc.numPages)
      } catch (e) {
        if (alive) setError(e?.message || 'تعذّر قراءة الملف')
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      pdfRef.current?.destroy?.()
      pdfRef.current = null
    }
  }, [open, url, pdf])

  const draw = useCallback(async () => {
    const doc = pdfRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    try {
      const p = await doc.getPage(page)
      const viewport = p.getViewport({ scale, rotation: rotate })
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      // A PDF page carries no background; without this anything transparent
      // renders onto black and the text disappears into it.
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await p.render({ canvasContext: ctx, viewport, canvas }).promise
    } catch (e) {
      setError(e?.message || 'تعذّر عرض الصفحة')
    }
  }, [page, scale, rotate])

  useEffect(() => { if (pages) draw() }, [pages, draw])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (!pdf) return
      if (e.key === 'ArrowLeft') setPage((p) => Math.min(pages, p + 1))
      if (e.key === 'ArrowRight') setPage((p) => Math.max(1, p - 1))
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, pdf, pages])

  if (!open) return null

  const btn = {
    padding: '7px 13px', borderRadius: '8px', border: '1.5px solid #E2E8F0',
    background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800,
    cursor: 'pointer', fontFamily: 'inherit',
  }
  const ghost = { ...btn, border: 0, background: 'transparent', color: '#CBD5E1' }

  return (
    <div role="dialog" aria-modal="true" aria-label={`عرض ${title || fileName || 'المستند'}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.72)', zIndex: 140,
        display: 'flex', flexDirection: 'column',
      }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '12px 18px', background: '#0F172A', flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || fileName || 'مستند'}
          </div>
          {fileName && title && (
            <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>{fileName}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
          {pdf && pages > 1 && (
            <>
              <button style={ghost} onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1} aria-label="الصفحة السابقة">‹</button>
              <span style={{ fontSize: '12.5px', color: '#CBD5E1', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {page} / {pages}
              </span>
              <button style={ghost} onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages} aria-label="الصفحة التالية">›</button>
            </>
          )}
          <button style={ghost} onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))} aria-label="تصغير">−</button>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontVariantNumeric: 'tabular-nums', minWidth: '42px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button style={ghost} onClick={() => setScale((s) => Math.min(4, +(s + 0.2).toFixed(2)))} aria-label="تكبير">+</button>
          <button style={ghost} onClick={() => setRotate((r) => (r + 90) % 360)} aria-label="تدوير">⟳</button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>
              فتح في تبويب
            </a>
          )}
          <button onClick={onClose} style={btn}>إغلاق</button>
        </div>
      </div>

      {/* Stage */}
      <div ref={panel} tabIndex={-1} style={{
        flex: 1, overflow: 'auto', padding: '20px', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', outline: 'none',
      }}>
        {error ? (
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '26px', maxWidth: '440px',
            textAlign: 'center', marginTop: '40px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#B91C1C', marginBottom: '8px' }}>
              تعذّر عرض المستند
            </div>
            <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.9 }}>{error}</div>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{ ...btn, display: 'inline-block', marginTop: '14px', textDecoration: 'none' }}>
                محاولة فتحه في تبويب
              </a>
            )}
          </div>
        ) : loading ? (
          <div style={{ color: '#CBD5E1', fontSize: '13.5px', fontWeight: 700, marginTop: '60px' }}>
            جارٍ تحميل المستند…
          </div>
        ) : pdf ? (
          <canvas ref={canvasRef} style={{
            background: '#fff', borderRadius: '4px', boxShadow: '0 10px 40px rgba(0,0,0,.4)',
            maxWidth: '100%', height: 'auto',
          }} />
        ) : url ? (
          <img src={url} alt={fileName || 'مستند'} style={{
            maxWidth: '100%', borderRadius: '4px', boxShadow: '0 10px 40px rgba(0,0,0,.4)',
            transform: `rotate(${rotate}deg) scale(${scale})`, transformOrigin: 'top center',
            transition: 'transform .15s ease',
          }} />
        ) : null}
      </div>
    </div>
  )
}
