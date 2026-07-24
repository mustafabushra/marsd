import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

const EMPTY_FORM = {
  nameEn: '', unifiedNumber: '', entityType: '', crStatus: '', crExpiryDate: '', foundingDate: '',
  sector: '', mainActivity: '', subActivities: '', city: '', region: '', nationalAddress: '',
  website: '', officialEmail: '', phone: ''
}

export default function Profile() {
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [companyId, setCompanyId] = useState(null)
  const [company, setCompany] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [notifications] = useState([
    { type: 'تنبيه تقرير', text: 'تم اعتماد تقرير جديد لشركة من شركاتك', time: 'قبل ساعتين', bg: '#F0FDF4', c: '#15803D' },
    { type: 'تحديث تقييم', text: 'ارتفع تقييم شركة "مؤسسة الخليج" بمقدار 5 نقاط', time: 'أمس', bg: '#F0FDF4', c: '#15803D' }
  ])
  const [toggles, setToggles] = useState({ approve: true, reject: true, watch: true, request: false })
  const handleToggle = (key) => setToggles(prev => ({ ...prev, [key]: !prev[key] }))

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    if (user?.id) loadCompany()
  }, [user?.id])

  async function loadCompany() {
    try {
      const supabase = getSupabase()
      const { data: u } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!u?.tenant_id) { setLoading(false); return }
      const { data: t } = await supabase.from('tenants').select('company_id').eq('id', u.tenant_id).single()
      if (!t?.company_id) { setLoading(false); return }
      const { data: c } = await supabase.from('companies').select('*').eq('id', t.company_id).single()
      if (c) {
        setCompanyId(t.company_id)
        setCompany(c)
        setForm({
          nameEn: c.name_en || '', unifiedNumber: c.unified_number || '', entityType: c.entity_type || '',
          crStatus: c.cr_status || '', crExpiryDate: c.cr_expiry_date || '', foundingDate: c.founding_date || '',
          sector: c.sector || '', mainActivity: c.main_activity || '', subActivities: c.sub_activities || '',
          city: c.city || '', region: c.region || '', nationalAddress: c.national_address || '',
          website: c.website || '', officialEmail: c.official_email || '', phone: c.phone || ''
        })
      }
    } catch (err) {
      console.error('Load company profile error:', err)
    } finally {
      setLoading(false)
    }
  }

  const setField = (name, value) => setForm(prev => ({ ...prev, [name]: value }))

  async function handleSave() {
    if (!companyId) return
    try {
      setSaving(true)
      const supabase = getSupabase()
      const { error } = await supabase.from('companies').update({
        name_en: form.nameEn || null,
        unified_number: form.unifiedNumber || null,
        entity_type: form.entityType || null,
        cr_status: form.crStatus || null,
        cr_expiry_date: form.crExpiryDate || null,
        founding_date: form.foundingDate || null,
        sector: form.sector || null,
        main_activity: form.mainActivity || null,
        sub_activities: form.subActivities || null,
        city: form.city || null,
        region: form.region || null,
        national_address: form.nationalAddress || null,
        website: form.website || null,
        official_email: form.officialEmail || null,
        phone: form.phone || null,
        updated_at: new Date().toISOString(),
      }).eq('id', companyId)
      if (error) throw error
      showToast('✅ تم حفظ التغييرات')
    } catch (err) {
      console.error('Save company profile error:', err)
      showToast('❌ فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }
  const labelStyle = { fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }
  const readonlyBox = { ...fieldStyle, background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center' }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>
        جاري تحميل بيانات الشركة...
      </div>
    )
  }

  const editableFields = [
    { name: 'nameEn', label: 'اسم الشركة (إنجليزي)' },
    { name: 'unifiedNumber', label: 'الرقم الموحّد (700)' },
    { name: 'entityType', label: 'نوع الكيان' },
    { name: 'crStatus', label: 'حالة السجل', type: 'select', options: [
      { v: '', t: '— اختر —' }, { v: 'active', t: 'نشط' }, { v: 'suspended', t: 'موقوف' }, { v: 'terminated', t: 'منتهٍ / مشطوب' }, { v: 'pending', t: 'قيد المعالجة' },
    ] },
    { name: 'foundingDate', label: 'تاريخ التأسيس', type: 'date' },
    { name: 'crExpiryDate', label: 'تاريخ انتهاء السجل', type: 'date' },
    { name: 'sector', label: 'القطاع' },
    { name: 'mainActivity', label: 'النشاط الرئيسي' },
    { name: 'subActivities', label: 'الأنشطة الفرعية', type: 'textarea', full: true },
    { name: 'city', label: 'المدينة' },
    { name: 'region', label: 'المنطقة' },
    { name: 'nationalAddress', label: 'العنوان الوطني', full: true },
    { name: 'website', label: 'الموقع الإلكتروني' },
    { name: 'officialEmail', label: 'البريد الإلكتروني' },
    { name: 'phone', label: 'رقم الهاتف' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>
      )}

      {/* Left: Company Data */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'right' }}>بيانات الشركة</h3>
          {company?.verified && (
            <span style={{ background: '#EFF6FF', color: '#1D4ED8', borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>✔ موثّقة</span>
          )}
        </div>

        {!companyId ? (
          <div style={{ fontSize: '14px', color: '#94A3B8', fontWeight: 600, padding: '20px 0' }}>لا توجد شركة مرتبطة بحسابك.</div>
        ) : (
          <>
            {/* Read-only identity (registry primary keys) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>اسم الشركة</label>
                <div style={readonlyBox}>{company?.name || '—'}</div>
              </div>
              <div>
                <label style={labelStyle}>رقم السجل التجاري</label>
                <div style={readonlyBox}>{company?.cr_number || '—'}</div>
              </div>
              <div>
                <label style={labelStyle}>المصدر</label>
                <div style={readonlyBox}>{company?.source === 'official' ? 'رسمي' : 'مجتمعي'}</div>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {editableFields.map(f => (
                <div key={f.name} style={f.full ? { gridColumn: '1/3' } : undefined}>
                  <label style={labelStyle}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={{ ...fieldStyle, background: '#fff' }}>
                      {f.options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={{ ...fieldStyle, minHeight: '70px', resize: 'vertical' }} />
                  ) : (
                    <input type={f.type === 'date' ? 'date' : 'text'} value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={fieldStyle} />
                  )}
                </div>
              ))}
            </div>

            <button onClick={handleSave} disabled={saving} style={{ background: saving ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', marginTop: '20px', fontFamily: 'inherit' }}>
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            {company?.verified && (
              <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '10px 2px 0', fontWeight: 600 }}>تعديل البيانات الموثّقة قد يتطلب إعادة التحقق من إدارة مرصد.</p>
            )}
          </>
        )}
      </div>

      {/* Right: Notifications */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>الإشعارات</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
          {notifications.map((n, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '11px', padding: '13px', borderRadius: '11px', background: n.bg, border: '1px solid #F1F5F9' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: n.c, marginTop: '5px', flex: 'none' }}></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: n.c }}>{n.type}</div>
                <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, margin: '2px 0', lineHeight: 1.5 }}>{n.text}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0', textAlign: 'right' }}>تفضيلات الإشعارات</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
          {[
            { key: 'approve', label: 'اعتماد تقرير' },
            { key: 'reject', label: 'رفض تقرير' },
            { key: 'watch', label: 'تغيّر تقييم شركة مراقَبة' },
            { key: 'request', label: 'قبول طلب إضافة شركة' }
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#334155', fontWeight: 600 }}>{item.label}</span>
              <button onClick={() => handleToggle(item.key)} style={{ width: '44px', height: '24px', borderRadius: '999px', border: 0, background: toggles[item.key] ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: toggles[item.key] ? '22px' : '2px', transition: 'left 0.2s' }}></span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
