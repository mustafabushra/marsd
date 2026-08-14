import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { LIMITS } from '../lib/validate.js'

/**
 * A report filed by Marsad itself.
 *
 * Reports arrive from tenants. Marsad's own staff have no tenant — that is what
 * makes them staff — so anything the platform established directly had nowhere
 * to go: a court judgment somebody sent in, a default confirmed by two separate
 * suppliers over the phone, a case worked through by the review team.
 *
 * ============================================================================
 * What this screen is not
 * ============================================================================
 * It is not a way around review. The report is created `pending_review` and
 * appears in /admin/reports beside every other, and somebody approves it there.
 * An administrator can do that a second later; the point is not the delay, it is
 * that there stays exactly one door into an approved report.
 *
 * The reporter is not a field on this form. `admin_create_report` resolves it to
 * the Marsad tenant, so a report filed here says «مرصد» and cannot be made to
 * say anything else — a report is testimony, and who gave it is the whole of
 * its weight. The audit log records which member of staff pressed the button.
 */

const CATEGORIES = [
  { v: 'late_payment', t: 'تأخير سداد' },
  { v: 'no_payment', t: 'عدم سداد' },
  { v: 'contract_breach', t: 'إخلال بالعقد' },
  { v: 'quality', t: 'جودة العمل' },
  { v: 'execution_delay', t: 'تأخير التنفيذ' },
  { v: 'dispute', t: 'نزاع' },
  { v: 'fraud', t: 'احتيال' },
  { v: 'other', t: 'أخرى' },
]

const PAYMENT = [
  { v: 'full', t: 'سدّد بالكامل' },
  { v: 'partial', t: 'سدّد جزئياً' },
  { v: 'late', t: 'سدّد متأخّراً' },
  { v: 'default', t: 'لم يسدّد' },
]

const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }
const field = {
  width: '100%', minHeight: '44px', padding: '11px 13px', borderRadius: '10px',
  border: '1.5px solid #E2E8F0', fontSize: '14px', fontFamily: 'inherit',
  color: '#0F172A', background: '#fff',
}

