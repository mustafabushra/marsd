import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/api'
import { inspectFile } from '../lib/fileSafety'
import { uploadViaGateway } from '../lib/uploadViaGateway'
import { LIMITS } from '../lib/validate.js'

/**
 * «الإبلاغ عن مشكلة» — a route to Marsad from inside the product.
 *
 * There was none. Someone looking at a broken screen, a wrong figure on their
 * own file, or a subscription that did not activate had two exits, and neither
 * fit: the report form is for reporting *other companies* and lands in a review
 * queue, and a clarification thread can only be opened by Marsad. The rest was
 * finding an email address.
 *
 * ============================================================================
 * Why the attachments are the point
 * ============================================================================
 * «It does not work» cannot be acted on; a screenshot can. Whoever is writing
 * this is looking at something we cannot see, and the cheapest way to carry it
 * across is to let them hand over the picture. Everything else on the form is
 * arranged around getting that file attached without effort — the drop zone is
 * the largest thing in the dialog, and the field above it is one sentence.
 *
 * The limits are the ones report evidence already uses — five files, ten
 * megabytes, PDF and images. A second set of rules for the same act of
 * attaching a file is a second set to keep in step.
 *
 * ============================================================================
 * Two phases, because the storage path needs a ticket id
 * ============================================================================
 * Files are held in memory while the form is open and uploaded once the RPC
 * returns an id — the same shape as ReportAttachments, and for the same reason:
 * uploading first to a temporary place and moving them after leaves an orphan
 * behind every abandoned draft.
 *
 * A ticket that saved is not rolled back because an attachment failed. The
 * problem is reported either way, and losing the description because the third
 * screenshot did not upload would be the worse outcome. What failed is named.
 */

const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024
const BUCKET = 'support-attachments'

const TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'صورة',
  'image/png': 'صورة',
  'image/webp': 'صورة',
}

// The five the database accepts. Kept in the same order as the constraint so
// the two can be read against each other.
const KINDS = [
  { v: 'technical', t: 'مشكلة تقنية في المنصة' },
  { v: 'data', t: 'خطأ في بيانات معروضة' },
  { v: 'billing', t: 'الاشتراك أو الدفع' },
  { v: 'suggestion', t: 'اقتراح تحسين' },
  { v: 'other', t: 'ملاحظات عامة' },
]

