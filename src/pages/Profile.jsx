import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRole } from '../hooks/useUserRole'
import { canPerform } from '../utils/roles'
import { notificationText, NOTIFICATION_STYLE, NOTIFICATION_PREFS } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import ClarificationRequests from '../components/ClarificationRequests'
import CompanyDocumentsSection from '../components/CompanyDocumentsSection'
import { SkeletonPage } from '../components/Skeleton'
import { LIMITS } from '../lib/validate.js'

/**
 * /profile — the company's own record, and what the platform sends it.
 *
 * The save button reported success on every press and wrote nothing: only
 * platform admins could update public.companies, and a row RLS filters out of an
 * UPDATE is not an error, it is simply not there. Migration 026 gives a company
 * admin the row and a trigger the columns; this page now reads back what it
 * saved instead of trusting the absence of an error, which is the same mistake
 * one layer up.
 *
 * The notifications panel showed two invented items and four toggles held in
 * useState — they reset on reload and nothing ever read them. Both are real now;
 * a switch that flips and changes nothing is worse than no switch, because the
 * user believes they have turned something off.
 */

const EMPTY_FORM = {
  nameEn: '', unifiedNumber: '', entityType: '', crStatus: '', crExpiryDate: '', foundingDate: '',
  sector: '', mainActivity: '', subActivities: '', city: '', region: '', nationalAddress: '',
  website: '', officialEmail: '', phone: ''
}

const FORM_TO_COLUMN = {
  nameEn: 'name_en', unifiedNumber: 'unified_number', entityType: 'entity_type',
  crStatus: 'cr_status', crExpiryDate: 'cr_expiry_date', foundingDate: 'founding_date',
  sector: 'sector', mainActivity: 'main_activity', subActivities: 'sub_activities',
  city: 'city', region: 'region', nationalAddress: 'national_address',
  website: 'website', officialEmail: 'official_email', phone: 'phone'
}

