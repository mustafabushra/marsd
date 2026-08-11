import { useCallback, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { openCompanyReport, getCompanyKnowledgeBase, getCompanyReportsTimeline, getCompanyReportsSummary } from '../lib/api'
import { useUserRole } from '../hooks/useUserRole'
import ReportHeader from '../components/report/ReportHeader'
import PaymentBehaviour from '../components/report/PaymentBehaviour'
import EvidenceStrength from '../components/report/EvidenceStrength'
import OfficialIdentity from '../components/report/OfficialIdentity'
import ReportBreakdown from '../components/report/ReportBreakdown'
import ReportTimeline from '../components/report/ReportTimeline'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'
import { useEntitlements } from '../hooks/useEntitlements'
// entitlements helpers and the browser-side view meter are both gone from this
// page: open_company_report decides and records in one call, on the server.
import { LimitReached } from '../components/LimitGate'
import { useLiveData } from '../hooks/useLiveData'
import { SkeletonReport } from '../components/Skeleton'

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
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginRight: '8px' }}>وزنها {r.weight}%</span>
              </div>
              <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
<span style={{ color: '#1E2A52' }}>{r.contribution.toFixed(1)}</span> / {r.weight}
              </div>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, r.score))}%`, height: '100%', background: '#1E2A52', borderRadius: '5px' }}></div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>{r.hint}</div>
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

/**
 * Where the score has been.
 *
 * trust_scores keeps one row per company and every recomputation overwrote the
 * last, so the platform never knew what a company scored yesterday. A company
 * climbing to 92 is a different counterparty from one falling to it, and they
 * rendered identically — same number, same pill, nothing to tell them apart.
 *
 * One point per actual movement, not per recomputation: the score is recomputed
 * on every approval and most leave the number where it was. Plotting those would
 * bury three real changes under three hundred identical ones.
 *
 * A single point is not a trend, and drawing a lone dot across an axis would
 * imply a history that does not exist. It says so instead.
 */
function ScoreHistory({ points }) {
  if (!points || points.length === 0) return null

  const W = 520
  const H = 150
  const PAD = 20

  const fmt = (iso) => {
    const d = new Date(iso)
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
  }

  if (points.length === 1) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>اتجاه المؤشر</h3>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px' }}>
          الاتجاه غالباً أهمّ من الرقم — شركة تصعد إلى ٩٢ ليست شركة تهبط إليه.
        </p>
        <div style={{ background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '12px', padding: '22px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748B' }}>قياس واحد حتى الآن</div>
          <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '7px' }}>
            سُجّل في {fmt(points[0].recorded_at)} — يظهر المنحنى عند أول تغيّر في المؤشر
          </div>
        </div>
      </div>
    )
  }

  const vals = points.map((p) => Number(p.score) || 0)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const span = max - min || 10
  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const line = points.map((p, i) => `${x(i)},${y(Number(p.score) || 0)}`).join(' ')
  const first = vals[0]
  const last = vals[vals.length - 1]
  const delta = last - first
  const band = BAND[points[points.length - 1].risk_band] || BAND.none

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>اتجاه المؤشر</h3>
        <div style={{
          fontSize: '13.5px', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          color: delta > 0 ? '#15803D' : delta < 0 ? '#B91C1C' : '#64748B',
        }}>
          {delta > 0 ? `▲ ارتفع ${delta}` : delta < 0 ? `▼ انخفض ${Math.abs(delta)}` : '— مستقرّ'}
          <span style={{ color: '#64748B', fontWeight: 700, marginRight: '8px' }}>
            منذ {fmt(points[0].recorded_at)}
          </span>
        </div>
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 16px' }}>
        {points.length} قياساً — نقطة عند كل تغيّر فعلي، لا عند كل إعادة احتساب.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '160px', overflow: 'visible' }} role="img"
           aria-label={`اتجاه مؤشر الثقة: ${first} إلى ${last}`}>
        <defs>
          <linearGradient id="tsh" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={band.ring} stopOpacity=".18" />
            <stop offset="1" stopColor={band.ring} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} stroke="#F1F5F9" />
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#F1F5F9" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#F1F5F9" />
        <path d={`M${line.split(' ').join(' L')} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#tsh)" />
        <polyline points={line} fill="none" stroke={band.ring} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.recorded_at + i} cx={x(i)} cy={y(Number(p.score) || 0)}
                  r={i === points.length - 1 ? 5 : 4}
                  fill={i === points.length - 1 ? band.ring : '#fff'}
                  stroke={band.ring} strokeWidth="2">
            <title>{`${fmt(p.recorded_at)}: ${p.score} · ${p.approved_reports ?? 0} تقريراً`}</title>
          </circle>
        ))}
        <text x={x(points.length - 1)} y={y(last) - 12} textAnchor="middle"
              fill="#1E2A52" fontSize="13" fontWeight="800">{last}</text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '6px' }}>
        <span>{fmt(points[0].recorded_at)}</span>
        <span>{fmt(points[points.length - 1].recorded_at)}</span>
      </div>
    </div>
  )
}

