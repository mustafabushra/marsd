import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { uploadViaGateway } from '../lib/uploadViaGateway'
import { useLiveData } from '../hooks/useLiveData'
import { notifyAdmins } from '../lib/notify'
import { docLabel } from '../lib/enums'
import { LIMITS } from '../lib/validate.js'

/**
 * Where a company answers what Marsad asked it.
 *
 * The admin side could already stop a company's review with a clarification
 * request — the trigger refuses any approval or rejection while one is open, and
 * a notification told the company to "راجع طلبات التوضيح". There was no such
 * screen. The file stopped, the company was told to respond, and had nowhere to
 * do it: a workflow with half a door.
 *
 * It leads the profile whenever a request is open, because an open request is
 * the reason the company's application is not moving, and burying that below
 * anything else would repeat the mistake the notification was already making.
 */

const TYPE_LABEL = {
  information: 'معلومات ناقصة',
  documents: 'مستندات مطلوبة',
  correction: 'تصحيح بيانات',
  verification: 'تحقّق من الهوية',
}

const STATUS = {
  open:     { t: 'بانتظار ردّك', bg: '#FFFBEB', fg: '#B45309' },
  answered: { t: 'أُرسل ردّك',   bg: '#EEF2FF', fg: '#1E40AF' },
  closed:   { t: 'مُغلق',        bg: '#ECFDF5', fg: '#15803D' },
  expired:  { t: 'انتهت المهلة', bg: '#FEF2F2', fg: '#B91C1C' },
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-SA') : null)

export default function ClarificationRequests() {
  const { user } = useUser()
  const [file, setFile] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  // Kept rather than discarded inside load(): the uploader needs it, and
  // re-deriving it per upload would be a second round trip for a value the
  // screen already fetched.
  const [companyId, setCompanyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})
  // Documents attached to a reply, per request: { [requestId]: [{id, name}] }.
  // They are uploaded on selection — the row has to exist before the answer can
  // point at it — and the answer records which ones were meant as its evidence.
  const [attached, setAttached] = useState({})
  const [uploading, setUploading] = useState(null)

  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  /**
   * Attach a document to a reply.
   *
   * Uploads into company_documents — the same table, storage bucket, RLS and
   * verification workflow every other document uses. Nothing new is invented
   * for clarifications; the answer simply records which existing documents it
   * meant.
   *
   * The row has to exist before the reply can reference it, so the upload
   * happens on selection rather than on send. A file picked and never sent is
   * therefore a pending document the company can see and delete — which is
   * better than a reply that fails halfway and leaves nothing behind.
   */
  const attach = async (requestId, docType, file) => {
    if (!file || !companyId || !tenantId) return
    if (file.size > 10 * 1024 * 1024) { showToast('❌ حجم الملف أكبر من 10 ميغابايت'); return }

    setUploading(requestId)
    try {
      const sb = getSupabase()
      const path = `${companyId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`

      // كان هنا سقوطٌ إلى data: عند فشل الرفع، فيُخزَّن الملف نصّاً في العمود
      // بلا فحص. وقد صار ذلك ثغرةً بوجود البوّابة: ما تردّه البوّابة كان
      // أضمن الملفّات وصولاً. فحُذف، وفشل الرفع يُبلَّغ.
      const { path: fileUrl } = await uploadViaGateway(file, {
        targetBucket: 'company-documents', targetPath: path,
      })

      // Read the row back. An insert RLS filters out raises nothing and returns
      // nothing, and a company told its document arrived when it did not will
      // not send it again.
      const { data, error } = await sb.from('company_documents').insert([{
        company_id: companyId,
        uploaded_by_tenant_id: tenantId,
        uploaded_by_user_id: user?.id || null,
        doc_type: docType,
        file_url: fileUrl,
        file_name: file.name,
        status: 'pending',
      }]).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('لم يُحفظ المستند — تحقّق من صلاحيتك')

      setAttached((a) => ({
        ...a,
        [requestId]: [...(a[requestId] || []), { id: data[0].id, name: file.name, docType }],
      }))
      showToast('✅ أُرفق المستند — اضغط «إرسال» لإتمام الرد')
    } catch (e) {
      showToast('❌ ' + (e?.message || 'تعذّر رفع المستند'))
    } finally {
      setUploading(null)
    }
  }

  const load = useCallback(async () => {
    try {
      const sb = getSupabase()
      const { data: me } = await sb
        .from('users').select('tenant_id, tenants:tenant_id ( company_id )')
        .eq('id', user?.id).maybeSingle()
      setTenantId(me?.tenant_id || null)
      const cid = me?.tenants?.company_id
      setCompanyId(cid || null)
      if (!cid) { setLoading(false); return }

      const { data } = await sb.rpc('company_review_file', { p_company_id: cid })
      setFile(data || null)
    } catch (err) {
      console.warn('Clarifications warning:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { if (user?.id) load() }, [user?.id, load])
  useLiveData(load, { tables: ['clarification_requests', 'clarification_messages', 'companies'] })

  const send = async (requestId) => {
    const body = (drafts[requestId] || '').trim()
    const docIds = (attached[requestId] || []).map((d) => d.id)

    // Either will do. The request is usually «أرسل صورة السجل», and demanding a
    // sentence to accompany the file only produces «مرفق».
    if (!body && !docIds.length) {
      showToast('❌ اكتب توضيحاً أو أرفق مستنداً قبل الإرسال'); return
    }
    try {
      setBusy(requestId)
      const { data, error } = await getSupabase().rpc('answer_clarification', {
        p_request_id: requestId, p_body: body, p_document_ids: docIds.length ? docIds : null,
      })
      if (error) throw error
      // The function answers with its own refusal rather than throwing.
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر الإرسال')); return }

      // Tell Marsad the file is ready to move again. Without this the answer
      // sits in a table and the review waits on someone opening a screen.
      await notifyAdmins('clarification_answered', {
        title: 'وصل توضيح من شركة',
        message: `${file?.name || 'شركة'} — ${body.slice(0, 80)}`,
        tenantId,
        meta: { request_id: requestId },
      })

      setDrafts((d) => ({ ...d, [requestId]: '' }))
      setAttached((a) => ({ ...a, [requestId]: [] }))
      showToast(docIds.length
        ? `✅ أُرسل ردّك مع ${docIds.length} مستند — ستتابع إدارة مرصد المراجعة`
        : '✅ أُرسل توضيحك — ستتابع إدارة مرصد المراجعة')
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(null)
    }
  }

  if (loading || !file) return null

  const requests = file.clarifications || []
  if (!requests.length) return null

  const open = requests.filter((r) => r.status === 'open')

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', padding: '24px', marginBottom: '18px',
      border: open.length ? '1px solid #FDE68A' : '1px solid #E2E8F0',
      borderTop: open.length ? '4px solid #B45309' : '1px solid #E2E8F0',
    }}>
      <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>
        طلبات التوضيح
        {open.length > 0 && (
          <span style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '999px', padding: '3px 11px', fontSize: '12.5px', fontWeight: 800, marginInlineStart: '10px' }}>
            {open.length} بانتظار ردّك
          </span>
        )}
      </h2>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        {open.length
          ? 'مراجعة شركتك متوقّفة حتى تردّ على ما طُلب أدناه.'
          : 'أرشيف ما طلبته إدارة مرصد وما رددتَ به.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {requests.map((r) => {
          const st = STATUS[r.status] || STATUS.open
          const overdue = r.due_at && r.status === 'open' && new Date(r.due_at) < new Date()
          return (
            <div key={r.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>{r.reason}</span>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginInlineStart: '10px' }}>
                    {TYPE_LABEL[r.type] || r.type}
                  </span>
                </div>
                <span style={{ background: st.bg, color: st.fg, borderRadius: '999px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{st.t}</span>
              </div>

              {r.details && (
                <p style={{ fontSize: '14px', color: '#334155', margin: '0 0 12px', lineHeight: 1.8 }}>{r.details}</p>
              )}

              {r.documents?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>مستندات مطلوبة:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {r.documents.map((d) => (
                      <span key={d} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                        {docLabel(d)}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '7px' }}>
                    أرفقها مباشرة في ردّك أدناه.
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '14px' }}>
                طُلب في {fmt(r.requested_at)}
                {r.due_at && (
                  <span style={{ color: overdue ? '#B91C1C' : '#64748B', fontWeight: overdue ? 800 : 600 }}>
                    {' · '}{overdue ? 'تجاوز الموعد النهائي' : `المهلة حتى ${fmt(r.due_at)}`}
                  </span>
                )}
              </div>

              {r.messages?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: r.status === 'open' ? '14px' : 0 }}>
                  {r.messages.map((m, i) => (
                    <div key={i} style={{
                      background: m.from_marsad ? '#F8FAFC' : '#EEF2FF',
                      borderRadius: '10px', padding: '11px 14px',
                      alignSelf: m.from_marsad ? 'flex-start' : 'flex-end',
                      maxWidth: '85%',
                    }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: m.from_marsad ? '#64748B' : '#1E40AF', marginBottom: '4px' }}>
                        {m.from_marsad ? 'إدارة مرصد' : 'شركتك'} · {fmt(m.at)}
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    </div>
                  ))}
                </div>
              )}

              {r.status === 'open' && (
                <div>
                  <label htmlFor={`clar-${r.id}`} style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>
                    ردّك
                  </label>
                  <textarea maxLength={LIMITS.description}
                    id={`clar-${r.id}`}
                    value={drafts[r.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    rows={3}
                    placeholder="اكتب المعلومات المطلوبة — أو أرفق المستند وحده دون كتابة"
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  {/* The document goes with the reply, not in another section
                      of another page. The screen used to say «ارفعها من قسم
                      مستندات الشركة أسفل هذه الصفحة، ثم اكتب ردّك هنا» — two
                      disconnected acts for one request, with nothing tying the
                      file to the question it answered. */}
                  <div style={{ marginTop: '11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '10px',
                        padding: '10px 16px', fontSize: '13.5px', fontWeight: 700, color: '#475569',
                        cursor: uploading === r.id ? 'default' : 'pointer',
                      }}>
                        📎 {uploading === r.id ? 'جارٍ الرفع…' : 'أرفق مستنداً'}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          disabled={uploading === r.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            // The first document Marsad asked for, when it named
                            // any — so the file lands under the right heading
                            // without asking the company to classify it.
                            attach(r.id, r.documents?.[0] || 'other', f)
                            e.target.value = ''
                          }}
                          style={{ display: 'none' }} />
                      </label>

                      {(attached[r.id] || []).map((d) => (
                        <span key={d.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: '9px',
                          padding: '8px 12px', fontSize: '12.5px', fontWeight: 700, color: '#15803D',
                        }}>
                          📄 {d.name}
                          <button type="button"
                                  onClick={() => setAttached((a) => ({
                                    ...a, [r.id]: (a[r.id] || []).filter((x) => x.id !== d.id),
                                  }))}
                                  aria-label={`إزالة ${d.name}`}
                                  style={{ background: 'none', border: 0, cursor: 'pointer', color: '#64748B', fontSize: '15px', lineHeight: 1, padding: 0 }}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => send(r.id)}
                    disabled={busy === r.id || (!(drafts[r.id] || '').trim() && !(attached[r.id] || []).length)}
                    style={{
                      marginTop: '12px', padding: '11px 24px',
                      background: ((drafts[r.id] || '').trim() || (attached[r.id] || []).length) ? '#1E2A52' : '#CBD5E1',
                      color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800,
                      cursor: ((drafts[r.id] || '').trim() || (attached[r.id] || []).length) ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                    }}>
                    {busy === r.id ? 'جارٍ الإرسال…' : 'إرسال التوضيح'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 300 }}>{toast}</div>
      )}
    </div>
  )
}