const EDITABLE_FIELDS = [
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

const DEFAULT_STYLE = { icon: '•', color: '#475569', bg: '#F1F5F9' }
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

export default function Profile() {
  const { user } = useUser()
  const { role, loading: roleLoading } = useUserRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [companyId, setCompanyId] = useState(null)
  const [company, setCompany] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [notifications, setNotifications] = useState([])
  const [prefs, setPrefs] = useState({})
  const [savingPref, setSavingPref] = useState(null)

  const canEdit = canPerform(role, 'canEditCompany')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const applyCompany = useCallback((c) => {
    setCompany(c)
    setForm(Object.fromEntries(
      Object.entries(FORM_TO_COLUMN).map(([field, column]) => [field, c[column] || ''])
    ))
  }, [])

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    try {
      const supabase = getSupabase()
      const { data: u } = await supabase
        .from('users')
        .select('tenant_id, notification_prefs')
        .eq('id', user.id)
        .maybeSingle()

      setPrefs(u?.notification_prefs || {})

      const [{ data: recent }] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, type, payload, read_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(4),
      ])
      setNotifications(recent || [])

      if (!u?.tenant_id) return
      const { data: t } = await supabase.from('tenants').select('company_id').eq('id', u.tenant_id).maybeSingle()
      if (!t?.company_id) return

      const { data: c } = await supabase.from('companies').select('*').eq('id', t.company_id).maybeSingle()
      if (c) {
        setCompanyId(t.company_id)
        applyCompany(c)
      }
    } catch (err) {
      console.error('Load company profile error:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, applyCompany])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, {
    tables: ['companies', 'notifications'],
    enabled: !!user?.id,
  })

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))

  async function handleSave() {
    if (!companyId || !canEdit) return
    try {
      setSaving(true)
      const payload = Object.fromEntries(
        Object.entries(FORM_TO_COLUMN).map(([field, column]) => [column, form[field] || null])
      )

      // Read the row back. An UPDATE that RLS filters out returns no error and no
      // rows, so "no error" is not evidence that anything was written — believing
      // it is what made this button lie for every company since launch.
      const { data, error } = await getSupabase()
        .from('companies')
        .update(payload)
        .eq('id', companyId)
        .select('*')

      if (error) throw error
      if (!data?.length) {
        showToast('❌ لم يُحفظ شيء — لا تملك صلاحية تعديل ملف الشركة')
        return
      }

      applyCompany(data[0])
      showToast(company?.verified && !data[0].verified
        ? '✅ حُفظت التغييرات — وأُرسلت الشركة لإعادة التوثيق'
        : '✅ تم حفظ التغييرات')
    } catch (err) {
      console.error('Save company profile error:', err)
      showToast(`❌ ${err.message || 'فشل الحفظ'}`)
    } finally {
      setSaving(false)
    }
  }

  // Absent key = on, so the stored object holds only what was switched off.
  const isOn = (key) => prefs?.[key] !== false

  async function togglePref(key) {
    const next = { ...prefs, [key]: !isOn(key) }
    setPrefs(next)
    try {
      setSavingPref(key)
      const { data, error } = await getSupabase()
        .from('users')
        .update({ notification_prefs: next })
        .eq('id', user.id)
        .select('notification_prefs')
      if (error) throw error
      if (!data?.length) throw new Error('لم يُحفظ التفضيل')
    } catch (err) {
      setPrefs(prefs)              // put the switch back where the data is
      showToast(`❌ ${err.message}`)
    } finally {
      setSavingPref(null)
    }
  }

  const fieldStyle = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }
  const labelStyle = { fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }
  const readonlyBox = { ...fieldStyle, background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center' }

  if (loading || roleLoading) {
    return (
      <SkeletonPage stats={0} panels={3} />
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '420px', lineHeight: 1.7 }}>{toast}</div>
      )}

      {/* An open clarification is why the company's application is not moving,
          so it leads the page. The notification already told them to come here;
          burying it would repeat that failure one screen later. It renders
          nothing when there is no request. */}
      <div style={{ gridColumn: '1 / -1' }}>
        <ClarificationRequests />
      </div>

      {/* Left: Company Data */}
      <div style={{ ...card, padding: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'right' }}>بيانات الشركة</h2>
          {company?.verified && (
            <span style={{ background: '#EFF6FF', color: '#1D4ED8', borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>✔ موثّقة</span>
          )}
          <LiveBadge connected={connected} liveAt={liveAt} />
        </div>

        {!companyId ? (
          <div style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, padding: '20px 0' }}>لا توجد شركة مرتبطة بحسابك.</div>
        ) : (
          <>
            {!canEdit && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 16px', marginBottom: '18px', fontSize: '13.5px', color: '#475569', fontWeight: 600, lineHeight: 1.8 }}>
                🔒 العرض فقط — تعديل ملف الشركة من صلاحيات مدير الشركة.
              </div>
            )}

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {EDITABLE_FIELDS.map((f) => (
                <div key={f.name} style={f.full ? { gridColumn: '1/3' } : undefined}>
                  <label style={labelStyle}>{f.label}</label>
                  {!canEdit ? (
                    <div style={readonlyBox}>{form[f.name] || '—'}</div>
                  ) : f.type === 'select' ? (
                    <select value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={{ ...fieldStyle, background: '#fff' }}>
                      {f.options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea maxLength={LIMITS.description} value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={{ ...fieldStyle, minHeight: '70px', resize: 'vertical' }} />
                  ) : (
                    <input maxLength={LIMITS.name} type={f.type === 'date' ? 'date' : 'text'} value={form[f.name]} onChange={(e) => setField(f.name, e.target.value)} style={fieldStyle} />
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <>
                <button onClick={handleSave} disabled={saving} style={{ background: saving ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', marginTop: '20px', fontFamily: 'inherit' }}>
                  {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
                {company?.verified && (
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: '10px 2px 0', fontWeight: 600, lineHeight: 1.8 }}>
                    تعديل بيانات شركة موثّقة يُلغي التوثيق مؤقتاً حتى تراجعه إدارة مرصد.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Right: Notifications */}
      <div style={{ ...card, padding: '22px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>آخر الإشعارات</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
          {notifications.length === 0 ? (
            <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600, padding: '6px 0', lineHeight: 1.9 }}>لا توجد إشعارات بعد.</div>
          ) : notifications.map((n) => {
            const { title, message } = notificationText(n)
            const s = NOTIFICATION_STYLE[n.type] || DEFAULT_STYLE
            return (
              <div key={n.id} style={{ display: 'flex', gap: '11px', padding: '13px', borderRadius: '11px', background: s.bg, border: '1px solid #F1F5F9' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color, marginTop: '5px', flex: 'none' }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: s.color }}>{title}</div>
                  {message && <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, margin: '2px 0', lineHeight: 1.5 }}>{message}</div>}
                  <div style={{ fontSize: '12px', color: '#64748B' }}>{new Date(n.created_at).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
            )
          })}
        </div>

        <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>تفضيلات الإشعارات</h2>
        <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px', fontWeight: 600, lineHeight: 1.8 }}>تسري على حسابك وحده، ولا تؤثر على زملائك في الشركة.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
          {NOTIFICATION_PREFS.map((item) => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: savingPref === item.key ? 0.55 : 1 }}>
              <span style={{ fontSize: '14px', color: '#334155', fontWeight: 600 }}>{item.label}</span>
              <button
                onClick={() => togglePref(item.key)}
                disabled={savingPref === item.key}
                aria-pressed={isOn(item.key)}
                style={{ width: '44px', height: '24px', borderRadius: '999px', border: 0, background: isOn(item.key) ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flex: 'none' }}
              >
                <span style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: isOn(item.key) ? '22px' : '2px', transition: 'left 0.2s' }}></span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Full width, and after the data. The page root is a two-column grid, so
          this has to span both columns or it lands squeezed in one of them —
          which is how it ended up buried below the notification preferences and
          impossible to find. Data first, documents second: editing fields and
          managing files are different tasks, and a record is read before its
          paperwork is. */}
      <div style={{ gridColumn: '1 / -1' }}>
        <CompanyDocumentsSection />
      </div>

    </div>
  )
}
