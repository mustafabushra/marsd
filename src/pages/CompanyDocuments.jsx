import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRole } from '../hooks/useUserRole'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * /documents — the company supplies its own paperwork.
 *
 * The trust report's official layer had nothing to weigh beyond a registration
 * status, and its confidence section could only ever say "لا مستندات رسمية
 * مرفقة". This is where that changes, and it is the company's screen rather than
 * Marsad's on purpose: the company holds these papers, and asking Marsad to
 * source a company's own commercial registration is backwards.
 *
 * Uploading is a claim. Only a document Marsad has verified moves the score, so
 * nothing here says "+4" until it has been reviewed — promising points for a
 * pending upload would be a number the screen cannot keep.
 */

const DOC_TYPES = [
  { v: 'commercial_registration', t: 'السجل التجاري', hint: 'الوثيقة الرسمية من وزارة التجارة' },
  { v: 'tax_certificate', t: 'الشهادة الضريبية', hint: 'شهادة التسجيل في ضريبة القيمة المضافة' },
  { v: 'national_address', t: 'العنوان الوطني', hint: 'وثيقة العنوان الوطني للمنشأة' },
  { v: 'chamber_membership', t: 'عضوية الغرفة التجارية', hint: 'شهادة عضوية سارية' },
  { v: 'license', t: 'ترخيص النشاط', hint: 'ترخيص مزاولة النشاط من الجهة المختصة' },
  { v: 'bank_letter', t: 'خطاب بنكي', hint: 'خطاب من البنك يثبت الحساب' },
  { v: 'other', t: 'مستند آخر', hint: '' },
]

const STATUS = {
  pending:  { t: 'قيد المراجعة', bg: '#FFFBEB', fg: '#B45309' },
  verified: { t: '✔ موثَّق', bg: '#ECFDF5', fg: '#15803D' },
  rejected: { t: '✕ مرفوض', bg: '#FEF2F2', fg: '#B91C1C' },
}

// 5 MB. Files are stored as data URLs, the same way the registration document
// already is, and a larger one would sit in a row every read has to carry.
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'application/pdf,image/png,image/jpeg'