const MONTHS_SHORT = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const CARD = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }
const PANEL = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }
const LBL = { fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }
const BIG = { fontSize: '23px', fontWeight: 900, color: '#1E2A52', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }
const SUB = { fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '7px' }
const H3 = { fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }
const LEDE = { fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }

const Grid = ({ children, min = 150 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: '14px' }}>{children}</div>
)
const Stat = ({ label, value, sub }) => (
  <div style={CARD}>
    <div style={LBL}>{label}</div>
    <div style={BIG}>{value}</div>
    {sub && <div style={SUB}>{sub}</div>}
  </div>
)

const fmtDate = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
const sinceDays = (iso) => {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}


const PAY_AR = { full: 'سداد كامل', partial: 'سداد جزئي', late: 'سُدِّد متأخراً', default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق' }


/**
 * Why this report can be relied on — a different question from whether the
 * company can be, and the one nobody else on this market asks.
 *
 * It is also the honest answer to this platform's own weakness: every community
 * report is written by a counterparty or a competitor. Saying how many separate
 * ones agreed is what turns that from a hole into a disclosure.
 */
function ReportConfidence({ q, market }) {
  if (!q) return null
  const sources = Number(q.independent_sources) || 0
  const days = sinceDays(q.last_report_at)
  const completeness = Number(q.profile_completeness) || 0

  const checks = [
    { ok: sources >= 3, text: `${sources} ${sources === 1 ? 'جهة مستقلّة ساهمت' : 'جهات مستقلّة ساهمت'} في البيانات`,
      bad: sources <= 1 ? 'مصدر واحد — تعامل مع الرقم بحذر' : null },
    { ok: days != null && days <= 180, text: days == null ? 'لا تقارير معتمدة بعد' : `آخر تقرير قبل ${days} يوماً` },
    { ok: completeness >= 70, text: `اكتمال سجلّ الشركة ${completeness}%` },
    { ok: q.all_reviewed, text: q.all_reviewed ? 'كل التقارير المستخدمة معتمدة' : 'توجد تقارير قيد المراجعة لم تدخل الحساب' },
    { ok: Number(q.disputes_open) === 0, text: Number(q.disputes_open) === 0 ? 'لا اعتراضات قائمة' : `${q.disputes_open} اعتراضاً قيد النظر` },
    { ok: Number(q.documents) > 0, text: Number(q.documents) > 0 ? `${q.documents} مستنداً رسمياً مرفقاً` : 'لا مستندات رسمية مرفقة' },
  ]

  const passed = checks.filter((c) => c.ok).length
  const stars = '★'.repeat(Math.max(1, Math.round((passed / checks.length) * 5))) +
                '☆'.repeat(5 - Math.max(1, Math.round((passed / checks.length) * 5)))

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ ...H3, margin: 0 }}>لماذا يمكن الوثوق بهذا التقرير</h3>
        <div style={{ fontSize: '19px', color: '#B45309', letterSpacing: '2px' }} aria-label={`${passed} من ${checks.length}`}>{stars}</div>
      </div>
      <p style={{ ...LEDE, marginTop: '6px' }}>
        سؤالٌ غير «هل أثق بهذه الشركة». هذا عن قوّة الأدلّة نفسها.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {checks.map((c) => (
          <div key={c.text} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ color: c.ok ? '#15803D' : '#94A3B8', fontWeight: 900, fontSize: '14px', flex: 'none' }}>{c.ok ? '✔' : '○'}</span>
            <div>
              <span style={{ fontSize: '14px', color: c.ok ? '#334155' : '#94A3B8', fontWeight: 700 }}>{c.text}</span>
              {c.bad && <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 700, marginTop: '3px' }}>{c.bad}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Shown only when the population makes it mean something. A rank over ten
          rated companies is not a statistic, and printing one would undermine
          exactly the credibility this section exists to build. */}
      {market?.percentile != null && Number(market.rated_total) >= 100 && (
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
          <Grid min={160}>
            <Stat label="أفضل من" value={`${market.percentile}%`} sub="من الشركات المصنّفة" />
            <Stat label="الترتيب" value={market.rank} sub={`من ${market.rated_total} شركة`} />
          </Grid>
        </div>
      )}
      {market?.rank != null && Number(market.rated_total) < 100 && (
        <div style={{ marginTop: '16px', fontSize: '12.5px', color: '#64748B', fontWeight: 600, background: '#F8FAFC', borderRadius: '9px', padding: '12px 14px' }}>
          الترتيب بين الشركات المصنّفة لا يُعرض بعد — {market.rated_total} شركة مصنّفة فقط، وترتيبٌ على هذا العدد لا يحمل دلالة إحصائية.
        </div>
      )}
    </div>
  )
}


