import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { notifyTenant } from '../lib/notify'
import { SkeletonPage } from '../components/Skeleton'

/**
 * /admin/official-status — ما تسجّله مرصد ولا تستطيع الشركة مسحه.
 *
 * كان هذا نصف شاشة المستندات السفلي، وهما ليسا العمل نفسه.
 *
 * توثيق مستند تأكيدٌ لادّعاء الشركة عن نفسها: هي ترفع، ومرصد يقرّ. أما تسجيل
 * حالة رسمية — إفلاس أو تصفية أو شطب — فمرصد يؤكّد ما لا تستطيع الشركة كتابته
 * ولا محوه ولا كانت لتنشره. صلاحيتان مختلفتان، ومصدران مختلفان، وإيقاعان
 * مختلفان: الأول طابور يُفرَغ يومياً، والثاني فعل نادر يُسجَّل بمرجعه.
 *
 * وضعُهما في شاشة واحدة جعلها غير مفهومة: قائمة تُعمَل من أعلى، ونموذج قرار
 * ثقيل أسفلها بلا علاقة بينهما. القاعدة تمنع كلتيهما على غير المخوَّل بصرف
 * النظر عن هذا الفصل — هذا يمنع الخلط لا التجاوز.
 */

const OFFICIAL_STATUS = [
  { v: 'none', t: 'لا شيء مسجَّل', fg: '#475569' },
  { v: 'insolvency', t: 'تعثّر مالي', fg: '#B45309' },
  { v: 'suspended', t: 'إيقاف نشاط', fg: '#B45309' },
  { v: 'liquidation', t: 'تصفية', fg: '#B91C1C' },
  { v: 'bankruptcy', t: 'إفلاس', fg: '#B91C1C' },
  { v: 'struck_off', t: 'شطب السجل', fg: '#B91C1C' },
]

export default function AdminOfficialStatus () {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState('')
  const [statusFor, setStatusFor] = useState({ companyId: '', status: 'none', note: '' })

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    try {
      const { data } = await getSupabase()
        .from('companies')
        .select('id, name, cr_number, official_status, official_status_at, official_status_note')
        .order('name')
        .limit(500)
      setCompanies(data || [])
    } catch (err) {
      console.error('Error loading companies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const { connected, liveAt } = useLiveData(load, { tables: ['companies'] })

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
      // صفٌّ تُخفيه RLS عن التحديث يعود بلا خطأ وبلا صفوف، فالقراءة بعد الكتابة
      // هي ما يفرّق بين «حُفظت» و«بدت أنها حُفظت».
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

  if (loading) return <SkeletonPage />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontSize: '25px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>
            الحالة الرسمية
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.9 }}>
            ما تسجّله مرصد على الشركة ولا تستطيع الشركة تعيينه ولا مسحه عن نفسها.
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', borderTop: '4px solid #B91C1C' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>تسجيل حالة رسمية</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.9 }}>
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
