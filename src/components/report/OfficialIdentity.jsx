/**
 * Everything the commercial registration holds, whether or not we hold it.
 *
 * ============================================================================
 * Why empty fields are shown
 * ============================================================================
 * The report used to render only the fields that had values, so a company with
 * four facts and a company with fourteen looked equally complete — the reader
 * had no way to tell a rich record from a thin one, and no way to know which
 * questions had even been asked.
 *
 * An empty field is information. «الرقم الموحّد: —» says the registry number
 * was sought and is missing, which is a fact about the record and is already
 * part of what `profile_completeness` measures inside the platform layer of the
 * score. Hiding it hides a signal the score is already using.
 *
 * The dash is deliberately faint. Present values must stay easy to scan past
 * absent ones — the point is that the gaps are visible, not that they compete.
 */

const PANEL = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
  padding: '24px', marginBottom: '18px',
}

const fmtDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB')
}

/** Groups follow the commercial registration's own layout, not the schema's. */
const GROUPS = [
  {
    title: 'التعريف',
    fields: (c, id) => [
      ['الاسم التجاري', id?.name || c?.name],
      ['الاسم بالإنجليزي', c?.name_en],
      ['رقم السجل التجاري', id?.cr_number || c?.cr_number],
      ['الرقم الوطني الموحّد', c?.unified_number],
    ],
  },
  {
    title: 'الكيان',
    fields: (c, id) => [
      ['نوع المنشأة', id?.entity_type || c?.entity_type],
      ['نوع الشركة', c?.company_type],
      ['صفات الشركة', c?.company_traits],
      ['حجم المنشأة', id?.enterprise_size || c?.enterprise_size],
    ],
  },
  {
    title: 'الحالة والتواريخ',
    fields: (c, id) => [
      ['حالة السجل', id?.cr_status || c?.cr_status],
      ['تاريخ التأسيس', fmtDate(c?.founding_date) || c?.founded_year],
      ['عمر الشركة', id?.age_years != null ? `${id.age_years} سنة` : null],
      ['تاريخ التأكيد السنوي', fmtDate(c?.annual_confirmation_date)],
    ],
  },
  {
    title: 'النشاط',
    fields: (c, id) => [
      ['القطاع', id?.sector || c?.sector],
      ['النشاط الرئيسي', c?.main_activity],
      ['الأنشطة الفرعية', c?.sub_activities],
      ['رأس المال', c?.capital != null ? `${Number(c.capital).toLocaleString('en-US')} ريال` : null],
    ],
  },
  {
    title: 'الموقع والتواصل',
    fields: (c, id) => [
      ['المدينة', id?.city || c?.city],
      ['المنطقة', c?.region],
      ['العنوان الوطني', c?.national_address],
      ['رقم الجوال', c?.phone],
      ['البريد الإلكتروني', c?.official_email],
      ['الموقع الإلكتروني', c?.website],
    ],
  },
]

function Row({ k, v }) {
  const empty = v === null || v === undefined || v === '' || v === '—'
  const isUrl = !empty && typeof v === 'string' && /^https?:\/\//i.test(v)
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: '16px', padding: '9px 0', borderBottom: '1px solid #F8FAFC',
    }}>
      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, flex: 'none' }}>{k}</span>
      <span style={{
        fontSize: '13.5px', fontWeight: empty ? 700 : 800, textAlign: 'end',
        color: empty ? '#CBD5E1' : '#0F172A', minWidth: 0, wordBreak: 'break-word',
      }}>
        {empty ? '—'
          : isUrl
            ? <a href={v} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8' }}>{v}</a>
            : String(v)}
      </span>
    </div>
  )
}

export default function OfficialIdentity({ company, identity, completeness }) {
  if (!company && !identity) return null

  const groups = GROUPS.map((g) => ({ title: g.title, rows: g.fields(company, identity) }))
  const all = groups.flatMap((g) => g.rows)
  const missing = all.filter(([, v]) => v === null || v === undefined || v === '' || v === '—').length

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          الهوية الرسمية
        </h3>
        {missing > 0 && (
          <span style={{ fontSize: '12.5px', color: '#B45309', fontWeight: 700 }}>
            {missing} من {all.length} حقلاً غير مسجَّل
            {completeness != null && ` · اكتمال الملف ${Math.round(completeness)}%`}
          </span>
        )}
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        بيانات السجل التجاري كما هي مسجَّلة لدى مرصد. الحقل غير المسجَّل يظهر بشرطة.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '10px 32px' }}>
        {groups.map((g) => (
          <div key={g.title}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#94A3B8',
                          letterSpacing: '.04em', marginBottom: '4px' }}>
              {g.title}
            </div>
            {g.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