/**
 * The limits of what this document is.
 *
 * A B2B credit platform without one is exposed, and the cost is a paragraph.
 * Deliberately factual: this reports what was recorded, it does not advise. The
 * difference is not stylistic — "we recommend dealing with them" moves Marsad
 * from reporting facts to giving credit advice, and the liability moves with it.
 */
function Disclaimer() {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px 20px', marginBottom: '18px' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', letterSpacing: '.08em', marginBottom: '8px' }}>إخلاء مسؤولية وحدود الاستخدام</div>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 10px', lineHeight: 1.9 }}>
        يستند هذا التقرير إلى البيانات الرسمية المتاحة والتقارير التجارية المعتمَدة من إدارة مرصد حتى تاريخ إصداره.
        وهو عرضٌ لما سُجّل، لا ضمانٌ لأداء الشركة مستقبلاً ولا توصية ائتمانية.
        القرار التجاري مسؤولية متّخذه، ويُنصح بعدم الاعتماد على مؤشر مرصد وحده دون سياسات الائتمان والتحصيل الداخلية لديك.
      </p>
      {/* Moved here from a standalone blue banner in the middle of the report.
          It is a statement about how the data may be used, which is what this
          section is for — and floating it between two panels interrupted the
          argument without belonging to either side of it. */}
      <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.9 }}>
        🛡 لا تُعرض أسماء الشركات المبلّغة في أي موضع من هذا التقرير — تُعرض المؤشرات المجمّعة
        وقطاعات المُبلِّغين فقط، حفاظاً على خصوصية الأطراف.
      </p>
    </div>
  )
}

const CATEGORY_AR = {
  late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع',
  fraud: 'احتيال', other: 'أخرى',
}

