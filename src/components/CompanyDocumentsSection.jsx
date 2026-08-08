import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/react'
import PhoneHandoff from './PhoneHandoff'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { notifyAdmins } from '../lib/notify'
import { SkeletonPanel } from './Skeleton'

/**
 * The documents section of the company profile.
 *
 * Built around the checklist rather than an upload form. It used to ask which
 * type you were uploading and then take a file, which made filing a zakat
 * certificate as a municipal licence a one-click mistake nothing could catch
 * afterwards — the two are both PDFs and both real.
 *
 * Now the document decides the button. Every type the platform expects is listed
 * whether or not it exists, carrying its state and the single action that state
 * allows: missing takes an upload, expired takes a replacement, rejected takes
 * another attempt, verified takes nothing but a look. Both come from
 * company_document_checklist, so what this screen offers and what the database
 * permits cannot drift apart. A mistake that cannot be made needs no validation.
 *
 * Uploading is a claim. Only a document Marsad has verified moves the score, so
 * nothing here promises points for a pending file.
 */

// 15 MB of file. Stored as a data URL when storage is unavailable, which is
// about a third larger than the bytes on disk — so the column guard downstream
// allows 21 MB, and a check written against the encoded length would reject
// files well under the limit this screen advertises.
const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = 'application/pdf,image/png,image/jpeg'

const STATE = {
  verified:          { t: '✅ معتمد',        bg: '#ECFDF5', fg: '#15803D' },
  pending:           { t: '⏳ قيد المراجعة', bg: '#FFFBEB', fg: '#B45309' },
  missing:           { t: '❌ مفقود',        bg: '#F1F5F9', fg: '#64748B' },
  expired:           { t: '⚠ منتهٍ',         bg: '#FEF2F2', fg: '#B91C1C' },
  rejected:          { t: '✕ مرفوض',        bg: '#FEF2F2', fg: '#B91C1C' },
  reupload_required: { t: '🔄 إعادة رفع',    bg: '#FFFBEB', fg: '#B45309' },
  superseded:        { t: 'نسخة سابقة',      bg: '#F1F5F9', fg: '#64748B' },
}

const ACTION = { upload: 'رفع', replace: 'استبدال', reupload: 'إعادة رفع', view: 'عرض' }

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA') : null)

