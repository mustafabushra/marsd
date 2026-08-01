import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { notifyTenant } from '../lib/notify'

/**
 * /admin/documents — Marsad verifies what companies supply, and records what
 * only Marsad may record.
 *
 * Two different powers on one screen, kept visually apart because they are not
 * the same act. Verifying a document confirms a company's own claim about
 * itself. Recording an official status — insolvency, bankruptcy, liquidation —
 * is Marsad asserting something the company cannot write, cannot clear, and
 * would not choose to publish. The database refuses the attempt either way; this
 * screen just does not blur them together.
 */

const DOC_LABEL = {
  commercial_registration: 'السجل التجاري',
  tax_certificate: 'الشهادة الضريبية',
  national_address: 'العنوان الوطني',
  chamber_membership: 'عضوية الغرفة التجارية',
  license: 'ترخيص النشاط',
  bank_letter: 'خطاب بنكي',
  other: 'مستند آخر',
}

const OFFICIAL_STATUS = [
  { v: 'none', t: 'لا شيء مسجَّل', fg: '#475569' },
  { v: 'insolvency', t: 'تعثّر مالي', fg: '#B45309' },
  { v: 'suspended', t: 'إيقاف نشاط', fg: '#B45309' },
  { v: 'liquidation', t: 'تصفية', fg: '#B91C1C' },
  { v: 'bankruptcy', t: 'إفلاس', fg: '#B91C1C' },
  { v: 'struck_off', t: 'شطب السجل', fg: '#B91C1C' },
]

const TABS = [
  { v: 'pending',           t: 'بانتظار التوثيق' },
  { v: 'reupload_required', t: 'مطلوب إعادة رفع' },
  { v: 'expiring',          t: 'تنتهي خلال شهر' },
  { v: 'expired',           t: 'منتهية' },
  { v: 'rejected',          t: 'مرفوضة' },
  { v: 'verified',          t: 'موثّقة' },
  { v: 'all',               t: 'الكل' },
]

