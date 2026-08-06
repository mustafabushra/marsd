/**
 * How much is behind the number?
 *
 * ============================================================================
 * Why independent parties lead, not report count
 * ============================================================================
 * Ten reports from one company is one opinion filed ten times. Ten reports from
 * ten companies is a pattern. The old report showed the count and buried the
 * diversity, which is the figure that makes the score hard to manipulate and
 * the one a reader should weigh first.
 *
 * The strength bar is a count of how many of five evidence conditions hold. It
 * is a summary of what is already displayed beside it, not a new score — the
 * trust score is computed in the database and nothing here touches it.
 */

const PANEL = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
  padding: '24px', marginBottom: '18px',
}

const STRENGTH = [
  { max: 1, label: 'ضعيفة جداً', fg: '#B91C1C', bg: '#DC2626' },
  { max: 2, label: 'ضعيفة', fg: '#C2410C', bg: '#F97316' },
  { max: 3, label: 'متوسطة', fg: '#B45309', bg: '#F59E0B' },
  { max: 4, label: 'جيدة', fg: '#15803D', bg: '#22C55E' },
  { max: 5, label: 'قوية', fg: '#15803D', bg: '#16A34A' },
]

export default function EvidenceStrength({ behaviour, quality, sources }) {
  if (!behaviour && !quality) return null

  const reports = Number(behaviour?.reports_approved ?? 0)
  const parties = Number(behaviour?.counterparties ?? 0)
  const independent = Number(quality?.independent_sources ?? 0)
  const docs = Number(quality?.documents ?? 0)
  const disputes = Number(quality?.disputes_open ?? 0)
  const rejected = Number(behaviour?.reports_rejected ?? 0)

  // Five plain conditions. Each is a fact already shown in the grid below, so
  // the bar summarises the panel rather than introducing a judgement of its own.
  const met = [
    reports >= 3,
    parties >= 2,
    independent >= 2,
    docs >= 1,
    disputes === 0 && reports > 0,
  ].filter(Boolean).length

  const s = STRENGTH.find((x) => met <= x.max) ?? STRENGTH[STRENGTH.length - 1]

  const cells = [
    { n: reports, label: 'تقرير معتمد', hint: 'راجعته إدارة مرصد' },
    { n: parties, label: 'طرف مقابل', hint: 'شركات مختلفة تعاملت معها', lead: true },
    { n: independent, label: 'مصدر مستقل', hint: 'لا تربطها ملكية مشتركة' },
    { n: docs, label: 'مستند موثّق', hint: 'طابقته إدارة مرصد' },
    { n: disputes, label: 'اعتراض مفتوح', hint: 'اعتراضات لم تُحسم', bad: disputes > 0 },
    { n: rejected, label: 'تقرير مرفوض', hint: 'لم يستوفِ شروط الاعتماد' },
  ]

  const total = Array.isArray(sources) ? sources.reduce((a, x) => a + Number(x.count ?? 0), 0) : 0

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          قوة الأدلّة
        </h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: s.fg }}>{s.label}</span>
          <span style={{ display: 'inline-flex', gap: '3px' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{
                width: '18px', height: '7px', borderRadius: '3px',
                background: i < met ? s.bg : '#E2E8F0',
              }} />
            ))}
          </span>
        </span>
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        على ماذا يستند هذا التقييم، وكم مصدراً مستقلاً وراءه.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px' }}>
        {cells.map((c) => (
          <div key={c.label} style={{
            background: c.lead ? '#EEF2FF' : '#F8FAFC',
            border: `1px solid ${c.lead ? '#C7D2FE' : '#E2E8F0'}`,
            borderRadius: '11px', padding: '14px 15px',
          }}>
            <div style={{
              fontSize: '26px', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              color: c.bad ? '#B91C1C' : c.n === 0 ? '#CBD5E1' : c.lead ? '#1E2A52' : '#0F172A',
            }}>
              {c.n}
            </div>
            <div style={{ fontSize: '12.5px', color: '#334155', fontWeight: 800, marginTop: '6px' }}>
              {c.label}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginTop: '2px', lineHeight: 1.6 }}>
              {c.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Sectors, never names. Who reported is private; what kind of business
          they are is what tells a reader whether the evidence is one corner of
          one market or a spread across several. */}
      <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '11px' }}>
          قطاعات المُبلِّغين
        </div>
        {total > 0 ? (
          <div style={{ display: 'grid', gap: '7px' }}>
            {sources.map((x) => (
              <div key={x.sector} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700,
                               minWidth: '120px', flex: 'none' }}>
                  {x.sector || 'غير محدد'}
                </span>
                <div style={{ flex: 1, height: '18px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${(Number(x.count) / total) * 100}%`, height: '100%',
                                background: '#1E2A52', borderRadius: '6px' }} />
                </div>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A',
                               minWidth: '20px', textAlign: 'end', flex: 'none' }}>
                  {x.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#CBD5E1', fontWeight: 700 }}>—</div>
        )}
      </div>

      {(reports < 3 || parties < 2) && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px',
                      padding: '13px 16px', marginTop: '18px', fontSize: '12.5px',
                      color: '#475569', fontWeight: 600, lineHeight: 1.9 }}>
          ⓘ عشرة تقارير من عشر جهات مختلفة تساوي أضعاف عشرة تقارير من جهة واحدة.
          عدد الأطراف المستقلة هو ما يجعل التقييم صعب التلاعب.
        </div>
      )}
    </div>
  )
}