export default function CompanyDocuments() {
  const { user } = useUser()
  const { tenantId } = useUserRole()
  const [companyId, setCompanyId] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ type: 'commercial_registration', note: '' })

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const { data: t } = await supabase
        .from('tenants').select('company_id').eq('id', tenantId).maybeSingle()
      if (!t?.company_id) { setLoading(false); return }
      setCompanyId(t.company_id)

      const { data, error: e } = await supabase.rpc('company_documents_for', { p_company_id: t.company_id })
      if (e) throw e
      setDocs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المستندات')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { if (tenantId) load() }, [tenantId, load])
  const { connected, liveAt } = useLiveData(load, { tables: ['company_documents'] })

  const upload = async (file) => {
    if (!file || !companyId) return
    if (file.size > MAX_BYTES) {
      showToast(`❌ الملف أكبر من ٥ ميجابايت (${(file.size / 1024 / 1024).toFixed(1)} م.ب)`)
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      showToast('❌ الصيغ المقبولة: PDF أو PNG أو JPG')
      return
    }

    try {
      setBusy(true)
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(file)
      })

      // Read the row back. An insert RLS filters out raises nothing and returns
      // nothing, so "no error" is not evidence the document was stored — and a
      // company told its paperwork arrived when it did not will not send it again.
      const { data, error: e } = await getSupabase()
        .from('company_documents')
        .insert([{
          company_id: companyId,
          uploaded_by_tenant_id: tenantId,
          uploaded_by_user_id: user?.id || null,
          doc_type: form.type,
          file_url: dataUrl,
          file_name: file.name,
          note: form.note.trim() || null,
          status: 'pending',
        }])
        .select('id')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ المستند — تحقّق من صلاحيتك')

      setForm((f) => ({ ...f, note: '' }))
      showToast('✅ أُرسل المستند — ستراجعه إدارة مرصد')
      load()
    } catch (err) {
      showToast('❌ تعذّر الرفع: ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (id) => {
    if (!window.confirm('سحب هذا المستند قبل مراجعته؟')) return
    const { error: e } = await getSupabase().from('company_documents').delete().eq('id', id)
    if (e) showToast('❌ تعذّر السحب: ' + e.message)
    else { showToast('✅ سُحب المستند'); load() }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '40vh', alignItems: 'center', color: '#64748B', fontWeight: 600 }}>جاري التحميل…</div>
  }

  if (!companyId) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>مستندات الشركة</h1>
        <p style={{ fontSize: '14.5px', color: '#64748B', margin: 0 }}>
          لا توجد شركة مرتبطة بحسابك بعد. أكمل تسجيل شركتك أو مطالبة الملكية أولاً.
        </p>
      </div>
    )
  }

  const verified = docs.filter((d) => d.status === 'verified').length
  const missing = DOC_TYPES.filter((t) => t.v !== 'other'
    && !docs.some((d) => d.doc_type === t.v && d.status === 'verified'))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>مستندات الشركة</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            كل مستند توثّقه إدارة مرصد يرفع الطبقة الرسمية في مؤشر ثقتك — والمعلَّق لا يؤثّر حتى يُراجَع.
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>مستندات موثَّقة</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803D', lineHeight: 1 }}>{verified}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>قيد المراجعة</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#B45309', lineHeight: 1 }}>{docs.filter((d) => d.status === 'pending').length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>لم تُرفع بعد</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#94A3B8', lineHeight: 1 }}>{missing.length}</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>رفع مستند</h2>
        <div style={{ display: 'grid', gap: '14px' }}>
          <label>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>نوع المستند</span>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: '#fff' }}>
              {DOC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
            </select>
            <span style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>
              {DOC_TYPES.find((t) => t.v === form.type)?.hint}
            </span>
          </label>

          <label>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>ملاحظة للمراجع (اختياري)</span>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                   placeholder="مثال: الشهادة سارية حتى نهاية العام"
                   style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit' }} />
          </label>

          <div>
            <input id="docfile" type="file" accept={ACCEPT} disabled={busy}
                   onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }}
                   style={{ display: 'none' }} />
            <label htmlFor="docfile" style={{
              display: 'inline-block', padding: '12px 24px', background: busy ? '#94A3B8' : '#1E2A52',
              color: '#fff', borderRadius: '10px', fontSize: '14px', fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
            }}>
              {busy ? 'جارٍ الرفع…' : '⬆ اختر ملفاً وارفعه'}
            </label>
            <span style={{ fontSize: '12px', color: '#94A3B8', marginRight: '12px', fontWeight: 600 }}>
              PDF أو PNG أو JPG · حتى ٥ ميجابايت
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>المستندات المرفوعة</h2>
        {docs.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>لم تُرفع أي مستندات بعد.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {docs.map((d) => {
              const s = STATUS[d.status] || STATUS.pending
              const t = DOC_TYPES.find((x) => x.v === d.doc_type)
              return (
                <div key={d.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{t?.t || d.doc_type}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                      {d.file_name || '—'} · {new Date(d.created_at).toLocaleDateString('ar-SA')}
                    </div>
                    {d.status === 'rejected' && d.rejection_reason && (
                      <div style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700, marginTop: '6px' }}>
                        سبب الرفض: {d.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: s.bg, color: s.fg, borderRadius: '999px', padding: '5px 14px', fontSize: '12.5px', fontWeight: 800 }}>{s.t}</span>
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noreferrer"
                         style={{ fontSize: '13px', fontWeight: 800, color: '#1E2A52' }}>فتح</a>
                    )}
                    {d.status === 'pending' && (
                      <button onClick={() => withdraw(d.id)}
                              style={{ background: 'none', border: 0, color: '#B91C1C', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>سحب</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 90 }}>{toast}</div>
      )}
    </div>
  )
}