export default function AdminAddReport() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [company, setCompany] = useState(null)
  const [searching, setSearching] = useState(false)

  const [form, setForm] = useState({
    category: '', title: '', description: '', dealtAt: '',
    paymentCommitment: '', delayDays: '', defaulted: false,
    dealValue: '', notes: '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // --- Finding the company ---------------------------------------------------
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || company) { setResults([]); return undefined }

    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await getSupabase()
        .from('companies')
        .select('id, name, cr_number, city')
        .or(`name.ilike.%${q}%,cr_number.ilike.%${q}%`)
        .limit(8)
      setResults(data || [])
      setSearching(false)
    }, 300)

    return () => clearTimeout(t)
  }, [query, company])

  const submit = useCallback(async () => {
    setError('')

    if (!company) return setError('اختر الشركة المُبلَّغ عنها')
    if (!form.category) return setError('اختر فئة التقرير')
    if (!form.title.trim()) return setError('عنوان التقرير مطلوب')
    if (!form.description.trim() || form.description.trim().length < 20) {
      return setError('الوصف مطلوب — اكتب ما لا يقل عن ٢٠ حرفاً')
    }

    setSubmitting(true)
    try {
      const { data, error: e } = await getSupabase().rpc('admin_create_report', {
        p_target_company_id: company.id,
        p_category: form.category,
        p_title: form.title.trim(),
        p_description: form.description.trim(),
        p_dealt_at: form.dealtAt ? new Date(form.dealtAt).toISOString() : new Date().toISOString(),
        p_payment_commitment: form.paymentCommitment || null,
        p_delay_days: form.delayDays === '' ? null : Number(form.delayDays),
        p_defaulted: form.defaulted,
        p_deal_value: form.dealValue === '' ? null : Number(form.dealValue),
        p_relationship_type: null,
        p_detail_codes: null,
        p_notes: form.notes.trim() || null,
      })

      if (e) throw e
      // The id is read back rather than assumed. An RPC filtered by a policy
      // returns no error and no row, and «تم» over a report that does not exist
      // is the failure that gets discovered weeks later.
      if (!data) throw new Error('لم يُسجَّل التقرير — تحقّق من صلاحيتك')

      navigate('/admin/reports')
    } catch (err) {
      setError(err?.message || 'تعذّر تسجيل التقرير')
    } finally {
      setSubmitting(false)
    }
  }, [company, form, navigate])

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        إضافة تقرير باسم مرصد
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.9 }}>
        لما تُثبته إدارة مرصد بنفسها — حكم قضائي، أو تعثّر أكّده أكثر من مورّد.
        يُسجَّل باسم «مرصد» ويدخل طابور المراجعة مثل أي تقرير آخر.
      </p>

      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px',
          padding: '13px 16px', marginBottom: '16px', fontSize: '14px',
          color: '#B91C1C', fontWeight: 700, lineHeight: 1.8,
        }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
        {/* --- The company --- */}
        <div style={{ marginBottom: '20px' }}>
          <label style={label}>الشركة المُبلَّغ عنها</label>

          {company ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '11px', padding: '13px',
              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '11px',
            }}>
              <span style={{ flex: 'none' }}>✅</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{company.name}</div>
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                  {company.cr_number}{company.city ? ` — ${company.city}` : ''}
                </div>
              </div>
              <button onClick={() => { setCompany(null); setQuery('') }}
                      style={{ flex: 'none', minHeight: '40px', padding: '0 14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: 800, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                تغيير
              </button>
            </div>
          ) : (
            <>
              <input maxLength={LIMITS.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو رقم السجل التجاري"
                style={field}
              />
              {searching && <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '8px' }}>جاري البحث…</div>}
              {results.length > 0 && (
                <div style={{ marginTop: '8px', border: '1px solid #E2E8F0', borderRadius: '11px', overflow: 'hidden' }}>
                  {results.map((r) => (
                    <button key={r.id} onClick={() => { setCompany(r); setResults([]) }}
                            style={{ display: 'block', width: '100%', textAlign: 'start', padding: '12px 14px', background: '#fff', border: 0, borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{r.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>{r.cr_number}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* --- What happened --- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={label}>الفئة</label>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} style={field}>
              <option value="">— اختر —</option>
              {CATEGORIES.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>تاريخ التعامل</label>
            <input type="date" value={form.dealtAt} onChange={(e) => set('dealtAt', e.target.value)} style={field} />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={label}>العنوان</label>
          <input maxLength={LIMITS.name} value={form.title} onChange={(e) => set('title', e.target.value)}
                 placeholder="جملة واحدة تصف ما حدث" style={field} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={label}>الوصف</label>
          <textarea maxLength={LIMITS.description} value={form.description} onChange={(e) => set('description', e.target.value)}
                    rows={5} placeholder="ما الذي أثبتته الإدارة، وكيف"
                    style={{ ...field, minHeight: '110px', resize: 'vertical' }} />
        </div>

        {/* --- The money --- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={label}>حالة السداد</label>
            <select value={form.paymentCommitment} onChange={(e) => set('paymentCommitment', e.target.value)} style={field}>
              <option value="">— غير محدّد —</option>
              {PAYMENT.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>أيام التأخير</label>
            <input type="number" min="0" max="3650" step="1" value={form.delayDays}
                   onChange={(e) => set('delayDays', e.target.value)} style={field} />
          </div>
          <div>
            <label style={label}>قيمة التعامل (ريال)</label>
            <input type="number" min="0" max="999999999999" step="0.01" value={form.dealValue}
                   onChange={(e) => set('dealValue', e.target.value)} style={field} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.defaulted}
                 onChange={(e) => set('defaulted', e.target.checked)}
                 style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>
            تعثّر مؤكَّد — لم يُسدَّد المبلغ
          </span>
        </label>

        <div style={{ marginBottom: '20px' }}>
          <label style={label}>ملاحظة داخلية (اختيارية)</label>
          <input maxLength={LIMITS.reason} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                 placeholder="مصدر المعلومة أو رقم المرجع" style={field} />
        </div>

        <div style={{ display: 'flex', gap: '11px' }}>
          <button onClick={submit} disabled={submitting}
                  style={{
                    minHeight: '46px', padding: '0 28px', background: submitting ? '#94A3B8' : '#7C3AED',
                    color: '#fff', border: 0, borderRadius: '11px', fontSize: '15px',
                    fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
            {submitting ? 'جاري التسجيل…' : 'تسجيل التقرير'}
          </button>
          <button onClick={() => navigate('/admin/reports')} disabled={submitting}
                  style={{ minHeight: '46px', padding: '0 24px', background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '11px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
