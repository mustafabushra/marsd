import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase, buildCompanyInsert } from '../lib/api'
import { CheckIcon, EyeIcon, TrendingUpIcon, UploadIcon } from '../components/icons'
import { useEntitlements } from '../hooks/useEntitlements'
import { awardCredits, UNLIMITED } from '../lib/entitlements'

const ENTITY_TYPES = ['مؤسسة', 'شركة ذات مسؤولية محدودة', 'شركة مساهمة', 'شركة تضامن', 'شركة توصية بسيطة']
const ENTERPRISE_SIZES = ['متناهية الصغر', 'صغيرة', 'متوسطة', 'كبيرة']
const SAUDI_REGIONS = ['منطقة الرياض', 'منطقة مكة المكرمة', 'المنطقة الشرقية', 'منطقة المدينة المنورة', 'منطقة القصيم', 'منطقة عسير', 'منطقة تبوك', 'منطقة حائل', 'منطقة الحدود الشمالية', 'منطقة جازان', 'منطقة نجران', 'منطقة الباحة', 'منطقة الجوف']
const SAUDI_CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الظهران', 'الطائف', 'بريدة', 'عنيزة', 'تبوك', 'حائل', 'أبها', 'خميس مشيط', 'نجران', 'جازان', 'الجبيل', 'ينبع', 'الأحساء', 'القطيف', 'عرعر', 'سكاكا', 'الباحة']
const SECTORS = ['تقنية المعلومات', 'المقاولات والإنشاءات', 'التجارة', 'الصناعة', 'النقل واللوجستيات', 'الخدمات', 'الرعاية الصحية', 'التعليم', 'العقارات', 'المالية والتأمين', 'الطاقة', 'الأغذية والمشروبات', 'السياحة والضيافة', 'الإعلام والتسويق', 'الزراعة']
const ACTIVITIES = ['تجارة الجملة', 'تجارة التجزئة', 'المقاولات العامة', 'مقاولات متخصصة', 'الاستيراد والتصدير', 'تطوير البرمجيات', 'الاستشارات', 'النقل والشحن', 'التصنيع', 'الصيانة والتشغيل', 'الخدمات اللوجستية', 'التسويق والإعلان', 'المطاعم والضيافة', 'العقارات والتطوير']
const CR_STATUSES = [{ v: 'active', t: 'نشط' }, { v: 'suspended', t: 'موقوف' }, { v: 'terminated', t: 'منتهٍ / مشطوب' }, { v: 'pending', t: 'قيد المعالجة' }]