/**
 * What the number means, which the number alone cannot say.
 *
 * A score with no reference point is not information: 74 in construction may be
 * better than 80 in trade, and until now the reader had no way to know. The
 * sector average is the first thing here for that reason.
 *
 * Reporter diversity answers the question every reader has and could not ask —
 * one aggrieved counterparty repeating itself, or six separate companies
 * describing the same behaviour. It already earns points inside the platform
 * layer; saying it plainly is what makes that layer legible.
 */
function ScoreContext({ ctx, score }) {
  if (!ctx || !Object.keys(ctx).length) return null

  const vs = ctx.vs_sector == null ? null : Number(ctx.vs_sector)
  const avg = ctx.sector_avg == null ? null : Math.round(Number(ctx.sector_avg))
  const peers = Number(ctx.sector_count) || 0
  const n = Number(ctx.approved_reports) || 0
  const reporters = Number(ctx.distinct_reporters) || 0
  const cats = ctx.categories || []
  const d = ctx.disputes || {}

  const card = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }
  const label = { fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }
  const big = { fontSize: '23px', fontWeight: 900, color: '#1E2A52', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }
  const sub = { fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '7px' }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>ما يعنيه هذا الرقم</h3>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        المؤشر وحده لا يُقارَن. هذه مراجعه.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px', marginBottom: cats.length ? '22px' : 0 }}>
        {/* Rated peers only. Averaging in the unrated would drag every sector
            toward zero and make this flattering rather than true. */}
        {peers > 0 && avg != null && (
          <div style={card}>
            <div style={label}>مقارنةً بالقطاع</div>
            <div style={{ ...big, color: vs > 0 ? '#15803D' : vs < 0 ? '#B91C1C' : '#1E2A52' }}>
              {vs > 0 ? `أعلى بـ${Math.abs(Math.round(vs))}` : vs < 0 ? `أدنى بـ${Math.abs(Math.round(vs))}` : 'مطابق'}
            </div>
            <div style={sub}>متوسط {ctx.sector || 'القطاع'} {avg} · من {peers} شركة مصنّفة</div>
          </div>
        )}

        <div style={card}>
          <div style={label}>مصادر التقارير</div>
          <div style={big}>{reporters} جهة</div>
          <div style={sub}>
            {n} تقريراً معتمداً
            {reporters === 1 && n > 1 ? ' — من مصدر واحد فقط' : ''}
          </div>
        </div>

        {Number(d.total) > 0 && (
          <div style={card}>
            <div style={label}>اعتراضات الشركة</div>
            <div style={big}>{Number(d.upheld) || 0} مقبول</div>
            <div style={sub}>من {d.total} اعتراضاً · {Number(d.open) || 0} قيد النظر</div>
          </div>
        )}
      </div>

      {cats.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>أسباب التقارير</div>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px' }}>
            نوع المخاطرة، لا حجمها فقط.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
            {cats.map((c) => (
              <div key={c.category}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  <span>{CATEGORY_AR[c.category] || c.category}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748B' }}>{c.count} · {c.pct}%</span>
                </div>
                <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: '#1E2A52', borderRadius: '4px' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


export default function TrustReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useUserRole()
  const systemStatus = useSystemStatus()
  const { entitlements, limitOf, can, loading: entLoading, refresh: refreshEntitlements } = useEntitlements()
  // The server's own words for why it refused. Kept rather than assumed: a
  // refusal can also be "الشركة غير موجودة" or a failure to reach the meter at
  // all, and showing «بلغت حد عمليات البحث» for either of those is a lie the
  // reader cannot check.
  const { getToken } = useAuth()
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')

  /**
   * Ask the server for the PDF and hand it to the browser as a download.
   *
   * The session token goes with the request because the endpoint verifies it
   * and then reads Supabase *as this user* — so the paper can never contain
   * anything the reader could not already see on this screen.
   */
  const downloadPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    setPdfError('')
    try {
      const token = await getToken()
      const r = await fetch(`/api/trust-report-pdf?company=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) {
        const why = await r.json().catch(() => null)
        throw new Error(why?.error || 'تعذّر إصدار التقرير')
      }
      const blob = await r.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `مرصد-${(company?.name || 'تقرير').replace(/[\\/:*?"<>|]/g, '')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (e) {
      setPdfError(e?.message || 'تعذّر إصدار التقرير')
    } finally {
      setPdfBusy(false)
    }
  }

  const [blockedReason, setBlockedReason] = useState('')
  const [quotaBlocked, setQuotaBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [company, setCompany] = useState(null)
  const [report, setReport] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [summary, setSummary] = useState([])
  const [scoreCtx, setScoreCtx] = useState(null)
  const [scoreHistory, setScoreHistory] = useState([])
  const [full, setFull] = useState(null)
  // Null unless the company holds a running partnership. Carries its own label
  // and disclaimer, both read from the database.
  const [partner, setPartner] = useState(null)

  useEffect(() => {
    const loadReport = async () => {
      try {
        if (!id) {
          setError('معرّف الشركة مفقود')
          setLoading(false)
          return
        }

        // Meter the lookup before fetching anything, on the server.
        //
        // This used to be four decisions taken here: has this company been
        // opened this month, is there allowance left, should credits pay for it,
        // and afterwards, record it. Every one of them was advisory. The report
        // functions never asked what plan the caller was on, so anything that
        // skipped this page — the RPC called directly, or simply a page that
        // fetched anyway — read the whole report for nothing. And two tabs
        // opening two companies on the last remaining slot both read the same
        // count and both passed, which no amount of care in the browser can fix.
        //
        // open_company_report does the lot in one transaction: it checks, it
        // debits credits when the plan's own allowance is spent, and it records
        // — under a per-tenant lock. get_company_knowledge_base and the two
        // report functions now refuse to answer until it has. So the block below
        // is what the reader is told, not what stops them.
        const opened = await openCompanyReport(id)
        if (!opened.ok) {
          setBlockedReason(opened.reason || '')
          setQuotaBlocked(true)
          setLoading(false)
          return
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

        // Timeline and summary, in parallel.
        //
        // getCompanyTrends() went with the panel it fed: <ScoreHistory> plots
        // the same series properly, and a request whose result nothing renders
        // is latency charged to every reader for nothing.
        const [timelineData, summaryData] = await Promise.all([
          getCompanyReportsTimeline(id, 8),
          getCompanyReportsSummary(id),
        ])

        // The number's references — sector average, why it was reported, how
        // many separate companies said so. One call, because this is a page
        // load and four round trips to fill one card is three too many.
        try {
          const { getSupabase } = await import('../lib/api')
          const sb = getSupabase()
          const [{ data: ctx }, { data: hist }] = await Promise.all([
            sb.rpc('company_score_context', { p_company_id: id }),
            sb.rpc('company_score_history', { p_company_id: id, p_limit: 24 }),
          ])
          const { data: fullData } = await sb.rpc('company_report_full', { p_company_id: id })
          setFull(fullData || null)

          // Whether the company holds a running partnership with Marsad. The
          // wording and the disclaimer both come from the database so they
          // cannot drift between the screens that show them.
          const { data: partner } = await sb.rpc('company_partner_status', { p_company_id: id })
          setPartner(partner?.is_partner ? partner : null)
          setScoreCtx(ctx || null)
          setScoreHistory(Array.isArray(hist) ? hist : [])
        } catch (e) {
          console.warn('Score context warning:', e)
        }

        setTimeline(timelineData.data || [])
        setSummary(summaryData.data || [])

        // The charge already happened, above and on the server. What is left is
        // to re-read the allowance so the header stops showing the number from
        // before this lookup.
        //
        // It used to be charged down here instead, after the report had loaded,
        // so that a page which failed to load was not billed. That ordering is
        // no longer available: the report functions will not answer until the
        // lookup is recorded, which is exactly what makes them enforceable. The
        // trade is deliberate — a load that fails after the record costs the
        // reader one lookup out of a hundred, and the alternative is a gate that
        // anyone can walk past.
        if (opened.metered) await refreshEntitlements()
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
   * Deliberately not the whole loadReport. That path calls open_company_report,
   * which charges — and since migration 109 it charges every time, including for
   * a company already opened this month. Re-running it here would bill a reader
   * for standing still: a busy company's score moves several times an hour, and
   * a hundred lookups would be gone by lunchtime without anyone doing anything.
   *
   * The edit that this comment used to warn about has now been made, which is
   * why the warning is stated as a fact. Whatever else changes here, the live
   * refresh must never reach the meter.
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

      const [timelineData, summaryData] = await Promise.all([
        getCompanyReportsTimeline(id, 8),
        getCompanyReportsSummary(id),
      ])
      setTimeline(timelineData.data || [])
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
    // Only the allowance case gets the allowance screen. The other refusals —
    // a company that does not exist, a meter that could not be reached — are
    // shown as themselves rather than dressed up as a limit the reader could
    // lift by contributing.
    const quota = blockedReason.includes('انتهت مشاهدات')
    const ceiling = limitOf('searches_per_month')
    return (
      <div style={{ maxWidth: '620px', margin: '40px auto' }}>
        <LimitReached
          title={quota ? 'بلغت حد تقارير الشركات لهذا الشهر' : 'تعذّر فتح التقرير'}
          detail={quota
            ? (`باقتك تتيح ${ceiling} فتحة تقرير في الشهر، وقد استهلكتها. ` +
               'البحث نفسه لا يُحتسب، وكل فتحة لتقرير تُحتسب حتى لو كانت لشركة فتحتها من قبل' +
               (entitlements?.giveToGetEnabled
                 ? '. أضف شركة للسجل أو أرسل تقريراً لكسب رصيد يوسّع حدّك فوراً.'
                 : '.'))
            : (blockedReason || 'لم يتمكّن النظام من فتح هذا التقرير. أعد المحاولة.')}
          giveToGet={quota && !!entitlements?.giveToGetEnabled}
        />
      </div>
    )
  }

  if (loading) {
    return (
    <SkeletonReport />
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
        <p style={{ fontSize: '11px', color: '#64748B', margin: '9px 0 0', lineHeight: 1.8 }}>
          الدرجة تعبّر عن التقارير المعتمدة حتى تاريخ الإصدار أعلاه، وتتغيّر باعتماد تقرير جديد أو سحب تقرير قائم.
        </p>
      </div>
      {/* One header for the whole report.

          It replaced three blocks that each opened with the company's name, its
          score and its risk band — a reader met all three twice over before
          reaching a single new fact. What that header could not do, and this
          one does, is say how much evidence stands behind the number: a score
          built on one report from one counterparty now says so, beside itself,
          where somebody reading only the top of the page will see it. */}
      <ReportHeader
        identity={full?.identity}
        company={company}
        score={score}
        band={report?.riskBand}
        tier={report?.tier}
        market={full?.market}
        behaviour={full?.behaviour}
        quality={full?.quality}
        partner={partner}
        connected={connected}
        liveAt={liveAt}
        actions={<>
          {/* Rendered by Chromium on the server, from one A4 template.
              This called window.print(), which hands the job to the reader's
              machine — their paper size, their margins, their «headers and
              footers» checkbox, their scale. Two people asking for the same
              report got two different papers and neither was the one Marsad
              designed. The engine is still a browser, which was the right call;
              what changed is whose. */}
          <button
            onClick={downloadPdf}
            disabled={pdfBusy}
            style={{ background: pdfBusy ? '#86EFAC' : '#16A34A', color: '#fff', border: 0,
                     borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800,
                     cursor: pdfBusy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {pdfBusy ? '… جارٍ الإصدار' : '⬇ تحميل PDF'}
          </button>
          {pdfError && (
            <span role="alert" style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700 }}>
              {pdfError}
            </span>
          )}
          <button
            onClick={() => navigate('/watchlist')}
            style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0',
                     borderRadius: '10px', padding: '11px 18px', fontSize: '14px',
                     fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            + قائمة المراقبة
          </button>
          <button
            onClick={() => {
              const canAdd = canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0
              if (canAdd) navigate('/add-report', { state: { companyId: id, companyName: company?.name } })
            }}
            disabled={!canPerform(role, 'canAddReport') || !systemStatus.subscriptionActive || !systemStatus.accountActive || systemStatus.creditsBalance <= 0}
            style={{
              background: '#fff',
              color: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? '#1E2A52' : '#94A3B8',
              border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px',
              fontSize: '14px', fontWeight: 800,
              cursor: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? 'pointer' : 'not-allowed',
              opacity: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? 1 : 0.6,
              fontFamily: 'inherit',
            }}>
            ⭐ إضافة تقرير
          </button>
        </>}
      />

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
          {/* The verdict is in <ReportHeader> above, which every tier sees.
              What follows is the evidence, in the order a reader asks for it. */}

          {/* 1 — does it pay on time? The first question a credit decision asks,
                  so it is the first panel and not a row inside a general card. */}
          <PaymentBehaviour
            b={full?.behaviour}
            recent={full?.recent}
            delays={(full?.recent || []).map((r) => r.delay)}
          />

          {/* 2 — how much is behind that? Independent counterparties lead,
                  because ten reports from one company is one opinion. */}
          <EvidenceStrength
            behaviour={full?.behaviour}
            quality={full?.quality}
            sources={full?.sources}
          />

          {/* 3 — why this number. Meaning before arithmetic: a reader wants to
                  know what 72 says before they want to see it added up. */}
          <ScoreContext ctx={scoreCtx} score={score} />
          <ScoreLayers layers={report.layers} score={score} />
          {/* 4 — which way it is moving.

              «سجل تغيّرات التقييم» used to repeat this below as six rows with an
              arrow each: the same series, less of it, and no shape to read. */}
          <ScoreHistory points={scoreHistory} />

          {/* 5 — what the reports said. Categories and stories were two panels
                  with a chart between them; they answer one question, so they
                  are one run now. */}
          {/* This was a row of tiles showing an emoji, a count and the raw
              database code — «⚔️ 2 dispute». The Arabic names were already in
              this file and used by another panel; the emoji came out of a CASE
              statement inside get_company_reports_summary, so the look of the
              report was being decided in SQL. And four bare counts answer «how
              many of each» while hiding «out of how many», which is the only
              version of the question that means anything. */}
          <ReportBreakdown summary={summary} />

          {/* Every row used to draw the same grey 📋: the icon was chosen by
              comparing a category code against Arabic labels, so no branch ever
              matched. And each row printed the reporting company's name, which
              migration 107 stopped the database from returning to anyone but
              Marsad. */}
          <ReportTimeline reports={timeline} />

          {/* 6 — the registry record in full, gaps included.
                  Every field is shown whether or not it has a value: an empty
                  one says the question was asked and the answer is missing,
                  which is a fact about the record and is already part of what
                  profile_completeness feeds into the platform layer. Rendering
                  only what exists made a thin record look as complete as a
                  full one. */}
          <OfficialIdentity
            company={company}
            identity={full?.identity}
            completeness={full?.quality?.profile_completeness}
          />

          {/* 7 — how far to trust all of the above.
                  After the evidence rather than before it: «why is this
                  reliable» is a question a reader has once they have seen what
                  «this» is. */}
          <ReportConfidence q={full?.quality} market={full?.market} />

          {/* 7 — the limits, last, where the reader has seen what they apply to. */}
          <Disclaimer />
        </>
      )}
    </div>
  )
}