export default function CompanyDocumentsSection() {
  const { user } = useUser()
  const [companyId, setCompanyId] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(null)
  const [openRow, setOpenRow] = useState(null)
  // Which document, if any, is currently being handed off to a phone.
  const [handoff, setHandoff] = useState(null)
  const [versions, setVersions] = useState([])
  const fileInput = useRef(null)
  const pendingType = useRef(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const sb = getSupabase()

      // Read the tenant and company from the user's own row. This component
      // destructured tenantId from useUserRole, which does not return one, so
      // the effect guarded on it never fired and the section rendered nothing.
      const { data: me } = await sb
        .from('users').select('tenant_id, tenants:tenant_id ( company_id )')
        .eq('id', user?.id).maybeSingle()

      setTenantId(me?.tenant_id || null)
      const cid = me?.tenants?.company_id || null
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)

      const { data, error: e } = await sb.rpc('company_document_checklist', { p_company_id: cid })
      if (e) throw e
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المستندات')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { if (user?.id) load() }, [user?.id, load])
  useLiveData(load, { tables: ['company_documents'] })

  // One hidden input for every row: the type is remembered rather than chosen,
  // which is the whole point of the checklist.
  const pick = (docType) => {
    pendingType.current = docType
    fileInput.current?.click()
  }

  const upload = async (file) => {
    const docType = pendingType.current
    if (!file || !companyId || !docType) return
    if (file.size > MAX_BYTES) {
      showToast(`❌ الملف ${(file.size / 1024 / 1024).toFixed(1)} م.ب — الحد الأقصى ١٥ ميجابايت`)
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      showToast('❌ الصيغ المقبولة: PDF أو PNG أو JPG')
      return
    }

    try {
      setBusy(docType)
      const sb = getSupabase()

      // Storage first; the inline fallback is what kept this working before the
      // bucket existed and stays for the same reason.
      let stored = null
      const path = `${companyId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await sb.storage
        .from('company-documents').upload(path, file, { contentType: file.type })
      if (!upErr) stored = path
      else console.warn('Storage upload failed, falling back to inline:', upErr.message)

      const fileUrl = stored || await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(file)
      })

      // Read the row back: an insert RLS filters out raises nothing and returns
      // nothing, and a company told its paperwork arrived when it did not will
      // not send it again.
      const { data, error: e } = await sb.from('company_documents').insert([{
        company_id: companyId,
        uploaded_by_tenant_id: tenantId,
        uploaded_by_user_id: user?.id || null,
        doc_type: docType,
        file_url: fileUrl,
        file_name: file.name,
        status: 'pending',
      }]).select('id')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ المستند — تحقّق من صلاحيتك')

      const label = items.find((i) => i.doc_type === docType)?.label || docType
      await notifyAdmins('document_submitted', {
        title: 'مستند جديد بانتظار التوثيق',
        message: `${label} — ${file.name}`,
        tenantId,
        meta: { company_id: companyId, doc_type: docType },
      })

      showToast('✅ أُرسل المستند — ستراجعه إدارة مرصد')
      load()
    } catch (err) {
      showToast('❌ تعذّر الرفع: ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(null)
      pendingType.current = null
    }
  }

  /** Open a document, whichever way it was stored: a data URL directly, a
      storage path through a signed link because the bucket is private. */
  const openFile = async (documentId) => {
    if (!documentId) return
    const { data: row } = await getSupabase()
      .from('company_documents').select('file_url').eq('id', documentId).maybeSingle()
    const url = row?.file_url
    if (!url) { showToast('❌ لا ملف مرفق'); return }
    if (url.startsWith('data:') || url.startsWith('http')) { window.open(url, '_blank'); return }
    const { data, error: e } = await getSupabase().storage
      .from('company-documents').createSignedUrl(url, 60)
    if (e || !data?.signedUrl) { showToast('❌ تعذّر فتح المستند'); return }
    window.open(data.signedUrl, '_blank')
  }

  const openPanel = async (row) => {
    setOpenRow(row)
    setVersions([])
    const { data } = await getSupabase().rpc('document_versions', {
      p_company_id: companyId, p_doc_type: row.doc_type,
    })
    setVersions(Array.isArray(data) ? data : [])
  }

  if (loading) {
    return (
      <SkeletonPanel rows={3} title={false} />
    )
  }

  if (!companyId) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>مستندات الشركة</h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, lineHeight: 1.8 }}>
          لا توجد شركة مرتبطة بحسابك، فلا مكان تُرفع إليه المستندات.
          إن كان حسابك من إدارة مرصد فهذه شاشة الشركات — راجع لوحة الإدارة.
        </p>
      </div>
    )
  }

  const done = items.filter((i) => i.state === 'verified').length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const missing = items.filter((i) => ['missing', 'expired', 'rejected', 'reupload_required'].includes(i.state))

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
      <input ref={fileInput} type="file" accept={ACCEPT} style={{ display: 'none' }}
             onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />

      <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>مستندات الشركة</h2>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px' }}>
        كل مستند توثّقه إدارة مرصد يرفع الطبقة الرسمية في مؤشر ثقتك — والمعلَّق لا يؤثّر حتى يُراجَع.
      </p>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 15px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#B91C1C', fontSize: '13.5px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      {/* Completion first, and the gaps named. Someone who has to work out what
          is missing from a list of nine rows will not do it. */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>اكتمال المستندات</span>
          <span style={{ fontSize: '20px', fontWeight: 900, color: '#1E2A52', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
        <div style={{ height: '10px', background: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '5px', background: pct >= 70 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#DC2626' }}></div>
        </div>
        <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '8px' }}>
          {done} من {items.length} مستنداً معتمداً
        </div>

        {missing.length > 0 && (
          <div style={{ marginTop: '14px', paddingTop: '13px', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#B45309', marginBottom: '8px' }}>يحتاج منك:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {missing.map((m) => (
                <button key={m.doc_type} onClick={() => pick(m.doc_type)}
                        style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {items.map((i) => {
          const st = STATE[i.state] || STATE.missing
          const isView = i.action === 'view'
          return (
            <div key={i.doc_type} style={{
              border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'center',
            }}>
              <div style={{ minWidth: '210px' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>
                  {i.label}
                  {i.required && <span style={{ color: '#B91C1C', marginRight: '5px' }}>*</span>}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                  {i.file_name || 'لم يُرفع بعد'}
                  {i.expires_at && ` · ينتهي ${fmt(i.expires_at)}`}
                  {i.versions > 1 && ` · ${i.versions} نسخ`}
                </div>
                {i.rejection_reason && ['rejected', 'reupload_required'].includes(i.state) && (
                  <div style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700, marginTop: '5px' }}>
                    سبب الرفض: {i.rejection_reason}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ background: st.bg, color: st.fg, borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{st.t}</span>

                {/* One action, decided by the state rather than by the user. */}
                <button onClick={() => (isView ? openFile(i.document_id) : pick(i.doc_type))}
                        disabled={busy === i.doc_type}
                        style={{
                          padding: '8px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: 800,
                          border: isView ? '1.5px solid #E2E8F0' : 0,
                          background: isView ? '#fff' : '#1E2A52',
                          color: isView ? '#1E2A52' : '#fff',
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}>
                  {busy === i.doc_type ? '…' : ACTION[i.action] || 'عرض'}
                </button>

                {/* The same document, from the phone that is holding it.

                    Offered only where an upload is what is being asked for.
                    Next to «عرض» it would be an invitation to replace a
                    document nobody asked to replace. */}
                {!isView && (
                  <button onClick={() => setHandoff(i)}
                          className="marsad-desk-only"
                          title="امسح رمزاً بجوالك وارفع المستند من هناك"
                          style={{
                            padding: '8px 14px', borderRadius: '9px', fontSize: '13px',
                            fontWeight: 800, border: '1.5px solid #E2E8F0', background: '#fff',
                            color: '#1E2A52', cursor: 'pointer', fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                          }}>
                    📱 من الجوال
                  </button>
                )}

                {i.document_id && (
                  <button onClick={() => openPanel(i)}
                          style={{ background: 'none', border: 0, color: '#64748B', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    تفاصيل
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* The handoff, in a dialog of its own.

          Centred rather than a side panel: the QR code is the whole content and
          a person is about to hold a phone up to it. The stylesheet turns a
          fixed inset-0 overlay into a bottom sheet below 720px, which is right
          for every other dialog and wrong for this one — but a phone showing a
          QR code for its own camera is not a case that happens. */}
      {handoff && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setHandoff(null) }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '380px', borderRadius: '18px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setHandoff(null)} aria-label="إغلاق"
                      style={{ background: 'none', border: 0, fontSize: '22px', color: '#64748B', cursor: 'pointer', lineHeight: 1, minHeight: '44px', minWidth: '44px' }}>×</button>
            </div>
            <PhoneHandoff
              docType={handoff.doc_type}
              docLabel={handoff.label}
              companyId={companyId}
              onArrived={() => { load(); showToast('✅ وصل المستند من جوالك — ستراجعه إدارة مرصد') }}
              onClose={() => setHandoff(null)}
            />
          </div>
        </div>
      )}

      {openRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', justifyContent: 'flex-start', zIndex: 200 }}
             onClick={(e) => { if (e.target === e.currentTarget) setOpenRow(null) }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '440px', height: '100%', overflowY: 'auto', padding: '26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{openRow.label}</h3>
              <button onClick={() => setOpenRow(null)} aria-label="إغلاق"
                      style={{ background: 'none', border: 0, fontSize: '22px', color: '#64748B', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginBottom: '22px' }}>
              {[
                ['الحالة', (STATE[openRow.state] || STATE.missing).t],
                ['تاريخ الرفع', fmt(openRow.uploaded_at)],
                ['تاريخ الاعتماد', fmt(openRow.verified_at)],
                ['تاريخ الانتهاء', fmt(openRow.expires_at)],
                ['المراجع', openRow.reviewer],
                ['سبب الرفض', openRow.rejection_reason],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px' }}>
                  <span style={{ color: '#64748B', fontWeight: 700 }}>{k}</span>
                  <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'left' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '9px', marginBottom: '22px', flexWrap: 'wrap' }}>
              {openRow.document_id && (
                <button onClick={() => openFile(openRow.document_id)}
                        style={{ padding: '10px 18px', border: '1.5px solid #E2E8F0', borderRadius: '9px', background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  عرض
                </button>
              )}
              <button onClick={() => { const t = openRow.doc_type; setOpenRow(null); pick(t) }}
                      style={{ padding: '10px 18px', border: 0, borderRadius: '9px', background: '#1E2A52', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                رفع نسخة جديدة
              </button>
            </div>

            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>سجلّ النسخ</div>
            {versions.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>لا نسخ سابقة.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {versions.map((v) => (
                  <div key={v.id} style={{ background: '#F8FAFC', borderRadius: '9px', padding: '11px 13px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                      {v.file_name || 'ملف'} — {(STATE[v.status] || { t: v.status }).t}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                      رُفع {fmt(v.uploaded_at)}
                      {v.verified_at && ` · اعتُمد ${fmt(v.verified_at)}`}
                      {v.superseded_at && ` · استُبدل ${fmt(v.superseded_at)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 300 }}>{toast}</div>
      )}
    </div>
  )
}