export default function AddCompany() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useUser()
  const { entitlements, limitOf, refresh: refreshEntitlements } = useEntitlements()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creditsEarned, setCreditsEarned] = useState(0)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    companyName: location.state?.companyName || '',
    nameEn: '',
    registryNumber: location.state?.registryNumber || '',
    unifiedNumber: '',
    entityType: '',
    crStatus: '',
    enterpriseSize: '',
    crExpiryDate: '',
    foundingDate: '',
    sector: '',
    mainActivity: '',
    subActivities: '',
    city: '',
    region: '',
    nationalAddress: '',
    website: '',
    officialEmail: '',
    phone: ''
  })

  const [crFile, setCrFile] = useState(null) // { name, url(base64) }
  const [otherMode, setOtherMode] = useState({}) // { field: true } → show custom text input
  const [otherActivity, setOtherActivity] = useState('')

  const setOther = (name, on) => setOtherMode(prev => ({ ...prev, [name]: on }))
  const setFieldValue = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // Multi-select (sub-activities) stored as a comma-joined string
  const subActs = (formData.subActivities || '').split('،').map(s => s.trim()).filter(Boolean)
  const toggleSubAct = (val) => {
    const set = new Set(subActs)
    set.has(val) ? set.delete(val) : set.add(val)
    setFieldValue('subActivities', Array.from(set).join('، '))
  }
  const addOtherActivity = () => {
    const v = otherActivity.trim()
    if (!v) return
    if (!subActs.includes(v)) setFieldValue('subActivities', [...subActs, v].join('، '))
    setOtherActivity('')
  }

  const handleCrFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('حجم الملف كبير جداً (الحد الأقصى 10MB)')
      e.target.value = ''
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setCrFile({ name: file.name, url: reader.result })
    reader.onerror = () => setError('تعذّر قراءة الملف')
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    setError('')
    if (!formData.companyName.trim()) {
      setError('اسم الشركة مطلوب')
      return
    }
    setSubmitting(true)
    try {
      const supabase = getSupabase()

      // Plan ceiling on registry contributions, checked against the database so
      // a colleague's additions since this page loaded still count. Credits
      // widen the allowance rather than bypassing it — contributing is exactly
      // what earns the room to contribute more.
      const ceiling = limitOf('companies_per_month')
      if (ceiling !== UNLIMITED && !entitlements?.degraded && !entitlements?.enforcementDisabled && user?.id) {
        const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
        if (me?.tenant_id) {
          const monthStart = new Date()
          monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

          const { count } = await supabase
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', me.tenant_id)
            .eq('action', 'company_add_requested')
            .gte('created_at', monthStart.toISOString())

          const used = count || 0
          const allowance = ceiling + (entitlements?.giveToGetEnabled ? (entitlements.credits || 0) : 0)
          if (used >= allowance) {
            setError(`بلغت حد باقتك: ${used} من ${allowance} شركة هذا الشهر. رقّ باقتك أو انتظر بداية الشهر القادم.`)
            setSubmitting(false)
            return
          }
        }
      }

      // Avoid obvious duplicates by name
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', formData.companyName.trim())
        .limit(1)
      if (existing?.length) {
        setError('⚠️ توجد شركة بهذا الاسم في سجلات مرصد بالفعل')
        setSubmitting(false)
        return
      }

      // companies.cr_number is NOT NULL — generate a placeholder if none provided
      const crNumber = formData.registryNumber.trim() || `CR${Date.now().toString().slice(-8)}`

      const insert = buildCompanyInsert({
        name: formData.companyName,
        nameEn: formData.nameEn,
        crNumber,
        unifiedNumber: formData.unifiedNumber,
        entityType: formData.entityType,
        crStatus: formData.crStatus || undefined,
        enterpriseSize: formData.enterpriseSize,
        crExpiryDate: formData.crExpiryDate || null,
        foundingDate: formData.foundingDate || null,
        sector: formData.sector || null,
        mainActivity: formData.mainActivity,
        subActivities: formData.subActivities,
        city: formData.city || null,
        region: formData.region,
        nationalAddress: formData.nationalAddress,
        website: formData.website,
        officialEmail: formData.officialEmail,
        phone: formData.phone,
        crFileUrl: crFile?.url || null,
        approved: false,      // pending admin review
        source: 'community',
      })

      const { data: company, error: insertError } = await supabase
        .from('companies')
        .insert([insert])
        .select()
        .single()
      if (insertError) throw insertError

      // Best-effort audit log (tenant lookup via Clerk user id)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        await supabase.from('audit_logs').insert([{
          tenant_id: userData?.tenant_id || null,
          actor_id: user.id,
          action: 'company_add_requested',
          entity: 'company',
          entity_id: company.id,
          meta: JSON.stringify({ name: formData.companyName }),
          created_at: new Date().toISOString(),
        }])
      }

      // Give-to-Get: adding a company to the registry is a contribution, and on
      // a plan that earns it is paid for here. Awarding on submission rather
      // than on approval is deliberate — the entry is a real one either way, and
      // a contributor should not have to wait on a review queue to see that the
      // arrangement is real. Reports are different: those are claims about
      // another company, and only approval establishes they were sound.
      const earned = await awardCredits(entitlements, 'company_added', { userId: user?.id || null })
      if (earned > 0) {
        await refreshEntitlements()
        setCreditsEarned(earned)
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Add company request failed:', err)
      setError(err.message || 'فشل إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        {!submitted ? (
          <>
            <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '14px', padding: '16px 20px', marginBottom: '18px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px' }}>🏢</span>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#3730A3' }}>أضِف شركة غير موجودة في سجلات مرصد</div>
                <div style={{ fontSize: '13px', color: '#4338CA', marginTop: '2px', lineHeight: 1.6 }}>يُراجع طلبك من إدارة مرصد للتحقق من السجل التجاري، وبعد الموافقة تُضاف الشركة لسجلات مرصد وتصبح متاحة للجميع.</div>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', fontSize: '14px', color: '#B91C1C', fontWeight: 700 }}>
                {error}
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>بيانات الشركة</h2>
              <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 24px 0', textAlign: 'right' }}>كل ما كانت البيانات أدق، أسرعت الموافقة</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                {[
                  { name: 'companyName', label: 'اسم الشركة (عربي)', ph: 'مثال: شركة الرياض للتجارة المحدودة', full: true },
                  { name: 'nameEn', label: 'اسم الشركة (إنجليزي)', ph: 'Riyadh Trading Co.' },
                  { name: 'registryNumber', label: 'رقم السجل التجاري', ph: '1010XXXXXX' },
                  { name: 'unifiedNumber', label: 'الرقم الموحّد (700)', ph: '7001234567' },
                  { name: 'entityType', label: 'نوع الكيان', type: 'selectOther', options: ENTITY_TYPES },
                  { name: 'crStatus', label: 'حالة السجل', type: 'select', options: CR_STATUSES },
                  { name: 'enterpriseSize', label: 'حجم المنشأة', type: 'select', options: ENTERPRISE_SIZES },
                  { name: 'foundingDate', label: 'تاريخ التأسيس', type: 'date' },
                  { name: 'crExpiryDate', label: 'تاريخ انتهاء السجل', type: 'date' },
                  { name: 'sector', label: 'القطاع', type: 'selectOther', options: SECTORS },
                  { name: 'mainActivity', label: 'النشاط الرئيسي', type: 'selectOther', options: ACTIVITIES },
                  { name: 'subActivities', label: 'الأنشطة الفرعية', type: 'multi', options: ACTIVITIES, full: true },
                  { name: 'city', label: 'المدينة', type: 'selectOther', options: SAUDI_CITIES },
                  { name: 'region', label: 'المنطقة', type: 'selectOther', options: SAUDI_REGIONS },
                  { name: 'nationalAddress', label: 'العنوان الوطني', ph: 'الرمز البريدي + رقم المبنى', full: true },
                  { name: 'website', label: 'الموقع الإلكتروني', ph: 'https://' },
                  { name: 'officialEmail', label: 'البريد الإلكتروني', ph: 'info@company.sa' },
                  { name: 'phone', label: 'رقم الهاتف', ph: '0112345678' },
                ].map(f => {
                  const opts = (f.options || []).map(o => (typeof o === 'string' ? { v: o, t: o } : o))
                  const isOther = !!otherMode[f.name]
                  const baseInput = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }
                  return (
                    <div key={f.name} style={f.full ? { gridColumn: '1/3' } : undefined}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>{f.label}</label>

                      {f.type === 'select' ? (
                        <select name={f.name} value={formData[f.name]} onChange={handleChange} style={{ ...baseInput, background: '#fff' }}>
                          <option value="">— اختر —</option>
                          {opts.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                        </select>

                      ) : f.type === 'selectOther' ? (
                        <>
                          <select
                            value={isOther ? '__other__' : (formData[f.name] || '')}
                            onChange={(e) => {
                              if (e.target.value === '__other__') { setOther(f.name, true); setFieldValue(f.name, '') }
                              else { setOther(f.name, false); setFieldValue(f.name, e.target.value) }
                            }}
                            style={{ ...baseInput, background: '#fff' }}>
                            <option value="">— اختر —</option>
                            {opts.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                            <option value="__other__">أخرى…</option>
                          </select>
                          {isOther && (
                            <input autoFocus placeholder="اكتب القيمة" value={formData[f.name]} onChange={(e) => setFieldValue(f.name, e.target.value)} style={{ ...baseInput, marginTop: '8px' }} />
                          )}
                        </>

                      ) : f.type === 'multi' ? (
                        <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', background: '#fff' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {opts.map(o => {
                              const on = subActs.includes(o.v)
                              return (
                                <span key={o.v} onClick={() => toggleSubAct(o.v)} style={{ background: on ? '#16A34A' : '#F1F5F9', color: on ? '#fff' : '#475569', borderRadius: '999px', padding: '7px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{on ? '✓ ' : ''}{o.t}</span>
                              )
                            })}
                          </div>
                          {subActs.filter(s => !opts.some(o => o.v === s)).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                              {subActs.filter(s => !opts.some(o => o.v === s)).map(s => (
                                <span key={s} onClick={() => toggleSubAct(s)} style={{ background: '#1E2A52', color: '#fff', borderRadius: '999px', padding: '7px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>✕ {s}</span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <input value={otherActivity} onChange={(e) => setOtherActivity(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOtherActivity() } }} placeholder="إضافة نشاط آخر…" style={{ ...baseInput, padding: '9px 12px', fontSize: '14px' }} />
                            <button type="button" onClick={addOtherActivity} style={{ background: '#EEF2FF', color: '#1E2A52', border: 0, borderRadius: '9px', padding: '0 16px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', flex: 'none', fontFamily: 'inherit' }}>إضافة</button>
                          </div>
                        </div>

                      ) : (
                        <input type={f.type === 'date' ? 'date' : 'text'} placeholder={f.ph} name={f.name} value={formData[f.name]} onChange={handleChange} style={{ ...baseInput, textAlign: f.type === 'date' ? 'right' : undefined }} />
                      )}
                    </div>
                  )
                })}
                <div style={{ gridColumn: '1/3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>مستند داعم (السجل التجاري) — اختياري</label>
                  {crFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1.5px solid #BBF7D0', background: '#F0FDF4', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ fontSize: '20px' }}>📄</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#15803D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{crFile.name}</span>
                      </div>
                      <button type="button" onClick={() => setCrFile(null)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#B91C1C', fontSize: '13px', fontWeight: 800, padding: '7px 12px', cursor: 'pointer', flex: 'none', fontFamily: 'inherit' }}>إزالة</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed #CBD5E1', borderRadius: '12px', padding: '22px', textAlign: 'center', background: '#F8FAFC', color: '#94A3B8', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
                      <UploadIcon />
                      اضغط لاختيار صورة أو PDF للسجل التجاري (حتى 10MB)
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" onChange={handleCrFile} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '11px', marginTop: '26px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={handleSubmit} disabled={submitting} style={{ background: submitting ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 30px', fontSize: '15px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{submitting ? 'جاري الإرسال...' : 'إرسال طلب الإضافة'}</button>
                <button onClick={() => navigate('/search')} disabled={submitting} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: '#16A34A' }}>
              <CheckIcon />
            </div>
            <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم إرسال طلب إضافة الشركة</h2>
            <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.75, margin: '0 auto 22px', maxWidth: '480px' }}>سيراجع فريق مرصد السجل التجاري للتحقق منه. بمجرد الموافقة تُضاف الشركة لقاعدة البيانات وتصبح متاحة للبحث والتقييم من جميع الأعضاء.</p>
            {/* This read "زاد نشاطك كمساهم إلى 78% — 89 مساهمة" for everyone,
                every time: two numbers written into the markup that belonged to
                no one. What replaces it is the ledger entry this submission
                actually created, and it appears only when one was. */}
            {creditsEarned > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 20px', marginBottom: '26px', color: '#15803D' }}>
                <TrendingUpIcon />
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#15803D' }}>
                  +{creditsEarned} نقطة لرصيد شركتك · الرصيد الآن {entitlements?.credits ?? creditsEarned}
                </span>
              </div>
            )}
            <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '22px', maxWidth: '520px', margin: '0 auto 22px' }}>
              <div style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>هل تعاملت مع هذه الشركة؟ قيّمها الآن</div>
              <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7, margin: '0 0 16px' }}>أضِف تقييمك من واقع تعاملك لتساهم في بناء مؤشر ثقتها — وتزيد نشاطك كمساهم.</p>
              <button onClick={() => navigate('/add-report')} style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 32px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
                <EyeIcon />
                تقييم الشركة الآن
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => navigate('/search')} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>العودة للبحث</button>
              <button onClick={() => navigate('/dashboard')} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>لوحة التحكم</button>
            </div>
          </div>
        )}
    </div>
  )
}
