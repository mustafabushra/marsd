import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { creditsGrantedFor } from '../lib/entitlements'
import { notifyTenant } from '../lib/notify'

const FIELD_LABELS = {
  name: 'اسم الشركة', name_en: 'الاسم (إنجليزي)', cr_number: 'رقم السجل التجاري', unified_number: 'الرقم الموحّد (700)',
  entity_type: 'نوع الكيان', sector: 'القطاع', main_activity: 'النشاط الرئيسي', city: 'المدينة', region: 'المنطقة',
}
const TYPE_META = {
  add_company: { label: 'إضافة شركة', bg: '#F0FDF4', c: '#15803D' },
  add_data: { label: 'استكمال بيانات', bg: '#EEF2FF', c: '#1E40AF' },
  edit_data: { label: 'تعديل بيانات', bg: '#FFFBEB', c: '#B45309' },
}

export default function AdminRequests() {
  const { user } = useUser()
  const [items, setItems] = useState([])
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const fetchAll = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const [{ data: pendingCompanies }, { data: dataRequests }] = await Promise.all([
        supabase.from('companies')
          .select('id, name, cr_number, unified_number, sector, city, region, entity_type, source, cr_file_url, created_at')
          .eq('approved', false).order('created_at', { ascending: false }),
        supabase.from('company_data_requests')
          .select('id, company_id, requested_by_tenant_id, requested_by_user_id, request_type, payload, note, created_at, companies:company_id ( name, cr_number, sector, city ), tenants:requested_by_tenant_id ( id, name )')
          .eq('status', 'pending').order('created_at', { ascending: false }),
      ])

      // Who added each company. The screen said "عضو المجتمع" — a category, not a
      // contributor — so a reviewer could approve a record into the national
      // registry without knowing which company put it there, and a bad entry
      // could not be traced back to its source. companies carries no submitter,
      // so the trail is the audit row written when it was filed; the same row the
      // credit is paid against.
      const companyIds = (pendingCompanies || []).map((c) => c.id)
      const submitters = {}
      if (companyIds.length) {
        const { data: origins } = await supabase
          .from('audit_logs')
          .select('entity_id, tenant_id, actor_id, created_at, tenants:tenant_id ( id, name )')
          .eq('action', 'company_add_requested')
          .in('entity_id', companyIds)
          .order('created_at', { ascending: true })
        // First entry wins: a company is added once, and a later touch on the
        // same row is not the contribution being credited or traced.
        ;(origins || []).forEach((o) => { if (!submitters[o.entity_id]) submitters[o.entity_id] = o })
      }

      const list = [
        ...(pendingCompanies || []).map((c) => {
          const origin = submitters[c.id]
          return {
            kind: 'add_company', key: 'co-' + c.id, companyId: c.id, requestId: null,
            name: c.name, cr: c.cr_number, unified: c.unified_number, sector: c.sector, city: c.city,
            crFileUrl: c.cr_file_url,
            by: origin?.tenants?.name || (c.source === 'community' ? 'مصدر غير مُتتبَّع' : 'تسجيل ذاتي'),
            byTenantId: origin?.tenant_id || null,
            byUserId: origin?.actor_id || null,
            date: c.created_at, payload: null, note: null,
          }
        }),
        ...(dataRequests || []).map((r) => ({
          kind: r.request_type, key: 'req-' + r.id, companyId: r.company_id, requestId: r.id,
          name: r.companies?.name || 'شركة', cr: r.companies?.cr_number, sector: r.companies?.sector, city: r.companies?.city,
          by: r.tenants?.name || 'مصدر غير مُتتبَّع',
          byTenantId: r.requested_by_tenant_id || null,
          byUserId: r.requested_by_user_id || null,
          date: r.created_at, payload: r.payload, note: r.note,
        })),
      ]
      setItems(list)
      setSel(0)
    } catch (err) {
      console.error('Error loading requests:', err)
    } finally {
      setLoading(false)
    }
  }

  // Declared after fetchAll, not before: the binding does not exist until here.
  //
  // A review queue is where a stale view costs most — two administrators working
  // the same list would otherwise both open the same request, and the second
  // would act on something already decided.
  const { connected, liveAt } = useLiveData(fetchAll, {
    tables: ['companies', 'company_data_requests', 'claim_requests', 'registration_requests'],
  })

  const openDoc = (dataUrl) => {
    if (!dataUrl) return
    try {
      if (dataUrl.startsWith('data:')) {
        const [meta, b64] = dataUrl.split(',')
        const mime = (meta.match(/data:(.*?);/) || [])[1] || 'application/octet-stream'
        const bin = atob(b64)
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([arr], { type: mime }))
        window.open(url, '_blank')
      } else {
        window.open(dataUrl, '_blank')
      }
    } catch (e) { window.open(dataUrl, '_blank') }
  }

  const current = items[sel] || null
  const removeCurrent = () => { setItems((prev) => prev.filter((_, i) => i !== sel)); setSel(0) }
  const audit = async (supabase, action, entityId, meta) => {
    await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action, entity: 'company', entity_id: entityId, meta: meta ? JSON.stringify(meta) : null, created_at: new Date().toISOString() }])  }

  // Who filed this, so the decision can be told to them. companies carries no
  // submitter, so for an added company the contributor is read from the audit
  // entry written when it was filed; a data request names its own tenant.
  //
  // The data-request branch used to select `tenant_id`, which is not a column on
  // company_data_requests — the request errored, the contributor resolved to
  // null, and the "your contribution was accepted" notification was never sent
  // for a data request. The column holding that value is requested_by_tenant_id,
  // which the award path beside this one was already reading correctly.
  const contributorOf = async (supabase, item) => {
    if (item.kind === 'add_company') {
      const { data } = await supabase
        .from('audit_logs')
        .select('tenant_id')
        .eq('action', 'company_add_requested')
        .eq('entity_id', item.companyId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return data?.tenant_id || null
    }
    const { data } = await supabase
      .from('company_data_requests')
      .select('requested_by_tenant_id')
      .eq('id', item.requestId)
      .maybeSingle()
    return data?.requested_by_tenant_id || null
  }

  // Every write here is read back. A row RLS filters out of an UPDATE matches
  // nothing and raises nothing, so "no error" is not evidence that a request was
  // approved — and this screen grants credits on the strength of that belief.
  const wrote = async (query, message) => {
    const { data, error } = await query.select('id')
    if (error) throw error
    if (!data?.length) throw new Error(message)
    return data
  }

  const approve = async () => {
    if (!current) return
    let awarded = 0
    try {
      setActionLoading(true)
      const supabase = getSupabase()
      const contributor = await contributorOf(supabase, current)

      if (current.kind === 'add_company') {
        await wrote(
          supabase.from('companies').update({ approved: true, status: 'active' }).eq('id', current.companyId),
          'لم تُحفظ الموافقة على الشركة — تحقّق من صلاحيتك')
        await audit(supabase, 'company_approved', current.companyId)

        // A trigger on companies.approved granted the points inside the UPDATE
        // above. This reads the result rather than asking for it: the endpoint
        // it replaced granted from the action name alone, so anyone could claim
        // a contribution they had not made.
        awarded = await creditsGrantedFor('companies', current.companyId, 'company_added')
      } else if (current.kind === 'add_data') {
        const p = current.payload || {}
        const update = {}
        Object.keys(p).forEach((k) => { if (p[k]) update[k] = p[k] })
        if (Object.keys(update).length) {
          await wrote(
            supabase.from('companies').update(update).eq('id', current.companyId),
            'لم تُحفظ بيانات الشركة — تحقّق من صلاحيتك')
        }
        await wrote(
          supabase.from('company_data_requests').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', current.requestId),
          'لم تُحفظ حالة الطلب')
        await audit(supabase, 'company_data_added', current.companyId, update)
        awarded = await creditsGrantedFor('company_data_requests', current.requestId, 'company_completed')
      } else if (current.kind === 'edit_data') {
        const p = current.payload || {}
        if (p.field && p.correct_value != null) {
          await wrote(
            supabase.from('companies').update({ [p.field]: p.correct_value }).eq('id', current.companyId),
            'لم يُحفظ التصحيح — تحقّق من صلاحيتك')
        }
        await wrote(
          supabase.from('company_data_requests').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', current.requestId),
          'لم تُحفظ حالة الطلب')
        await audit(supabase, 'company_data_edited', current.companyId, p)
        awarded = await creditsGrantedFor('company_data_requests', current.requestId, 'company_completed')
      }

      if (contributor) {
        await notifyTenant(contributor, 'company_approved', {
          title: 'قُبلت مساهمتك',
          message: awarded > 0
            ? `أُضيفت ${awarded} نقطة لرصيدك مقابل «${current.name || 'الشركة'}».`
            : `اعتُمدت مساهمتك في «${current.name || 'الشركة'}».`,
          meta: { company_id: current.companyId, credits: awarded },
        })
      }

      showToast(awarded > 0 ? `✅ تمت الموافقة ومُنحت ${awarded} نقطة للشركة المساهِمة` : '✅ تمت الموافقة')
      removeCurrent()
    } catch (err) {
      console.error(err); showToast('❌ فشلت الموافقة: ' + (err?.message || 'خطأ غير معروف'))
    } finally { setActionLoading(false) }
  }

  const reject = async () => {
    if (!current) return
    if (!window.confirm('تأكيد رفض هذا الطلب؟')) return
    try {
      setActionLoading(true)
      const supabase = getSupabase()
      const contributor = await contributorOf(supabase, current)

      if (current.kind === 'add_company') {
        // Read the contributor before the row goes: the audit entry survives the
        // delete, but reading it afterwards depends on nothing having cascaded.
        const { data, error } = await supabase.from('companies').delete().eq('id', current.companyId).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('لم يُحذف السجل — تحقّق من صلاحيتك')
        await audit(supabase, 'company_add_rejected', current.companyId)
      } else {
        await wrote(
          supabase.from('company_data_requests').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', current.requestId),
          'لم يُحفظ الرفض — تحقّق من صلاحيتك')
        await audit(supabase, 'company_data_rejected', current.companyId)
      }

      if (contributor) {
        await notifyTenant(contributor, 'report_rejected', {
          title: 'لم تُقبل مساهمتك',
          message: `راجَعت إدارة مرصد مساهمتك في «${current.name || 'الشركة'}» ولم تُعتمد.`,
          meta: { company_id: current.companyId },
        })
      }

      showToast('تم رفض الطلب')
      removeCurrent()
    } catch (err) {
      console.error(err); showToast('❌ فشل الرفض: ' + (err?.message || 'خطأ غير معروف'))
    } finally { setActionLoading(false) }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>

  const meta = (k) => TYPE_META[k] || TYPE_META.add_company

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
        <span style={{ fontSize: '18px' }}>🏢</span>
        <span style={{ fontSize: '13.5px', color: '#15803D', fontWeight: 700 }}>طلبات إضافة وتعديل الشركات المقدّمة من الأعضاء. تحقّق من مطابقة البيانات للسجل التجاري قبل النشر في سجلات مرصد.</span>
      </div>

      {items.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>لا توجد طلبات معلّقة</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '18px', alignItems: 'start' }}>
          {/* List */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الطلبات المعلّقة</h3>
              <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '999px', padding: '3px 11px', fontSize: '12.5px', fontWeight: 800 }}>{items.length}</span>
            </div>
            {items.map((r, i) => {
              const m = meta(r.kind)
              return (
                <div key={r.key} onClick={() => setSel(i)} style={{ padding: '15px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: '12px', alignItems: 'center', background: sel === i ? '#F5F3FF' : '#fff', borderRight: sel === i ? '3px solid #7C3AED' : '3px solid transparent' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4 }}>{r.name}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>مقدّم من: {r.by}</div>
                  </div>
                  <span><span style={{ background: m.bg, color: m.c, borderRadius: '7px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 800 }}>{m.label}</span></span>
                  <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>{r.date ? new Date(r.date).toLocaleDateString('en-GB') : ''}</span>
                </div>
              )
            })}
          </div>

          {/* Detail */}
          {current && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة</div>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{current.name}</h2>
                </div>
                <span style={{ background: meta(current.kind).bg, color: meta(current.kind).c, borderRadius: '8px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 800 }}>{meta(current.kind).label}</span>
              </div>

              {current.kind === 'add_company' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                  {[
                    ['رقم السجل التجاري', current.cr, true],
                    ['الرقم الموحّد (700)', current.unified, true],
                    ['القطاع', current.sector],
                    ['المدينة', current.city],
                  ].map(([l, v, ltr]) => (
                    <div key={l} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
                      <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>{l}</div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', direction: ltr ? 'ltr' : undefined, textAlign: 'right' }}>{v || '—'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>{current.kind === 'edit_data' ? 'التعديل المطلوب' : 'البيانات المطلوب استكمالها'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {current.kind === 'edit_data' ? (
                      <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700 }}>{FIELD_LABELS[current.payload?.field] || current.payload?.field}</span>
                        <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{current.payload?.correct_value}</span>
                      </div>
                    ) : (
                      Object.entries(current.payload || {}).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700 }}>{FIELD_LABELS[k] || k}</span>
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{v}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {current.kind === 'add_company' && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '8px' }}>مستند السجل التجاري المرفق</div>
                  {current.crFileUrl ? (
                    <button onClick={() => openDoc(current.crFileUrl)} style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '13.5px', fontWeight: 700, color: '#1E2A52', cursor: 'pointer', fontFamily: 'inherit' }}>📄 عرض المستند</button>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>لم يُرفق مستند السجل التجاري مع هذا الطلب.</div>
                  )}
                </div>
              )}

              {current.note && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 16px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>ملاحظة العضو</div>
                  <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, lineHeight: 1.6 }}>{current.note}</div>
                </div>
              )}

              <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#3730A3', marginBottom: '5px' }}>🔗 تحقّق قبل الاعتماد</div>
                <div style={{ fontSize: '13.5px', color: '#4338CA', fontWeight: 600, lineHeight: 1.6 }}>راجِع مطابقة البيانات مع السجل التجاري الرسمي قبل النشر في سجلات مرصد.</div>
              </div>

              <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={approve} disabled={actionLoading} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{current.kind === 'add_company' ? '✓ موافقة ونشر' : '✓ موافقة وتطبيق'}</button>
                <button onClick={reject} disabled={actionLoading} style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>✕ رفض</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
