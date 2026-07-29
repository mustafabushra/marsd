import { useCallback, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCompanyKnowledgeBase, getCompanyReportsTimeline, getCompanyTrends, getCompanyReportsSummary } from '../lib/api'
import { DocumentIcon } from '../components/icons'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'
import { useEntitlements } from '../hooks/useEntitlements'
import { isPaidWithCredits, spendCredits, UNLIMITED } from '../lib/entitlements'
import { hasViewedCompany, recordCompanyView } from '../lib/companyViews'
import { LimitReached } from '../components/LimitGate'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * The risk band, read from the database rather than decided here.
 *
 * The page used to print "● مخاطر منخفضة" for every full-tier company, in green,
 * whatever the number was — a company scoring 30 was labelled low risk beside
 * its own 30. The band is computed by compute_trust_score against thresholds an
 * operator can move from the admin panel, so deriving it again in the browser
 * would make this screen disagree with the database the moment they did.
 */
const BAND = {
  low:    { label: 'مخاطر منخفضة', bg: '#ECFDF5', fg: '#15803D', ring: '#16A34A' },
  medium: { label: 'مخاطر متوسطة', bg: '#FFFBEB', fg: '#B45309', ring: '#F59E0B' },
  high:   { label: 'مخاطر مرتفعة', bg: '#FEF2F2', fg: '#B91C1C', ring: '#DC2626' },
  none:   { label: 'بيانات غير كافية', bg: '#F1F5F9', fg: '#475569', ring: '#94A3B8' },
}

function RiskPill({ band, prelim = false }) {
  const b = BAND[band] || BAND.none
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ background: b.bg, color: b.fg, borderRadius: '999px', padding: '6px 16px', fontSize: '13.5px', fontWeight: 800, display: 'inline-block' }}>
        ● {b.label}
      </div>
      {prelim && (
        <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700, marginTop: '7px' }}>
          تقييم أوّلي — يكتمل عند ٥ تقارير
        </div>
      )}
    </div>
  )
}

/**
 * Where the number came from.
 *
 * /faq has described a three-layer model since before one existed. It exists
 * now, and the weights and each layer's score are stored on the score row — so
 * this shows the same arithmetic the database performed instead of asking the
 * reader to take 86 on trust. A percentage nobody can check is a claim, not a
 * disclosure.
 */
