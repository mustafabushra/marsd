import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

const CATEGORY_LABELS = { late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد', quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع', fraud: 'احتيال', other: 'أخرى' }
const PAYMENT_LABELS = { full: 'تم السداد', partial: 'سداد جزئي', late: 'متأخر', default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق' }

export default function AdminReports() {
  const { user } = useUser()
  const [reports, setReports] = useState([])
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchReports() }, [])

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const fetchReports = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('reports')
        .select(`id, target_company_id, reporter_tenant_id, status, submitted_at, dealt_at, deal_end_date,
                 deal_value, currency, deal_amount_range, payment_commitment, delay_days, defaulted,
                 title, category, description, notes, would_recommend,
                 companies:target_company_id ( name, cr_number )`)
        .eq('status', 'pending_review')
        .order('submitted_at', { ascending: false })
      setReports(data || [])
      setSel(0)
    } catch (err) {
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const current = reports[sel] || null

  const removeCurrent = () => {
    const next = reports.filter((_, i) => i !== sel)
    setReports(next)
    setSel(0)
  }

  const handleApprove = async () => {
    if (!current) return
    try {
      setActionLoading('approve')
      const supabase = getSupabase()
      const { error } = await supabase.from('reports')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', current.id)
      if (error) throw error
      // Award credits to the reporter
      await supabase.from('credits_ledger').insert([{
        tenant_id: current.reporter_tenant_id, report_id: current.id, amount: 10,
        reason: 'report_approved', created_at: new Date().toISOString(),
      }])
      // Recompute trust score (best effort)
      await supabase.rpc('compute_trust_score', { p_company_id: current.target_company_id })
      // Audit + notify
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: 'report_approved', entity: 'report', entity_id: current.id, created_at: new Date().toISOString() }])
      await supabase.from('notifications').insert([{ tenant_id: current.reporter_tenant_id, type: 'report_approved', title: 'تم اعتماد تقريرك', message: 'تم اعتماد تقريرك وإضافته لمؤشر الثقة.', is_read: false, created_at: new Date().toISOString() }])
      showToast('✅ تم اعتماد التقرير')
      removeCurrent()
    } catch (err) {
      showToast('❌ فشل الاعتماد: ' + (err?.message || 'خطأ غير معروف'))
      console.error(err)
    } finally { setActionLoading(null) }
  }

  const handleReject = async () => {
    if (!current) return
    const reason = window.prompt('سبب الرفض (سيظهر للمُبلِّغ):', '')
    if (reason === null) return
    try {
      setActionLoading('reject')
      const supabase = getSupabase()
      const { error } = await supabase.from('reports')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason || 'تم الرفض من قبل الإدارة' })
        .eq('id', current.id)
      if (error) throw error
      // Refund the credit deducted at submission
      await supabase.from('credits_ledger').insert([{
        tenant_id: current.reporter_tenant_id, report_id: current.id, amount: 1,
        reason: 'report_rejected_refund', created_at: new Date().toISOString(),
      }])
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: 'report_rejected', entity: 'report', entity_id: current.id, meta: JSON.stringify({ reason }), created_at: new Date().toISOString() }])
      await supabase.from('notifications').insert([{ tenant_id: current.reporter_tenant_id, type: 'report_rejected', title: 'تم رفض تقريرك', message: reason || 'راجع ملاحظات الإدارة.', is_read: false, created_at: new Date().toISOString() }])
      showToast('تم رفض التقرير')
      removeCurrent()
    } catch (err) {
      showToast('❌ فشل الرفض: ' + (err?.message || 'خطأ غير معروف'))
      console.error(err)
    } finally { setActionLoading(null) }
  }

  const handleRequestInfo = async () => {
    if (!current) return
    try {
      setActionLoading('info')
      const supabase = getSupabase()
      await supabase.from('reports').update({ status: 'request_info' }).eq('id', current.id)
      await supabase.from('notifications').insert([{ tenant_id: current.reporter_tenant_id, type: 'report_request_info', title: 'مطلوب توضيح على تقريرك', message: 'يرجى إضافة تفاصيل/مستندات إضافية.', is_read: false, created_at: new Date().toISOString() }])
      showToast('تم طلب توضيح')
      removeCurrent()
    } catch (err) {
      showToast('❌ تعذّر الإجراء')
    } finally { setActionLoading(null) }
  }

  const dealValue = (r) => r?.deal_value != null ? `${Number(r.deal_value).toLocaleString('en-US')} ${r.currency || ''}`.trim() : (r?.deal_amount_range || '—')
  const period = (r) => {
    const f = r?.dealt_at ? new Date(r.dealt_at).toLocaleDateString('en-GB') : null
    const t = r?.deal_end_date ? new Date(r.deal_end_date).toLocaleDateString('en-GB') : null
    return f ? (t ? `${f} — ${t}` : f) : '—'
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل التقارير...</div>
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>
      )}

      {reports.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>لا توجد تقارير قيد المراجعة</div>
          <div style={{ fontSize: '14px', color: '#94A3B8', marginTop: '6px' }}>كل التقارير تمت مراجعتها.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '18px', alignItems: 'start' }}>
          {/* List */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: 0 }}>تقارير قيد المراجعة</h3>
              <span style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '999px', padding: '3px 11px', fontSize: '12.5px', fontWeight: 800 }}>{reports.length}</span>
            </div>
            {reports.map((r, i) => (
              <div key={r.id} onClick={() => setSel(i)} style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: sel === i ? '#F0FDF4' : '#fff', borderRight: sel === i ? '3px solid #16A34A' : '3px solid transparent' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '5px', lineHeight: 1.4 }}>{r.companies?.name || 'شركة'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>{dealValue(r)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detail */}
          {current && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{current.companies?.name || 'شركة'}</h2>
                  {current.title && <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '5px' }}>{current.title}{current.category ? ` · ${CATEGORY_LABELS[current.category] || current.category}` : ''}</div>}
                </div>
                <span style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>قيد المراجعة</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '20px' }}>
                {[
                  ['قيمة التعامل', dealValue(current)],
                  ['حالة السداد', PAYMENT_LABELS[current.payment_commitment] || '—'],
                  ['متوسط التأخير', `${current.delay_days ?? 0} يوم`],
                  ['مبالغ مستحقة', current.defaulted ? 'نعم' : 'لا'],
                  ['التوصية', current.would_recommend === 'yes' ? 'ينصح به' : current.would_recommend === 'maybe' ? 'ربما' : current.would_recommend === 'no' ? 'لا ينصح' : '—'],
                  ['فترة التعامل', period(current)],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>{l}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{v}</div>
                  </div>
                ))}
              </div>

              {(current.description || current.notes) && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>ملاحظات المُبلِّغ</div>
                  <p style={{ fontSize: '14.5px', color: '#475569', lineHeight: 1.7, margin: 0, background: '#F8FAFC', borderRadius: '11px', padding: '16px' }}>{current.description || current.notes}</p>
                </div>
              )}

              <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '11px', padding: '13px 16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '17px' }}>ℹ</span>
                <span style={{ fontSize: '13px', color: '#3730A3', fontWeight: 700, lineHeight: 1.6 }}>اعتماد التقرير سيؤثر تدريجياً على مؤشر ثقة الشركة حين يبدأ الإجماع، لا بشكل فوري.</span>
              </div>

              <div style={{ display: 'flex', gap: '11px', paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={handleApprove} disabled={!!actionLoading} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{actionLoading === 'approve' ? '...' : '✓ اعتماد التقرير'}</button>
                <button onClick={handleReject} disabled={!!actionLoading} style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>✕ رفض</button>
                <button onClick={handleRequestInfo} disabled={!!actionLoading} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>طلب توضيح</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
