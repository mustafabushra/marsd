import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { notifyAdmins } from '../lib/notify'

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

const DOC_LABEL = {
  commercial_registration: 'السجل التجاري',
  articles_of_incorporation: 'عقد التأسيس',
  vat_certificate: 'شهادة ضريبة القيمة المضافة',
  zakat_certificate: 'شهادة الزكاة',
  gosi_certificate: 'شهادة التأمينات الاجتماعية',
  municipal_license: 'الرخصة البلدية',
  national_address: 'العنوان الوطني',
  chamber_membership: 'عضوية الغرفة التجارية',
  owner_id: 'هوية المالك أو المفوَّض',
  license: 'ترخيص النشاط',
  bank_letter: 'خطاب بنكي',
}

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
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      const sb = getSupabase()
      const { data: me } = await sb
        .from('users').select('tenant_id, tenants:tenant_id ( company_id )')
        .eq('id', user?.id).maybeSingle()
      setTenantId(me?.tenant_id || null)
      const cid = me?.tenants?.company_id
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
    if (!body) { showToast('❌ اكتب توضيحك قبل الإرسال'); return }
    try {
      setBusy(requestId)
      const { data, error } = await getSupabase().rpc('answer_clarification', {
        p_request_id: requestId, p_body: body,
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
      showToast('✅ أُرسل توضيحك — ستتابع إدارة مرصد المراجعة')
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
                        {DOC_LABEL[d] || d}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '7px' }}>
                    ارفعها من قسم «مستندات الشركة» أسفل هذه الصفحة، ثم اكتب ردّك هنا.
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
                  <textarea
                    id={`clar-${r.id}`}
                    value={drafts[r.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    rows={3}
                    placeholder="اكتب المعلومات المطلوبة، أو أشر إلى المستندات التي رفعتها"
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <button
                    onClick={() => send(r.id)}
                    disabled={busy === r.id || !(drafts[r.id] || '').trim()}
                    style={{
                      marginTop: '10px', padding: '11px 24px',
                      background: (drafts[r.id] || '').trim() ? '#1E2A52' : '#CBD5E1',
                      color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800,
                      cursor: (drafts[r.id] || '').trim() ? 'pointer' : 'default', fontFamily: 'inherit',
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