function ScoreLayers({ layers, score }) {
  if (!layers) return null

  const rows = [
    { key: 'official',  label: 'البيانات الرسمية', hint: 'حالة السجل التجاري وتوثيق مرصد' },
    { key: 'community', label: 'تجربة المجتمع',    hint: 'التقارير المعتمَدة: السداد والتأخير والتعثّر' },
    { key: 'platform',  label: 'تحليل المنصّة',     hint: 'تنوّع المُبلِّغين وحداثة التقارير واكتمال السجلّ' },
  ].map((r) => {
    const l = layers[r.key] || {}
    const s = Number(l.score) || 0
    const w = Number(l.weight) || 0
    return { ...r, score: s, weight: w, contribution: (s * w) / 100 }
  })

  const total = rows.reduce((a, r) => a + r.contribution, 0)

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>كيف حُسب هذا المؤشر</h3>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        ثلاث طبقات، لكلٍّ وزنها. المجموع أدناه هو الرقم المعروض أعلى الصفحة.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '7px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{r.label}</span>
                <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginRight: '8px' }}>وزنها {r.weight}%</span>
              </div>
              <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(r.score)} × {r.weight}% = <span style={{ color: '#1E2A52' }}>{r.contribution.toFixed(1)}</span>
              </div>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, r.score))}%`, height: '100%', background: '#1E2A52', borderRadius: '5px' }}></div>
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>{r.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #E2E8F0', marginTop: '20px', paddingTop: '14px' }}>
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#334155' }}>المجموع</span>
        <span style={{ fontSize: '20px', fontWeight: 900, color: '#1E2A52', fontVariantNumeric: 'tabular-nums' }}>
          {total.toFixed(1)} ≈ {Math.round(score)}
        </span>
      </div>
    </div>
  )
}

/** The evidence the community layer was built from — counts, not adjectives. */
function ScoreEvidence({ facts }) {
  if (!facts) return null
  const n = Number(facts.approved_reports) || 0
  if (!n) return null

  const items = [
    { label: 'تقارير معتمدة', value: n, sub: 'وحدها تدخل الحساب' },
    { label: 'سُدِّدت كاملةً', value: `${facts.on_time_pct ?? 0}%`, sub: `${facts.on_time ?? 0} من ${n}` },
    { label: 'حالات عدم سداد', value: facts.defaults ?? 0, sub: n ? `${Math.round(((facts.defaults || 0) / n) * 100)}% من التقارير` : '' },
    { label: 'متوسط التأخير', value: `${facts.avg_delay_days ?? 0} يوم`, sub: 'نقطة لكل ٥ أيام، بحدّ ٢٠' },
  ]

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>الأدلّة تحت طبقة المجتمع</h3>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        التقرير قيد المراجعة أو المرفوض لا يدخل هذه الأرقام.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px' }}>
        {items.map((it) => (
          <div key={it.label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>{it.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E2A52', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 600, marginTop: '7px' }}>{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TrustReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useUserRole()
  const systemStatus = useSystemStatus()
  const { entitlements, limitOf, remaining, can, loading: entLoading, refresh: refreshEntitlements } = useEntitlements()
  const [quotaBlocked, setQuotaBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [company, setCompany] = useState(null)
  const [report, setReport] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [trends, setTrends] = useState([])
  const [summary, setSummary] = useState([])

  useEffect(() => {
    const loadReport = async () => {
      try {
        if (!id) {
          setError('معرّف الشركة مفقود')
          setLoading(false)
          return
        }

        // Meter the lookup before fetching anything. A company already opened
        // this month is free to open again, so a revisit never costs and never
        // records a second time.
        const tenantId = entitlements?.tenantId
        const ceiling = limitOf('searches_per_month')
        let alreadySeen = true
        let payWithCredits = false

        if (tenantId && ceiling !== UNLIMITED && !entitlements?.degraded && !entitlements?.enforcementDisabled) {
          alreadySeen = await hasViewedCompany(tenantId, id)
          if (!alreadySeen) {
            if (remaining('searches_per_month') <= 0) {
              setQuotaBlocked(true)
              setLoading(false)
              return
            }
            payWithCredits = isPaidWithCredits(entitlements, 'searches_per_month')
          }
        } else if (tenantId) {
          alreadySeen = await hasViewedCompany(tenantId, id)
        }

        // Load complete company profile from Knowledge Base (single source of truth)
        const kb = await getCompanyKnowledgeBase(id)
        if (!kb) {
          setError('الشركة غير موجودة')
          setLoading(false)
          return
        }

        // Supplement with identity fields directly from companies
        // (the knowledge-base RPC doesn't return the extended Layer-1 columns).
        let identity = {}
        try {
          const { getSupabase } = await import('../lib/api')
          const { data: c } = await getSupabase()
            .from('companies')
            .select('name_en, entity_type, cr_status, cr_expiry_date, founding_date, founded_year, main_activity, sub_activities, region, national_address, website, official_email, phone, unified_number, verified, verified_at, verification_source')
            .eq('id', id)
            .single()
          identity = c || {}
        } catch (e) {
          console.warn('Identity fetch warning:', e)
        }

        // Set company data from Knowledge Base + identity supplement
        setCompany({
          id: kb.id,
          name: kb.name,
          city: kb.city || '—',
          sector: kb.sector || '—',
          cr_number: kb.cr_number,
          ...identity,
        })

        // The knowledge base returns the score but not how it was reached. The
        // three layers, their weights and their contributions are stored on
        // trust_scores.breakdown by compute_trust_score, so the reader can be
        // shown the arithmetic rather than asked to trust a number — which is
        // what /faq has been promising since before the layers existed.
        let ts = null
        try {
          const { getSupabase } = await import('../lib/api')
          const { data } = await getSupabase()
            .from('trust_scores')
            .select('score, risk_band, tier, approved_reports, breakdown, computed_at')
            .eq('company_id', id)
            .maybeSingle()
          ts = data
        } catch (e) {
          console.warn('Trust score fetch warning:', e)
        }

        const reportObj = {
          status: kb.total_reports_count >= 5 ? 'full' : kb.total_reports_count >= 2 ? 'preliminary' : 'limited',
          tier: ts?.tier || kb.trust_tier || 'none',
          score: ts?.score ?? kb.trust_score ?? 0,
          approvedReports: ts?.approved_reports ?? kb.approved_reports_count ?? 0,
          // Read, never derived from the score here. The bands live in
          // trust_score_rules and an operator can move them from the admin
          // panel; recomputing them in the browser would make this screen
          // disagree with the database the moment they did.
          riskBand: ts?.risk_band || 'none',
          layers: ts?.breakdown?.layers || null,
          facts: ts?.breakdown || null,
          computedAt: ts?.computed_at || null,
        }
        setReport(reportObj)

        // Load Timeline, Trends, and Summary in parallel
        const [timelineData, trendsData, summaryData] = await Promise.all([
          getCompanyReportsTimeline(id, 8),
          getCompanyTrends(id),
          getCompanyReportsSummary(id),
        ])

        setTimeline(timelineData.data || [])
        setTrends(trendsData.data || [])
        setSummary(summaryData.data || [])

        // Charged only once the report actually loaded, and only the first time
        // this company is opened this month. Recording before the fetch would
        // bill a member for a page that then failed.
        if (entitlements?.tenantId && !alreadySeen) {
          // Past the plan's own allowance, the lookup is paid for out of the
          // balance. The debit runs first: recording the view without it would
          // consume the lookup and leave the balance untouched.
          if (payWithCredits) {
            const paid = await spendCredits(entitlements, 'search_unlock')
            if (!paid) { setQuotaBlocked(true); setLoading(false); return }
          }
          await recordCompanyView(entitlements.tenantId, id, null)
          await refreshEntitlements()
        }
      } catch (err) {
        setError(err.message || 'خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }

    // Wait for entitlements: starting before they resolve would meter against
    // an empty plan and let the first lookup through unmetered every time.
    if (!entLoading) loadReport()
  }, [id, entLoading])

  /**
   * Re-read only what can move while the page is open: the score and the
   * evidence under it.
   *
   * Deliberately not the whole loadReport. That path meters the lookup against
   * the plan, and re-running it on every change event would put a metered read
   * on a timer — harmless today because a company already opened this month is
   * free to open again, but one edit to that rule away from charging a reader
   * for standing still.
   *
   * This is the page the product exists for. A report approved while someone is
   * reading it changes the number they are deciding on, and the old behaviour
   * was that they would never know.
   */
  const refreshScore = useCallback(async () => {
    if (!id) return
    try {
      const kb = await getCompanyKnowledgeBase(id)
      if (!kb) return
      setReport((prev) => (prev ? { ...prev, ...kb, score: kb.trust_score || 0, approvedReports: kb.approved_reports_count || 0 } : prev))

      const [timelineData, trendsData, summaryData] = await Promise.all([
        getCompanyReportsTimeline(id, 8),
        getCompanyTrends(id),
        getCompanyReportsSummary(id),
      ])
      setTimeline(timelineData.data || [])
      setTrends(trendsData.data || [])
      setSummary(summaryData.data || [])
    } catch (err) {
      console.error('Score refresh failed:', err)
    }
  }, [id])

  // Filtered to this company: a score moving somewhere else is not news to this
  // page, and an unfiltered subscription would re-read on every approval on the
  // platform.
  const { connected, liveAt } = useLiveData(refreshScore, {
    tables: ['trust_scores', 'reports', 'disputes'],
    filter: `company_id=eq.${id}`,
    enabled: !!id && !loading,
  })

  if (quotaBlocked) {
    const ceiling = limitOf('searches_per_month')
    return (
      <div style={{ maxWidth: '620px', margin: '40px auto' }}>
        <LimitReached
          title="بلغت حد عمليات البحث لهذا الشهر"
          detail={
            `باقتك تتيح ${ceiling} شركة في الشهر، وقد اطّلعت عليها جميعاً. ` +
            'الشركات التي فتحتها هذا الشهر تبقى متاحة لك بلا احتساب إضافي' +
            (entitlements?.giveToGetEnabled
              ? '. أضف شركة للسجل أو أرسل تقريراً لكسب رصيد يوسّع حدّك فوراً.'
              : '.')
          }
          giveToGet={!!entitlements?.giveToGetEnabled}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#64748B' }}>جاري تحميل بيانات الشركة...</div>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div style={{ maxWidth: '520px', margin: '40px auto', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', margin: '0 auto 14px' }}>⚠</div>
        <div style={{ fontSize: '18px', fontWeight: 900, color: '#991B1B', marginBottom: '12px' }}>{error || 'لم يتم العثور على البيانات'}</div>
        <p style={{ fontSize: '14px', color: '#B91C1C', marginBottom: '24px', lineHeight: 1.7 }}>قد تكون الشركة لم تعد متوفرة أو قد يكون هناك خطأ في الوصول إليها.</p>
        <button
          onClick={() => navigate('/search')}
          style={{
            background: '#1E2A52', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 28px',
            fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit'
          }}>
          ← العودة للبحث
        </button>
      </div>
    )
  }

  // 'thin' rather than 'locked'. The state means this company has fewer than two
  // approved reports, which is a fact about the evidence and nothing to do with
  // anyone's plan — but it was labelled "🔒 متاح في الباقة الأساسية", so a reader
  // was told to buy something that would not have changed what they saw. The
  // same badge appeared to Marsad's own staff, who have every feature there is.
  const tier = report.status === 'full' ? 'full'
    : report.status === 'limited' ? 'thin'
    : report.tier === 'preliminary' ? 'prelim'
    : 'none'

  // Two different questions, deliberately kept apart. `tier` asks whether this
  // company has enough approved reports to support a full score — a property of
  // the data. This asks whether the viewer's plan includes seeing how that score
  // was reached. Conflating them would tell a free member that a well-covered
  // company has thin data, which is false and discourages the contribution that
  // would deepen it — and the badge below was that exact conflation, running the
  // other way.
  const canSeeFull = can('full_trust_report')
  const score = report.score || 0

  // A trust score is a statement about a company at a moment. It moves with
  // every report approved or withdrawn, so one printed without a date says
  // nothing a reader can rely on — and this page had no date anywhere on it.
  const issuedAt = new Date()
  const issuedLabel = issuedAt.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div>
      <style>{`
        /* What belongs on a printed trust report and what does not. Printing the
           interface — sidebar, buttons, the badge that says the page is live —
           produces a document that looks like a screenshot rather than a
           statement, and the reader cannot tell when it was true. */
        @media print {
          aside, header, nav, button, .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          main, div { box-shadow: none !important; }
          a[href]::after { content: none !important; }
          @page { margin: 14mm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Only on paper: what the screen shows in its chrome. */}
      <div className="print-only" style={{ marginBottom: '18px', paddingBottom: '12px', borderBottom: '2px solid #1E2A52' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#1E2A52' }}>مرصد — تقرير الثقة</div>
            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '3px' }}>
              {company?.name} · سجل {company?.cr_number || '—'}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700, textAlign: 'left' }}>
            صدر في {issuedLabel}
          </div>
        </div>
        <p style={{ fontSize: '11px', color: '#94A3B8', margin: '9px 0 0', lineHeight: 1.8 }}>
          الدرجة تعبّر عن التقارير المعتمدة حتى تاريخ الإصدار أعلاه، وتتغيّر باعتماد تقرير جديد أو سحب تقرير قائم.
        </p>
      </div>
      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '30px',
        marginBottom: '18px'
      }}>
        <div style={{ display: 'flex', gap: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '66px', height: '66px', borderRadius: '16px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 900, flex: 'none' }}>
            {company?.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>{company?.name}</h1>
              {/* The badge is the strongest claim on the page: it says someone
                  at Marsad checked this record. A claim like that without a date
                  is worth less than none — a company verified two years ago and
                  a company verified this morning are not the same thing, and the
                  reader could not tell them apart. */}
              {company?.verified && (
                <span
                  title={company.verified_at ? `وُثّقت في ${new Date(company.verified_at).toLocaleDateString('en-GB')}` : 'بلا تاريخ توثيق مسجَّل'}
                  style={{ background: '#EFF6FF', color: '#1D4ED8', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}
                >
                  ✔ موثّقة
                  {company.verified_at && (
                    <span style={{ fontWeight: 600, opacity: 0.75 }}> · {new Date(company.verified_at).toLocaleDateString('en-GB')}</span>
                  )}
                </span>
              )}
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>● سجل نشط</span>
              <LiveBadge connected={connected} liveAt={liveAt} />
            </div>
            {company?.name_en && (
              <div style={{ fontSize: '13.5px', color: '#94A3B8', fontWeight: 600, marginBottom: '8px', textAlign: 'right' }}>{company.name_en}</div>
            )}
            <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap', fontSize: '14px', color: '#64748B', fontWeight: 600 }}>
              {[
                ['القطاع', company?.sector],
                ['النشاط الرئيسي', company?.main_activity],
                ['نوع الكيان', company?.entity_type],
                ['المدينة', company?.city],
                ['المنطقة', company?.region],
                ['السجل', company?.cr_number],
                ['الرقم الموحّد', company?.unified_number],
                ['تاريخ الانتهاء', company?.cr_expiry_date],
              ].filter(([, v]) => v && v !== '—').map(([label, v]) => (
                <span key={label}>{label}: {v}</span>
              ))}
              {company?.website && (
                <span>الموقع: <a href={company.website} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', fontWeight: 700 }}>{company.website}</a></span>
              )}
            </div>
          </div>

          {tier === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '24px 30px', minWidth: '240px' }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🔒</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>لا توجد بيانات معتمدة كافية<br />لإصدار تقييم موثوق</div>
            </div>
          )}

          {tier === 'full' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(${BAND[report.riskBand]?.ring || '#94A3B8'} 0% ${Math.min(score, 100)}%,#E2E8F0 ${Math.min(score, 100)}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{Math.round(score)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <RiskPill band={report.riskBand} />
            </div>
          )}

          {tier === 'prelim' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(#F59E0B 0% ${Math.min(score, 100)}%,#E2E8F0 ${Math.min(score, 100)}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{Math.round(score)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <RiskPill band={report.riskBand} prelim />
            </div>
          )}

          {/* Not blurred and not locked: there is no hidden number here. The
              company has too few approved reports for a score to mean anything,
              and saying so invites the contribution that would fix it — which
              blurring a number nobody has computed does not. */}
          {tier === 'thin' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', border: '3px dashed #E2E8F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span style={{ fontSize: '30px', color: '#CBD5E1' }}>—</span>
                <span style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700 }}>لا توجد درجة</span>
              </div>
              <div style={{ background: '#F1F5F9', color: '#475569', borderRadius: '999px', padding: '6px 16px', fontSize: '12.5px', fontWeight: 800, marginTop: '12px' }}>
                بيانات غير كافية
              </div>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 600, marginTop: '7px', maxWidth: '170px', lineHeight: 1.8 }}>
                تحتاج تقريرين معتمدين على الأقل — أضِف تقريرك عن تعاملك معها
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '22px', paddingTop: '22px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>مستوى موثوقية التقرير</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A' }}>{report?.approvedReports || 0} تقرير معتمد</span>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: Math.min(((report?.approvedReports || 0) / 50) * 100, 100) + '%', height: '100%', background: 'linear-gradient(90deg,#16A34A,#4ADE80)', borderRadius: '6px' }}></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* The browser's own print-to-PDF rather than a PDF library.
                Arabic in jsPDF means embedding a font and hand-shaping the text,
                and it still breaks on ligatures; the browser already renders
                this page correctly in RTL and every browser can save the result
                as PDF. What was here before had no onClick at all. */}
            <button
              onClick={() => window.print()}
              style={{
                background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 18px',
                fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              ⬇ تحميل PDF
            </button>
            <button
              onClick={() => navigate('/watchlist')}
              style={{
                background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px',
                fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit'
              }}>
              + قائمة المراقبة
            </button>
            <button
              onClick={() => {
                const canAdd = canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0
                if (canAdd) {
                  navigate('/add-report', { state: { companyId: id, companyName: company?.name } })
                }
              }}
              disabled={!canPerform(role, 'canAddReport') || !systemStatus.subscriptionActive || !systemStatus.accountActive || systemStatus.creditsBalance <= 0}
              style={{
                background: '#fff',
                color: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? '#1E2A52' : '#94A3B8',
                border: '1.5px solid #E2E8F0',
                borderRadius: '10px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? 'pointer' : 'not-allowed',
                opacity: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? 1 : 0.6,
                fontFamily: 'inherit'
              }}>
              ⭐ إضافة تقرير
            </button>
          </div>
        </div>
      </div>

      {tier === 'none' && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '17px', fontWeight: 900, color: '#B45309', marginBottom: '8px' }}>⚠ بيانات غير كافية لإصدار تقييم موثوق</div>
          <p style={{ fontSize: '14.5px', color: '#92400E', margin: 0, lineHeight: 1.7 }}>عدد التقارير المعتمدة الحالية ({report?.approvedReports || 0}) أقل من الحد الأدنى المطلوب (5 تقارير). ساهم بتقريرك لمساعدة المجتمع على بناء تقييم دقيق.</p>
        </div>
      )}

      {/* The score itself is shown to everyone above; what the plan governs is
          the reasoning behind it — composition, breakdown, history, and the
          reports it rests on. A free member sees that the number is real and
          that there is substance behind it, which is a better argument for
          upgrading than an empty page. */}
      {tier === 'full' && !canSeeFull && (
        <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', marginBottom: '18px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#92400E', margin: '0 0 10px' }}>🔒 التفاصيل الكاملة لمؤشر الثقة</h3>
          <p style={{ fontSize: '14px', color: '#78350F', lineHeight: 1.9, margin: '0 auto 18px', maxWidth: '520px' }}>
            لهذه الشركة تقييم كامل مبنيّ على {report?.approvedReports || 0} تقريراً معتمداً.
            تركيبة الدرجة، وملخص التقارير، وسجل تغيّر التقييم، وأحدث التقارير — تأتي مع الباقات المدفوعة.
          </p>
          <button
            onClick={() => navigate('/subscription')}
            style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            عرض الباقات
          </button>
        </div>
      )}

      {tier === 'full' && canSeeFull && (
        <>
          <ScoreLayers layers={report.layers} score={score} />
          <ScoreEvidence facts={report.facts} />
          <div style={{
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'right' }}>تركيبة مؤشر الثقة</h3>
              <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>كيف تم احتساب الدرجة</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', height: '52px' }}>
              <div style={{ width: '30%', background: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px', textAlign: 'center', padding: '0 8px' }}>البيانات الرسمية 30%</div>
              <div style={{ width: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px', textAlign: 'center', padding: '0 8px' }}>بيانات المجتمع 50%</div>
              <div style={{ width: '20%', background: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px', textAlign: 'center', padding: '0 8px' }}>المنصة 20%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '18px' }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>عدد التقارير المعتمدة</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>{report?.approvedReports || 0}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>مؤشر الثقة الحالي</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>{Math.round(score)}<span style={{ fontSize: '16px', color: '#94A3B8' }}> / 100</span></div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>حالة التقييم</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803D', marginTop: '6px' }}>موثوق</div>
            </div>
          </div>

          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
            <span style={{ fontSize: '18px' }}>🛡</span>
            <span style={{ fontSize: '13.5px', color: '#3730A3', fontWeight: 700 }}>لا تُعرض أسماء الشركات المبلّغة — تُعرض المؤشرات المجمّعة فقط حفاظاً على الخصوصية.</span>
          </div>

          {/* Reports Summary */}
          <div style={{
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>ملخص التقارير</h3>
            {summary.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {summary.map((item, idx) => (
                  <div key={idx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: item.color, marginBottom: '4px' }}>{item.count}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{item.category}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8' }}>لا توجد تقارير بعد</div>
            )}
          </div>

          {/* Trends */}
          {trends.length > 0 && (
            <div style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>سجل تغيّرات التقييم</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {trends.slice(0, 6).map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px',
                      background: '#F8FAFC', borderRadius: '12px', transition: 'all 0.3s ease',
                      border: '1px solid #E2E8F0'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F1F5F9'
                      e.currentTarget.style.transform = 'translateX(-4px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#F8FAFC'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '18px' }}>
                        {item.trend_direction === 'improving' ? '📈' : item.trend_direction === 'declining' ? '📉' : '➡️'}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{item.period_month}</div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>{item.avg_score}% • {item.approved_reports} تقرير</div>
                      </div>
                    </div>
                    <div style={{
                      background: item.trend_direction === 'improving' ? '#ECFDF5' : item.trend_direction === 'declining' ? '#FEE2E2' : '#F1F5F9',
                      color: item.trend_direction === 'improving' ? '#15803D' : item.trend_direction === 'declining' ? '#DC2626' : '#64748B',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      {item.trend_direction === 'improving' ? '✓ تحسّن' : item.trend_direction === 'declining' ? '✗ تراجع' : '→ مستقر'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>أحدث التقارير المعتمدة</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {timeline.map((report, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '14px', paddingBottom: '14px', borderBottom: idx < timeline.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: '18px' }}>
                      {report.severity === 'دفع متأخر' ? '💳' : report.severity === 'عدم التزام' ? '⚠️' : report.severity === 'ممتاز' ? '⭐' : report.severity === 'قضايا' ? '⚔️' : '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                          {new Date(report.created_at).toLocaleDateString('en-GB')}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{report.title}</div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '6px' }}>
                        {report.summary}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                        من {report.reporter_company_name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
