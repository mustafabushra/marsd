import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'

const COMPLETENESS_FIELDS = ['name', 'cr_number', 'unified_number', 'sector', 'main_activity', 'city', 'region', 'entity_type', 'cr_status', 'founding_date', 'website', 'official_email', 'phone']

export default function CompanyKnowledgeBase() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('companies')
        .select('id, name, cr_number, unified_number, sector, main_activity, city, region, entity_type, cr_status, founding_date, website, official_email, phone, source, verified, verified_at, approved')
        .order('created_at', { ascending: false })
        .limit(500)
      setCompanies((data || []).map((c) => {
        const filled = COMPLETENESS_FIELDS.filter((f) => c[f] != null && String(c[f]).trim() !== '').length
        return { ...c, completeness: Math.round((filled / COMPLETENESS_FIELDS.length) * 100) }
      }))
    } catch (err) {
      console.error('Error loading companies repository:', err)
    } finally {
      setLoading(false)
    }
  }

  const sourceLabel = (c) => {
    if (!c.approved) return 'بانتظار التحقق'
    return c.source === 'official' ? 'واثق (رسمي)' : 'مجتمعي'
  }
  const compColor = (p) => (p >= 90 ? '#16A34A' : p >= 60 ? '#F59E0B' : '#DC2626')

  const filtered = companies.filter((c) => {
    const q = query.trim()
    return !q || (c.name || '').includes(q) || (c.cr_number || '').includes(q) || (c.unified_number || '').includes(q)
  })

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل المستودع...</div>

  return (
    <div>
      <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
        <span style={{ fontSize: '18px' }}>📚</span>
        <span style={{ fontSize: '13.5px', color: '#5B21B6', fontWeight: 700 }}>مستودع مرجعي مركزي للبيانات الرسمية للشركات — للقراءة والتدقيق، وليس شاشة إدارة تشغيلية.</span>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو السجل التجاري أو الرقم الموحّد" style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <span style={{ alignSelf: 'center', fontSize: '13px', color: '#94A3B8', fontWeight: 700 }}>{filtered.length} شركة</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.3fr 1fr 1.2fr', padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
          <span>اسم الشركة</span><span>السجل التجاري</span><span>الرقم الموحّد</span><span>مصدر البيانات</span><span>آخر تحقق</span><span>اكتمال البيانات</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>لا توجد شركات</div>
        ) : filtered.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.3fr 1fr 1.2fr', padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{c.name}{c.verified ? ' ✔' : ''}</span>
            <span style={{ fontSize: '13px', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{c.cr_number || '—'}</span>
            <span style={{ fontSize: '13px', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{c.unified_number || '—'}</span>
            <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{sourceLabel(c)}</span>
            <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>{c.verified_at ? new Date(c.verified_at).toLocaleDateString('ar-SA') : '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '7px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden', minWidth: '50px' }}>
                <div style={{ height: '100%', borderRadius: '5px', background: compColor(c.completeness), width: `${c.completeness}%` }}></div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>{c.completeness}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
