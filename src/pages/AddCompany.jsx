import { lazy, Suspense, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/react'
import RequiredCompanyDocuments, { uploadCompanyDocuments } from '../components/RequiredCompanyDocuments'
import RegistryLookup from '../components/RegistryLookup'
import { getSupabase, buildCompanyInsert } from '../lib/api'
import { CheckIcon, EyeIcon, TrendingUpIcon, UploadIcon } from '../components/icons'
import { useEntitlements } from '../hooks/useEntitlements'

// Lazy on purpose. Behind this sheet sit tesseract.js, pdfjs and a QR reader —
// several megabytes that somebody typing a company's details by hand must never
// download. They arrive only if the import button is pressed.
const CompanyImportSheet = lazy(() => import('../components/CompanyImportSheet'))

import SearchableSelect from '../components/form/SearchableSelect'
import TagsInput from '../components/form/TagsInput'
import ActivityPicker from '../components/form/ActivityPicker'
import { CR_STATUS, ENTITY_TYPE, COMPANY_TYPE, COMPANY_TRAITS, CR_TYPE, ENTITY_SIZE, crStatusToDb, matchOption, splitEntityType } from '../lib/reference/companyOptions'
import { CITIES, REGIONS } from '../lib/extraction/data/cities'
import { SECTORS } from '../lib/extraction/data/isic'

// Every city the extractor knows, so the form and the import agree on spelling.
// Sorted in Arabic rather than by insertion, because a person scrolling a list
// of a hundred cities is looking alphabetically.
const SAUDI_CITIES = [...new Set([...CITIES.values()].map((c) => c.name))]
  .sort((a, b) => a.localeCompare(b, 'ar'))

export default function AddCompany() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useUser()
  const { entitlements } = useEntitlements()
  // Shown as a promise, not a receipt: the award happens when an administrator
  // approves the entry.
  const pointsOnApproval = Number(entitlements?.giveToGetRules?.earn?.company_added?.points) || 0
  const [submitted, setSubmitted] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Which fields arrived from a document rather than the keyboard, so the form
  // can mark them after the sheet closes.
  const [imported, setImported] = useState({})
  // The verification link and the official facts with no form field, carried
  // from the import sheet to the insert.
  const [officialSource, setOfficialSource] = useState(null)
  // What the person changed about what the import read. Written after the
  // company saves — see applyImport.
  const [corrections, setCorrections] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    companyName: location.state?.companyName || '',
    nameEn: '',
    registryNumber: location.state?.registryNumber || '',
    unifiedNumber: '',
    entityType: '',
    companyType: '',
    companyTraits: '',
    crType: '',
    crStatus: '',
    enterpriseSize: '',
    crExpiryDate: '',
    foundingDate: '',
    annualConfirmationDate: '',
    crVersion: '',
    capital: '',
    sector: '',
    city: '',
    region: '',
    nationalAddress: '',
    website: '',
    officialEmail: '',
    phone: ''
  })

  // The two list fields. Kept out of formData because they are arrays of
  // objects, not strings, and every helper above treats formData as flat.
  const [activities, setActivities] = useState([])   // [{code, name}]
  const [managers, setManagers] = useState([])       // ['اسم']

  const [crFile, setCrFile] = useState(null) // { name, url(base64) }
  // The documents the checklist marks required, held as File objects until
  // there is a company id to name their folder after.
  const [docFiles, setDocFiles] = useState({})
  const [docTypes, setDocTypes] = useState([])

  // The "أخرى…" escape hatch and the pill-based activity picker are gone. Every
  // list field is now a searchable select that accepts a value outside its list
  // directly, so there is no second mode to toggle into — and activities are
  // objects with codes, which a comma-joined string could not carry.
  const setFieldValue = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
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

  // Everything in the patch has already been shown to the person and was
  // editable on the review screen, so it is applied as typed input would be.
  const applyImport = (patch, source, origin = null) => {
    const next = { ...patch }

    // A document says «شركة ذات مسؤولية محدودة» on one line. The form asks two
    // questions — company or establishment, and which legal form — so the one
    // string is split before it lands, or `companyType` stays empty next to an
    // `entityType` that swallowed the whole sentence.
    if (patch.entityType) {
      const { entityType, companyType } = splitEntityType(patch.entityType)
      if (entityType) next.entityType = entityType
      if (companyType && !patch.companyType) next.companyType = companyType
    }

    // Snap every list field onto its canonical option. This is what makes an
    // imported value and a picked value the same string: «نشط» read from a
    // certificate has to be the same «نشط» the dropdown stores, or the two
    // records never group together.
    for (const field of ['crStatus', 'companyType', 'companyTraits', 'crType', 'enterpriseSize']) {
      const raw = next[field]
      if (!raw) continue
      // No match keeps the original text. The select accepts a value outside
      // its list and marks it, which is better than discarding what the
      // document actually said.
      next[field] = matchOption(field, raw) ?? raw
    }

    // «561010 المطاعم مع الخدمة» → a code and a name, so the picker shows it as
    // a recognised activity rather than an untagged string.
    const asActivity = (t) => {
      const m = /^(\d{4,7})\s+(.+)$/.exec(String(t).trim())
      return m ? { code: m[1], name: m[2] } : { code: null, name: String(t).trim() }
    }
    const list = [
      ...(patch.mainActivity ? [patch.mainActivity] : []),
      ...String(patch.subActivities || '').split('،').map((x) => x.trim()).filter(Boolean),
    ]
    if (list.length) setActivities(list.map(asActivity))
    delete next.mainActivity
    delete next.subActivities

    if (origin?.managers?.length) setManagers(origin.managers)

    setFormData((prev) => ({ ...prev, ...next }))
    setImported(Object.fromEntries(Object.keys(next).map((k) => [k, source])))
    setOfficialSource(origin?.verificationUrl || origin?.officialData ? origin : null)
    // Held until the company is saved, so each correction can be tied to the
    // record it was made on. If the person abandons the form they are dropped —
    // a correction to a company that was never created teaches nothing.
    setCorrections(origin?.corrections ?? [])
  }

  const handleSubmit = async () => {
    setError('')
    if (!formData.companyName.trim()) {
      setError('اسم الشركة مطلوب')
      return
    }
    // Also enforced by trg_company_requires_cr_doc, which is what actually binds
    // — this only spares the person a round trip and a database message.
    if (!crFile) {
      setError('صورة السجل التجاري مطلوبة — أرفقها قبل الإرسال')
      return
    }
    // A company arrives complete or it does not arrive.
    //
    // The alternative was accepting it with one document and chasing the rest
    // from a company that has no account and no reason to answer — which is how
    // the registry filled with records a reviewer could not verify.
    const missing = docTypes.filter((t) => !docFiles[t.doc_type])
    if (missing.length) {
      setError(`مستندات ناقصة: ${missing.map((t) => t.label).join('، ')}`)
      return
    }
    setSubmitting(true)
    try {
      const supabase = getSupabase()

      // No ceiling on adding companies, on any plan. A registry entry is a fact
      // about an entity — verifiable, neutral, reviewed before it is published,
      // and harmless if wrong. Capping it would throttle the asset the product
      // is built on in order to protect nothing.

      // The registration number first, because it is the identity.
      //
      // Checking the name alone lets the same company in twice under two
      // spellings — «مجموعة ظهران التجارية» and «مجموعه ظهران التجاريه» are one
      // business and two records. The CR number is the thing the state issued,
      // it is what the import now fills in reliably, and it is the only field
      // where "already present" is a fact rather than a resemblance.
      const cr = formData.registryNumber.trim()
      if (cr) {
        const { data: sameCr } = await supabase
          .from('companies')
          .select('id, name')
          .eq('cr_number', cr)
          .limit(1)
        if (sameCr?.length) {
          setError(`⚠️ رقم السجل ${cr} مسجّل بالفعل باسم «${sameCr[0].name}» — افتح سجلها بدل إضافتها من جديد.`)
          setSubmitting(false)
          return
        }
      }

      // Then the name, which still catches a duplicate added without a CR.
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

      // The status the person picked is one Arabic word; the database keeps it
      // as two coded columns. See crStatusToDb — the trust score penalises
      // «مشطوب» and «تحت التصفية» differently, and it can only do that if the
      // distinction survives the save.
      const status = crStatusToDb(formData.crStatus)

      // Activities carry their ISIC codes. `main_activity` and `sub_activities`
      // are still written as text because the search index reads them — the
      // coded list goes to its own column rather than replacing them.
      const asText = (a) => (a.code ? `${a.code} ${a.name}` : a.name)

      const insert = buildCompanyInsert({
        name: formData.companyName,
        nameEn: formData.nameEn,
        crNumber,
        unifiedNumber: formData.unifiedNumber,
        entityType: formData.entityType,
        crStatus: status.cr,
        enterpriseSize: formData.enterpriseSize,
        crExpiryDate: formData.crExpiryDate || null,
        foundingDate: formData.foundingDate || null,
        sector: formData.sector || null,
        mainActivity: activities[0] ? asText(activities[0]) : '',
        subActivities: activities.slice(1).map(asText).join('، '),
        city: formData.city || null,
        region: formData.region,
        nationalAddress: formData.nationalAddress,
        website: formData.website,
        officialEmail: formData.officialEmail,
        phone: formData.phone,
        crFileUrl: crFile?.url || null,
        verificationUrl: officialSource?.verificationUrl || null,
        officialData: officialSource?.officialData || null,
        approved: false,      // pending admin review
        source: 'community',
      })

      // Columns buildCompanyInsert does not know about yet. Added here rather
      // than threaded through it, because that helper is a validated allowlist
      // for the fields the enums cover and these carry no enum.
      Object.assign(insert, {
        official_status: status.official,
        company_type: formData.companyType || null,
        company_traits: formData.companyTraits || null,
        cr_type: formData.crType || null,
        cr_version: formData.crVersion || null,
        annual_confirmation_date: formData.annualConfirmationDate || null,
        // An empty box is "not stated", not zero. Storing 0 would say this
        // company has no capital, which is a different claim.
        capital: formData.capital === '' ? null : Number(formData.capital),
        activities: activities.length ? activities : null,
        managers: managers.length ? managers : null,
      })

      const { data: company, error: insertError } = await supabase
        .from('companies')
        .insert([insert])
        .select()
        .single()
      if (insertError) throw insertError

      // Where the extractor got it wrong, now that there is a company to hang
      // it on. Deliberately not awaited into the success path: this is telemetry
      // for improving the parser, and a company that saved must not be reported
      // as failed because a research table refused a row.
      if (corrections.length && user?.id) {
        supabase.from('extraction_corrections').insert(
          corrections.map((c) => ({ ...c, user_id: user.id, company_id: company.id })),
        ).then(({ error: corrErr }) => {
          if (corrErr) console.warn('extraction_corrections:', corrErr.message)
        })
      }

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

      // The documents, now that the folder has a name.
      //
      // After the audit entry rather than before: if a file fails to reach
      // storage the company is still recorded and still reviewable, and the
      // person is told which one to send again. Losing the whole submission
      // over one upload would be the worse trade.
      if (user?.id) {
        const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        const failed = await uploadCompanyDocuments(docFiles, {
          companyId: company.id, tenantId: me?.tenant_id || null, userId: user.id,
        })
        if (failed.length) {
          const names = failed.map((k) => docTypes.find((t) => t.doc_type === k)?.label || k)
          setError(`أُضيفت الشركة، لكن تعذّر رفع: ${names.join('، ')} — أرسلها من صفحة الشركة`)
        }
      }

      // No credit is awarded here. It used to be, on the reasoning that a
      // contributor should not wait on a review queue — which ignored what the
      // reward buys: forty junk entries would reach the monthly ceiling of 200
      // points immediately, and 200 points is 200 extra searches. Paying before
      // verification pays for unverified data, on a platform whose product is
      // verified data.
      //
      // The row is inserted with approved: false and earns when an
      // administrator approves it, in AdminRequests.

      setSubmitted(true)
    } catch (err) {
      console.error('Add company request failed:', err)
      setError(err.message || 'فشل إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Fill the form from a government record.
   *
   * Only the empty fields. Somebody who has already typed a name and then
   * pastes a registration number should not watch their own words replaced by
   * the Ministry's — the register is better evidence, but it is not a reason to
   * overwrite what a person deliberately entered.
   */
  function fillFromRegistry(row) {
    setFormData((d) => {
      const take = (current, incoming) => (String(current || '').trim() ? current : (incoming ?? ''))
      return {
        ...d,
        companyName: take(d.companyName, row.name),
        registryNumber: take(d.registryNumber, row.cr_number),
        unifiedNumber: take(d.unifiedNumber, row.unified_number),
        entityType: take(d.entityType, row.legal_entity),
        crType: take(d.crType, row.registration_type),
        capital: take(d.capital, row.capital != null ? String(row.capital) : ''),
        region: take(d.region, row.region),
        city: take(d.city, row.city),
        // Only a real date. The Ministry's CSV has carried values like
        // «12:22.7» — Excel's idea of a date after a round trip — and putting
        // one of those into a date field is worse than leaving it empty.
        foundingDate: take(d.foundingDate,
          /^\d{4}-\d{2}-\d{2}/.test(String(row.registration_date || '')) 
            ? String(row.registration_date).slice(0, 10) : ''),
      }
    })
    setError('')
  }

  // How much is still missing, derived once so the button, its title and its
  // label cannot disagree about it.
  const docsLeft = docTypes.filter((t) => !docFiles[t.doc_type]).length
  const ready = !!crFile && docsLeft === 0

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        {!submitted ? (
          <>
            {/* Asked while the number is being typed, not after the form is
                filled. Now that Marsad holds the national register, most
                companies somebody thinks to add are already in it — and
                learning that at the end wastes everything they entered. */}
            <RegistryLookup
              crNumber={formData.registryNumber}
              unifiedNumber={formData.unifiedNumber}
              onFill={fillFromRegistry}
            />

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

            <Suspense fallback={null}>
              <CompanyImportSheet open={importOpen}
                                  onClose={() => setImportOpen(false)}
                                  onApply={applyImport} />
            </Suspense>

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0' }}>بيانات الشركة</h2>
                  <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 24px 0' }}>كل ما كانت البيانات أدق، أسرعت الموافقة</p>
                </div>
                <button type="button" onClick={() => setImportOpen(true)}
                        style={{ background: '#EEF2FF', color: '#1E2A52', border: '1.5px solid #C7D2FE', borderRadius: '11px', padding: '12px 20px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flex: 'none' }}>
                  ⚡ استيراد من السجل التجاري
                </button>
              </div>

              {Object.keys(imported).length > 0 && (
                <div style={{ background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: '11px', padding: '13px 16px', marginBottom: '20px', fontSize: '13.5px', color: '#15803D', fontWeight: 700, lineHeight: 1.9 }}>
                  عُبِّئ {Object.keys(imported).length} حقلاً من المستند — راجعها قبل الإرسال.
                  {officialSource?.verificationUrl && (
                    <div style={{ fontWeight: 600, marginTop: '5px' }}>
                      المصدر: صفحة تحقّق مركز الأعمال — يُحفظ رابطها مع السجل.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                {[
                  // Grouped the way the registration itself reads: who it is,
                  // then what it is, then when, then where, then how to reach
                  // it. Somebody copying from the paper document moves down the
                  // page rather than hunting.
                  { name: 'companyName', label: 'اسم المنشأة', ph: 'مثال: مجموعة ظهران التجارية', full: true },
                  { name: 'nameEn', label: 'الاسم بالإنجليزي', ph: 'Dhahran Trading Group' },
                  { name: 'crStatus', label: 'حالة السجل', type: 'select', options: CR_STATUS },

                  { name: 'entityType', label: 'نوع المنشأة', type: 'select', options: ENTITY_TYPE },
                  { name: 'companyType', label: 'نوع الشركة', type: 'select', options: COMPANY_TYPE,
                    // Meaningless for an establishment, so it is disabled rather
                    // than left inviting an answer that cannot be true.
                    onlyWhen: (d) => d.entityType !== 'مؤسسة' },
                  { name: 'companyTraits', label: 'صفات الشركة', type: 'select', options: COMPANY_TRAITS,
                    onlyWhen: (d) => d.entityType !== 'مؤسسة' },
                  { name: 'crType', label: 'نوع السجل', type: 'select', options: CR_TYPE },

                  { name: 'registryNumber', label: 'رقم السجل التجاري', ph: '4030304834', inputMode: 'numeric' },
                  { name: 'unifiedNumber', label: 'الرقم الوطني الموحّد', ph: '7004309873', inputMode: 'numeric' },
                  { name: 'crVersion', label: 'رقم نسخة السجل', type: 'number', ph: '1' },
                  { name: 'capital', label: 'رأس المال (ريال)', type: 'number', ph: '50000' },

                  { name: 'foundingDate', label: 'تاريخ قيد السجل التجاري', type: 'date' },
                  // The new commercial registration law removed the expiry date
                  // and replaced renewal with a yearly confirmation. Asking for
                  // an expiry date would be asking for something the document no
                  // longer prints.
                  { name: 'annualConfirmationDate', label: 'تاريخ التأكيد السنوي للسجل التجاري', type: 'date',
                    note: 'يحل محل تاريخ الانتهاء في السجل الجديد' },
                  // Shown only when something put a value in it — an older
                  // certificate that still carries one. Hiding it outright
                  // would mean the import could fill a field nobody can see,
                  // and nothing may be saved unreviewed.
                  { name: 'crExpiryDate', label: 'تاريخ انتهاء السجل', type: 'date',
                    note: 'من سجل قديم — النظام الجديد لا يتضمن تاريخ انتهاء',
                    onlyWhen: (d) => !!d.crExpiryDate },
                  { name: 'enterpriseSize', label: 'حجم المنشأة', type: 'select', options: ENTITY_SIZE },

                  { name: 'city', label: 'مدينة عنوان الأعمال', type: 'select', options: SAUDI_CITIES, free: true },
                  { name: 'region', label: 'المنطقة', type: 'select', options: REGIONS, free: true },
                  { name: 'nationalAddress', label: 'العنوان الوطني', ph: 'الحي، الرمز البريدي، رقم المبنى', full: true },

                  { name: 'phone', label: 'رقم الجوال', type: 'tel', ph: '0555000142' },
                  { name: 'officialEmail', label: 'البريد الإلكتروني', type: 'email', ph: 'info@company.sa' },
                  { name: 'website', label: 'عنوان الموقع الإلكتروني', type: 'url', ph: 'https://company.sa' },
                  { name: 'sector', label: 'القطاع', type: 'select', options: SECTORS, free: true },

                  { name: 'activities', label: 'أنشطة السجل التجاري', type: 'activities', full: true },
                  { name: 'managers', label: 'المديرون', type: 'managers', full: true },
                ].map(f => {
                  if (f.onlyWhen && !f.onlyWhen(formData)) return null
                  const baseInput = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }
                  const fromImport = imported[f.name]
                  return (
                    <div key={f.name} style={f.full ? { gridColumn: '1/3' } : undefined}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                        {f.label}
                        {fromImport && (
                          <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '6px', padding: '2px 7px', fontSize: '10.5px', fontWeight: 800 }}>
                            من المستند
                          </span>
                        )}
                      </label>
                      {f.note && (
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '-3px', marginBottom: '6px', lineHeight: 1.7 }}>
                          {f.note}
                        </div>
                      )}

                      {f.type === 'select' ? (
                        <SearchableSelect
                          value={formData[f.name]}
                          onChange={(v) => {
                            setFieldValue(f.name, v)
                            // Picking a city fills the region, because the two
                            // are not independent facts and asking twice invites
                            // a contradiction. Only when empty: a region the
                            // person typed themselves is not overwritten.
                            if (f.name === 'city' && !formData.region) {
                              const hit = [...CITIES.values()].find((c) => c.name === v)
                              if (hit) setFieldValue('region', hit.region)
                            }
                          }}
                          options={f.options}
                          allowFree={!!f.free}
                          placeholder="اختر أو ابحث…" />

                      ) : f.type === 'activities' ? (
                        <ActivityPicker value={activities} onChange={setActivities} />

                      ) : f.type === 'managers' ? (
                        <TagsInput value={managers} onChange={setManagers}
                                   placeholder="اسم المدير، ثم Enter" />

                      ) : (
                        <input
                          type={['date', 'number', 'email', 'url', 'tel'].includes(f.type) ? f.type : 'text'}
                          inputMode={f.inputMode}
                          placeholder={f.ph}
                          name={f.name}
                          value={formData[f.name]}
                          onChange={handleChange}
                          // Latin-script fields read left-to-right even on an
                          // Arabic page; forcing them right puts the cursor and
                          // the punctuation in the wrong place.
                          dir={['email', 'url', 'tel', 'number'].includes(f.type) || f.inputMode === 'numeric' ? 'ltr' : undefined}
                          style={{ ...baseInput, textAlign: ['email', 'url', 'tel', 'number'].includes(f.type) || f.inputMode === 'numeric' ? 'left' : 'right' }} />
                      )}
                    </div>
                  )
                })}
                <div style={{ gridColumn: '1/3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>
                    السجل التجاري <span style={{ color: '#B91C1C' }}>*</span>
                    <span style={{ fontWeight: 600, color: '#64748B' }}> — مطلوب لإضافة الشركة</span>
                  </label>
                  {crFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1.5px solid #BBF7D0', background: '#F0FDF4', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ fontSize: '20px' }}>📄</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#15803D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{crFile.name}</span>
                      </div>
                      <button type="button" onClick={() => setCrFile(null)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#B91C1C', fontSize: '13px', fontWeight: 800, padding: '7px 12px', cursor: 'pointer', flex: 'none', fontFamily: 'inherit' }}>إزالة</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed #FCA5A5', borderRadius: '12px', padding: '22px', textAlign: 'center', background: '#FEF2F2', color: '#B91C1C', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>
                      <UploadIcon />
                      اضغط لاختيار صورة أو PDF للسجل التجاري (حتى 10MB)
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" onChange={handleCrFile} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '11px', marginTop: '26px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                {/* Disabled rather than failing on click: the document is the one
                    requirement a person cannot satisfy by retyping, and finding
                    that out after pressing send is the wrong moment. */}
                <div style={{ marginBottom: '16px' }}>
                  <RequiredCompanyDocuments
                    files={docFiles}
                    onChange={setDocFiles}
                    onTypesLoaded={setDocTypes}
                    disabled={submitting}
                  />
                </div>

                <button onClick={handleSubmit} disabled={submitting || !ready}
                        title={docsLeft ? `ناقص ${docsLeft} مستند` : (!crFile ? 'أرفق صورة السجل التجاري أولاً' : '')}
                        style={{ background: submitting || !ready ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 30px', fontSize: '15px', fontWeight: 800, cursor: submitting || !ready ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {/* The label says what is missing rather than «إرسال» greyed
                      out with no reason. A disabled button that does not
                      explain itself is a dead end somebody stares at. */}
                  {submitting ? 'جاري الإرسال...'
                    : !crFile ? 'أرفق السجل التجاري للإرسال'
                    : docsLeft ? `ناقص ${docsLeft} مستند`
                    : 'إرسال طلب الإضافة'}
                </button>
                <button onClick={() => navigate('/search')} disabled={submitting} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: '#16A34A' }}>
              <CheckIcon size={34} />
            </div>
            <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم إرسال طلب إضافة الشركة</h2>
            <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.75, margin: '0 auto 22px', maxWidth: '480px' }}>سيراجع فريق مرصد السجل التجاري للتحقق منه. بمجرد الموافقة تُضاف الشركة لقاعدة البيانات وتصبح متاحة للبحث والتقييم من جميع الأعضاء.</p>
            {/* This read "زاد نشاطك كمساهم إلى 78% — 89 مساهمة" for everyone,
                every time: two numbers written into the markup that belonged to
                nobody. It says what will happen instead, and only where points
                are actually on offer. */}
            {entitlements?.giveToGetEnabled && pointsOnApproval > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 20px', marginBottom: '26px', color: '#15803D' }}>
                <TrendingUpIcon />
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#15803D' }}>
                  +{pointsOnApproval} نقطة لرصيد شركتك عند اعتماد الإضافة
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
