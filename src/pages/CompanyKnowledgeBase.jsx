import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'
import { LIMITS } from '../lib/validate.js'

/**
 * /admin/knowledge-base/companies — the company registry, and where each row
 * came from.
 *
 * The repository described what exists and nothing about who put it there: a
 * name, a CR number, a completeness bar. On a platform whose product is other
 * companies' reputations that is the question that eventually gets asked, and
 * it is always asked about a specific bad row — this entry is wrong, who filed
 * it, and what else have they filed.
 *
 * companies carries no submitter column; a company can be added by anyone and
 * the row does not remember. The trail is the audit entry written when it was
 * filed, and that entry has only carried a tenant since 036 — so records added
 * before then read "غير مُتتبَّع" and there is nothing to recover. Saying so is
 * the honest answer; leaving the column out entirely was not.
 */

const COMPLETENESS_FIELDS = ['name', 'cr_number', 'unified_number', 'sector', 'main_activity', 'city', 'region', 'entity_type', 'cr_status', 'founding_date', 'website', 'official_email', 'phone']
const COLS = '1.9fr 1.1fr 1.4fr 1.1fr 0.9fr 1.1fr'

export default function CompanyKnowledgeBase() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyUntraced, setOnlyUntraced] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase().rpc('kb_companies', { p_limit: 500 })
      if (e) throw e
      setCompanies((data || []).map((c) => {
        const filled = COMPLETENESS_FIELDS.filter((f) => c[f] != null && String(c[f]).trim() !== '').length
        return { ...c, completeness: Math.round((filled / COMPLETENESS_FIELDS.length) * 100) }
      }))
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المستودع')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['companies', 'trust_scores'] })

  const sourceLabel = (c) => {
    if (!c.approved) return 'بانتظار التحقق'
    return c.source === 'official' ? 'واثق (رسمي)' : 'مجتمعي'
  }
  const compColor = (p) => (p >= 90 ? '#16A34A' : p >= 60 ? '#F59E0B' : '#DC2626')

  const q = query.trim()
  const filtered = companies.filter((c) => {
    if (onlyUntraced && c.contributor_tenant_id) return false
    if (!q) return true
    return (c.name || '').includes(q)
      || (c.cr_number || '').includes(q)
      || (c.unified_number || '').includes(q)
      || (c.contributor_name || '').includes(q)
  })

  const untraced = companies.filter((c) => !c.contributor_tenant_id).length

  if (loading) return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )

  return (
    <div>
      <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '18px' }}>📚</span>
        <span style={{ fontSize: '13.5px', color: '#5B21B6', fontWeight: 700, flex: 1 }}>مستودع مرجعي مركزي لبيانات الشركات ومصدر كل سجل — للقراءة والتدقيق، وليس شاشة إدارة تشغيلية.</span>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      {untraced > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 18px', marginBottom: '16px', fontSize: '13.5px', color: '#92400E', fontWeight: 700, textAlign: 'right', lineHeight: 1.9 }}>
          ⚠️ {untraced} شركة أُضيفت قبل تفعيل نسبة السجلات، ولا يمكن معرفة من أضافها — سجلّها كُتب بلا كيان ولا يمكن استرجاعه. كل ما يُضاف من الآن مُتتبَّع.
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '260px', display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input maxLength={LIMITS.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو السجل التجاري أو الشركة التي أضافته" style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <button
          onClick={() => setOnlyUntraced((v) => !v)}
          style={{ padding: '11px 18px', background: onlyUntraced ? '#1E2A52' : '#fff', color: onlyUntraced ? '#fff' : '#334155', border: onlyUntraced ? 0 : '1.5px solid #E2E8F0', borderRadius: '11px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          غير مُتتبَّعة فقط
        </button>
        <span style={{ alignSelf: 'center', fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{filtered.length} شركة</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>اسم الشركة</span><span>السجل التجاري</span><span>أضافها</span><span>مصدر البيانات</span><span>تقارير عنها</span><span>اكتمال البيانات</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>لا توجد شركات مطابقة</div>
        ) : filtered.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{c.name}{c.verified ? ' ✔' : ''}</span>
            <span style={{ fontSize: '13px', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{c.cr_number || '—'}</span>
            <div>
              {c.contributor_name ? (
                <>
                  <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{c.contributor_name}</div>
                  {c.contributed_at && (
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{new Date(c.contributed_at).toLocaleDateString('en-GB')}</div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: '12.5px', color: '#CBD5E1', fontWeight: 700 }}>غير مُتتبَّع</span>
              )}
            </div>
            <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{sourceLabel(c)}</span>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>
              {c.reports_about}
              {c.trust_score != null && <span style={{ color: '#64748B' }}> · درجة {c.trust_score}</span>}
            </span>
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