export default function AdminDocuments() {
  const [pending, setPending] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState('')
  const [statusFor, setStatusFor] = useState({ companyId: '', status: 'none', note: '' })
  // The screen only ever queried status = 'pending', so a verified document left
  // the queue and left Marsad's view with it — nobody could answer "which
  // registrations expire this month" or "what did we reject and why".
  const [tab, setTab] = useState('pending')
  const [counts, setCounts] = useState({})

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    try {
      const supabase = getSupabase()
      const [{ data: overview }, { data: cos }] = await Promise.all([
        supabase.rpc('documents_overview', { p_state: tab }),
        supabase.from('companies')
          .select('id, name, cr_number, official_status, official_status_at, official_status_note')
          .order('name')
          .limit(500),
      ])
      setPending(overview?.items || [])
      setCounts(overview?.counts || {})
      setCompanies(cos || [])
    } catch (err) {
      console.error('Error loading documents:', err)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])
  const { connected, liveAt } = useLiveData(load, { tables: ['company_documents', 'companies'] })

  /**
   * Fetch and open one document, whichever way it was stored.
   *
   * A data: URL opens directly; a storage path needs a signed URL because the
   * bucket is private. Both shapes are in the table and will be for as long as
   * the rows written before the bucket existed are, so this reads the value
   * instead of assuming a format.
   */
  const openDoc = async (id) => {
    const { data: row } = await getSupabase()
      .from('company_documents').select('file_url').eq('id', id).maybeSingle()
    const url = row?.file_url
    if (!url) { showToast('❌ لا ملف مرفق'); return }
    if (url.startsWith('data:') || url.startsWith('http')) { window.open(url, '_blank'); return }
    const { data, error } = await getSupabase().storage
      .from('company-documents').createSignedUrl(url, 60)
    if (error || !data?.signedUrl) { showToast('❌ تعذّر فتح المستند'); return }
    window.open(data.signedUrl, '_blank')
  }

  const review = async (id, approve) => {
    let reason = null
    if (!approve) {
      reason = window.prompt('سبب الرفض (سيظهر للشركة):', '')
      if (reason === null) return
      if (!reason.trim()) { showToast('❌ الرفض يحتاج سبباً'); return }
    }
    try {
      setBusy(id)
      const { data, error } = await getSupabase().rpc('review_document', {
        p_document_id: id, p_approve: approve, p_reason: reason,
      })
      if (error) throw error
      // The function answers with its own refusal rather than throwing, so the
      // reply is read instead of assumed.
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر الحفظ')); return }

      // Tell the company. Verification raises its official layer by up to twenty
      // points, and a company not told its paperwork was accepted has no reason
      // to send the next document.
      const doc = pending.find((d) => d.id === id)
      if (doc?.company_id) {
        const { data: t } = await getSupabase()
          .from('tenants').select('id').eq('company_id', doc.company_id).maybeSingle()
        if (t?.id) {
          await notifyTenant(t.id, approve ? 'document_verified' : 'document_rejected', {
            title: approve ? 'وُثِّق مستندك' : 'لم يُقبل مستندك',
            message: approve
              ? `${DOC_LABEL[doc.doc_type] || doc.doc_type} — وارتفع مؤشر ثقتك`
              : `${DOC_LABEL[doc.doc_type] || doc.doc_type} — ${reason}`,
            meta: { document_id: id, doc_type: doc.doc_type },
          })
        }
      }

      showToast(approve ? '✅ وُثِّق المستند وأُبلغت الشركة' : '✅ رُفض المستند وأُبلغت الشركة')
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(null)
    }
  }

  const saveStatus = async () => {
    if (!statusFor.companyId) { showToast('❌ اختر الشركة'); return }
    if (statusFor.status !== 'none' && !statusFor.note.trim()) {
      showToast('❌ الحالة الرسمية تحتاج مصدراً أو مرجعاً في الملاحظة')
      return
    }
    try {
      setBusy('status')
      const { data, error } = await getSupabase()
        .from('companies')
        .update({
          official_status: statusFor.status,
          official_status_note: statusFor.status === 'none' ? null : statusFor.note.trim(),
          official_status_at: statusFor.status === 'none' ? null : new Date().toISOString(),
        })
        .eq('id', statusFor.companyId)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('لم تُحفظ الحالة — تحقّق من صلاحيتك')

      await getSupabase().rpc('compute_trust_score', { p_company_id: statusFor.companyId })

      const { data: t2 } = await getSupabase()
        .from('tenants').select('id').eq('company_id', statusFor.companyId).maybeSingle()
      if (t2?.id) {
        await notifyTenant(t2.id, 'official_status_recorded', {
          title: 'سُجّلت حالة رسمية على شركتك',
          message: (OFFICIAL_STATUS.find((x) => x.v === statusFor.status)?.t || statusFor.status)
            + ' — تظهر في تقرير ثقتك. للاعتراض تواصل مع إدارة مرصد بالمستندات المُثبِتة.',
          meta: { status: statusFor.status },
        })
      }

      showToast('✅ سُجّلت الحالة الرسمية وأُبلغت الشركة')
      setStatusFor({ companyId: '', status: 'none', note: '' })
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(null)
    }
  }

  const flagged = companies.filter((c) => c.official_status && c.official_status !== 'none')

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '40vh', alignItems: 'center', color: '#64748B', fontWeight: 600 }}>جاري التحميل…</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>المستندات والحالة الرسمية</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            المستند الموثَّق وحده يدخل مؤشر الثقة. والحالة الرسمية تسجّلها مرصد ولا تستطيع الشركة مسحها.
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px' }}>
          المستندات
        </h2>

        {/* The tabs are the states a document can be in, each with how many are
            in it — so "nothing to do" and "nothing recorded" cannot look alike. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {TABS.map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)} style={{
              padding: '8px 15px', borderRadius: '9px', fontSize: '12.5px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.v ? '#1E2A52' : '#fff',
              color: tab === t.v ? '#fff' : '#334155',
              border: tab === t.v ? 0 : '1.5px solid #E2E8F0',
            }}>
              {t.t}
              {counts[t.v] != null && (
                <span style={{ opacity: 0.7, marginInlineStart: '6px' }}>{counts[t.v]}</span>
              )}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px' }}>
          افتح المستند قبل القرار. التوثيق يرفع الطبقة الرسمية فوراً.
        </p>

        {pending.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لا مستندات في هذا التصنيف.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pending.map((d) => (
              <div key={d.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: '230px' }}>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>
                    {d.companies?.name || 'شركة'} — {DOC_LABEL[d.doc_type] || d.doc_type}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    س.ت {d.companies?.cr_number || '—'} · {d.file_name || '—'} · {new Date(d.created_at).toLocaleDateString('ar-SA')}
                  </div>
                  {d.note && <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '6px' }}>ملاحظة: {d.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
                  <button onClick={() => openDoc(d.id)}
                          style={{ fontSize: '13px', fontWeight: 800, color: '#1E2A52', padding: '8px 14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                    فتح المستند
                  </button>
                  {tab === 'pending' && (<>
                  <button onClick={() => review(d.id, true)} disabled={busy === d.id}
                          style={{ padding: '9px 18px', background: '#15803D', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✓ توثيق
                  </button>
                  <button onClick={() => review(d.id, false)} disabled={busy === d.id}
                          style={{ padding: '9px 18px', background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✕ رفض
                  </button>
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', borderTop: '4px solid #B91C1C' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>تسجيل حالة رسمية</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px' }}>
          أثقل إشارة في المؤشر — الإفلاس يخصم ٧٠ نقطة من الطبقة الرسمية. لا تستطيع الشركة تعيينها ولا مسحها عن نفسها،
          ولهذا تُقرأ. سجّل المصدر في الملاحظة.
        </p>

        <div style={{ display: 'grid', gap: '14px', maxWidth: '640px' }}>
          <label>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>الشركة</span>
            <select value={statusFor.companyId} onChange={(e) => setStatusFor((s) => ({ ...s, companyId: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: '#fff' }}>
              <option value="">— اختر —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.cr_number || '—'})</option>)}
            </select>
          </label>

          <label>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>الحالة</span>
            <select value={statusFor.status} onChange={(e) => setStatusFor((s) => ({ ...s, status: e.target.value }))}
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: '#fff' }}>
              {OFFICIAL_STATUS.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
            </select>
          </label>

          <label>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>المصدر أو المرجع</span>
            <input value={statusFor.note} onChange={(e) => setStatusFor((s) => ({ ...s, note: e.target.value }))}
                   placeholder="مثال: إعلان تصفية في الجريدة الرسمية بتاريخ …"
                   style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit' }} />
          </label>

          <div>
            <button onClick={saveStatus} disabled={busy === 'status'}
                    style={{ padding: '12px 26px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {busy === 'status' ? 'جارٍ الحفظ…' : 'حفظ الحالة'}
            </button>
          </div>
        </div>

        {flagged.length > 0 && (
          <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
              شركات عليها حالة مسجَّلة ({flagged.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {flagged.map((c) => {
                const s = OFFICIAL_STATUS.find((x) => x.v === c.official_status)
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', background: '#FEF2F2', borderRadius: '9px', padding: '11px 14px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{c.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: s?.fg || '#B91C1C' }}>
                      {s?.t || c.official_status}
                      {c.official_status_at && (
                        <span style={{ color: '#64748B', fontWeight: 700, marginRight: '10px' }}>
                          {new Date(c.official_status_at).toLocaleDateString('ar-SA')}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 90 }}>{toast}</div>
      )}
    </div>
  )
}