const size = (n) => (n > 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} م.ب`
  : `${Math.max(1, Math.round(n / 1024))} ك.ب`)

const keyFor = (ticketId, file) =>
  `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-؀-ۿ]+/g, '_')}`

const isImage = (f) => (f.type || '').startsWith('image/')

export default function SupportDialog ({ open, onClose }) {
  const [kind, setKind] = useState('technical')
  const [details, setDetails] = useState('')
  const [files, setFiles] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [over, setOver] = useState(false)
  const input = useRef(null)
  const panel = useRef(null)

  // Reset on each opening. A dialog that reopens holding the last complaint is
  // a dialog that sends the last complaint twice.
  useEffect(() => {
    if (!open) return
    setKind('technical'); setDetails(''); setFiles([])
    setNote(''); setError(''); setDone(null); setBusy(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    // The dialog takes focus so a keyboard user is inside it, not behind it.
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  // async: فحص التوقيع يقرأ أول بايتات الملف، وقراءة الملف غير متزامنة.
  const add = async (chosen) => {
    const next = [...files]
    const rejected = []
    for (const f of Array.from(chosen || [])) {
      if (next.length >= MAX_FILES) { rejected.push(`${f.name}: تجاوز ${MAX_FILES} ملفات`); continue }
      if (!TYPES[f.type]) { rejected.push(`${f.name}: نوع غير مقبول`); continue }
      // التوقيع الفعلي، لا النوع المُعلَن.
      //
      // `accept` اقتراحٌ لمربّع الاختيار، و allowed_mime_types في الدلو يفحص
      // الترويسة التي يرسلها العميل — كلاهما يقول ما ادّعاه المُرسِل. هذا يقرأ
      // أول بايتات الملف، فيردّ ملفاً تنفيذياً سُمّي .pdf قبل أن يُرفع.
      const verdict = await inspectFile(f, { maxBytes: MAX_BYTES })
      if (!verdict.ok) { rejected.push(`${f.name}: ${verdict.reason}`); continue }
      if (next.some((x) => x.name === f.name && x.size === f.size)) {
        rejected.push(`${f.name}: مضاف بالفعل`); continue
      }
      next.push(f)
    }
    // Said, not swallowed. A file that silently does not appear reads as a
    // broken control, and the person picks the same file again.
    setNote(rejected.join(' · '))
    setFiles(next)
  }

  const remove = (i) => { setFiles(files.filter((_, x) => x !== i)); setNote('') }

  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (details.trim().length < 10) {
      setError('اكتب وصفاً لا يقلّ عن ١٠ أحرف حتى نتمكّن من المتابعة')
      return
    }
    setBusy(true); setError('')
    try {
      const sb = getSupabase()
      const { data: ticketId, error: rpcErr } = await sb.rpc('submit_support_ticket', {
        p_kind: kind,
        p_details: details.trim(),
        p_page_url: window.location.pathname + window.location.search,
        p_user_agent: navigator.userAgent,
      })
      if (rpcErr) throw rpcErr

      const failed = []
      for (const f of files) {
        const key = keyFor(ticketId, f)
        try {
          // عبر بوّابة الفحص. والمسار العائد هو ما استقرّ فعلاً — البوّابة
          // تُصحّح الامتداد ليطابق المحتوى.
          const { path: storedKey } = await uploadViaGateway(f, {
            targetBucket: BUCKET, targetPath: key,
          })
          // `.select()` because an insert filtered out by RLS returns no error
          // and no rows, leaving the file in the bucket attached to nothing.
          const { data, error: rowErr } = await sb.from('support_ticket_attachments')
            .insert([{
              ticket_id: ticketId,
              s3_key: storedKey,
              file_name: f.name,
              mime_type: f.type || null,
              file_size: f.size,
            }]).select('id')
          if (rowErr) throw rowErr
          if (!data?.length) throw new Error('لم يُسجَّل المرفق')
        } catch (err) {
          console.error('Support attachment failed:', f.name, err)
          failed.push(f.name)
        }
      }
      // The ticket is not rolled back for a failed upload. It is reported
      // either way, and this says exactly what did not arrive.
      setDone({ id: ticketId, failed })
    } catch (err) {
      setError(err?.message || 'تعذّر إرسال البلاغ')
    } finally {
      setBusy(false)
    }
  }

  const label = { fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '7px', display: 'block' }
  const field = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px',
    border: '1.5px solid #E2E8F0', borderRadius: '10px', background: '#F8FAFC',
    fontSize: '14px', fontFamily: 'inherit', color: '#0F172A',
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="الإبلاغ عن مشكلة"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        // Above the mobile drawer, which is 120 with its scrim at 119. This was
        // 90, so opening the dialog while the menu was open put the dialog
        // behind the menu — unreachable, and invisible to any test that opened
        // it at desktop width and resized afterwards.
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 130,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px',
      }}>
      <div ref={panel} tabIndex={-1} dir="rtl" style={{
        background: '#fff', borderRadius: '16px', width: 'min(620px, 100%)',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(15,23,42,.28)', outline: 'none',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', padding: '18px 22px', borderBottom: '1px solid #E2E8F0',
        }}>
          <h2 style={{ fontSize: '16.5px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
            الإبلاغ عن مشكلة
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق"
            style={{
              background: 'none', border: 0, color: '#64748B', fontSize: '20px',
              lineHeight: 1, cursor: busy ? 'default' : 'pointer', padding: '2px 6px',
              fontFamily: 'inherit',
            }}>✕</button>
        </div>

        {done ? (
          <div style={{ padding: '30px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: '34px', lineHeight: 1, marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', marginBottom: '7px' }}>
              وصلنا بلاغك
            </div>
            <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 6px', lineHeight: 2 }}>
              رقم البلاغ <code style={{ color: '#1E2A52', fontWeight: 800 }}>{String(done.id).slice(0, 8)}</code>
              {' '}— سنعود إليك على بريدك المسجّل.
            </p>
            {done.failed.length > 0 && (
              <p style={{ fontSize: '12.5px', color: '#B45309', margin: '10px 0 0', lineHeight: 1.9 }}>
                لم تُرفَع {done.failed.length} من المرفقات ({done.failed.join('، ')}) — البلاغ مُسجَّل،
                ويمكنك إرسالها لاحقاً.
              </p>
            )}
            <button type="button" onClick={onClose} style={{
              marginTop: '18px', padding: '10px 26px', borderRadius: '10px', border: 0,
              background: '#16A34A', color: '#fff', fontSize: '13.5px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>تمّ</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'contents' }}>
            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
              {/* نوع البلاغ */}
              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="sup-kind" style={label}>نوع البلاغ</label>
                <select id="sup-kind" value={kind} onChange={(e) => setKind(e.target.value)}
                  disabled={busy} style={{ ...field, cursor: 'pointer' }}>
                  {KINDS.map((k) => <option key={k.v} value={k.v}>{k.t}</option>)}
                </select>
              </div>

              {/* تفاصيل البلاغ */}
              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="sup-details" style={label}>تفاصيل البلاغ</label>
                <textarea maxLength={LIMITS.description} id="sup-details" value={details} disabled={busy}
                  onChange={(e) => { setDetails(e.target.value); setError('') }}
                  placeholder="يرجى وصف المشكلة بوضوح — ماذا كنت تفعل، وماذا حدث، وماذا توقّعت أن يحدث."
                  rows={5}
                  style={{ ...field, resize: 'vertical', minHeight: '110px', lineHeight: 1.9 }} />
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '5px' }}>
                  {details.trim().length} / ٤٠٠٠
                </div>
              </div>

              {/* المرفقات */}
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: '10px', marginBottom: '7px',
              }}>
                <span style={{ ...label, marginBottom: 0 }}>
                  المرفقات <span style={{ color: '#94A3B8', fontWeight: 700 }}>(اختياري)</span>
                </span>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                  {files.length}/{MAX_FILES} مرفقات
                </span>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setOver(false)
                  if (!busy) add(e.dataTransfer.files)
                }}
                onClick={() => { if (!busy) input.current?.click() }}
                style={{
                  border: `2px dashed ${over ? '#16A34A' : '#CBD5E1'}`,
                  background: over ? '#F0FDF4' : '#F8FAFC',
                  borderRadius: '12px', padding: '26px 18px', textAlign: 'center',
                  cursor: busy ? 'default' : 'pointer', transition: 'border-color .15s, background .15s',
                }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '50%', background: '#EEF2F7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px', fontSize: '18px',
                }}>📎</div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>
                  اسحب وأفلت الملفات هنا
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '3px' }}>
                  أو انقر للتصفح من جهازك
                </div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '8px' }}>
                  صور أو PDF، حتى ١٠ م.ب للملف
                </div>
                <input ref={input} type="file" multiple hidden
                  accept={Object.keys(TYPES).join(',')}
                  onChange={(e) => { add(e.target.files); e.target.value = '' }} />
              </div>

              {note && (
                <div style={{ fontSize: '12.5px', color: '#B45309', marginTop: '9px', lineHeight: 1.9 }}>
                  {note}
                </div>
              )}

              {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' }}>
                  {files.map((f, i) => (
                    <span key={`${f.name}-${f.size}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '9px',
                      background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px',
                      padding: '8px 11px', maxWidth: '100%',
                    }}>
                      <span style={{ fontSize: '14px', flex: 'none' }}>{isImage(f) ? '🖼️' : '📄'}</span>
                      <span style={{
                        fontSize: '12.5px', fontWeight: 700, color: '#0F172A',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px',
                      }} title={f.name}>{f.name}</span>
                      <span style={{ fontSize: '11px', color: '#94A3B8', flex: 'none' }}>{size(f.size)}</span>
                      <button type="button" onClick={() => remove(i)} disabled={busy}
                        aria-label={`إزالة ${f.name}`}
                        style={{
                          background: 'none', border: 0, color: '#94A3B8', cursor: 'pointer',
                          fontSize: '14px', lineHeight: 1, padding: 0, flex: 'none', fontFamily: 'inherit',
                        }}>✕</button>
                    </span>
                  ))}
                </div>
              )}

              {error && (
                <div role="alert" style={{
                  marginTop: '16px', background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: '10px', padding: '11px 13px', fontSize: '12.5px',
                  color: '#B91C1C', lineHeight: 1.9,
                }}>{error}</div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', gap: '10px', padding: '16px 22px',
              borderTop: '1px solid #E2E8F0', flexWrap: 'wrap',
            }}>
              <button type="submit" disabled={busy} style={{
                padding: '10px 28px', borderRadius: '10px', border: 0,
                background: busy ? '#86EFAC' : '#16A34A', color: '#fff',
                fontSize: '13.5px', fontWeight: 800,
                cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
              <button type="button" onClick={onClose} disabled={busy} style={{
                padding: '10px 24px', borderRadius: '10px', border: '1.5px solid #E2E8F0',
                background: '#fff', color: '#1E2A52', fontSize: '13.5px', fontWeight: 800,
                cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>إلغاء</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
