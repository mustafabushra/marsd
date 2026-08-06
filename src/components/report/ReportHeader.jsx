import { LiveBadge } from '../LiveBadge'

/**
 * One header for the whole report.
 *
 * ============================================================================
 * What this replaces
 * ============================================================================
 * The report opened with three blocks that each said the same things: a page
 * header, an executive summary, and a company card. A reader met the company's
 * name three times, the score three times and the risk band three times before
 * reaching a single new fact.
 *
 * So there is now one. It answers, in order: who is this, what is the verdict,
 * how much evidence is behind it, and what are the registry facts.
 *
 * ============================================================================
 * Nothing here is computed
 * ============================================================================
 * The score, the band, the tier and every count arrive exactly as the database
 * produced them. This file decides what to show first and how to draw it. The
 * verdict sentence is selected *by band* rather than derived from the score, so
 * it can never disagree with the badge beside it — which is how a panel here
 * once printed «موثوق» in green on a high-risk company.
 */

const BAND = {
  low: {
    label: 'مخاطر منخفضة',
    verdict: 'السجل التجاري وتجارب المتعاملين لا تُظهر ما يمنع التعامل.',
    bg: '#ECFDF5', fg: '#15803D', ring: '#16A34A', soft: '#BBF7D0',
  },
  medium: {
    label: 'مخاطر متوسطة',
    verdict: 'هناك ملاحظات تستحق المراجعة قبل الالتزام بتعامل كبير.',
    bg: '#FFFBEB', fg: '#B45309', ring: '#F59E0B', soft: '#FDE68A',
  },
  high: {
    label: 'مخاطر مرتفعة',
    verdict: 'التقارير المعتمدة تُظهر مشكلات متكررة — راجع التفاصيل قبل أي التزام.',
    bg: '#FEF2F2', fg: '#B91C1C', ring: '#DC2626', soft: '#FECACA',
  },
  none: {
    label: 'بيانات غير كافية',
    verdict: 'لا توجد تقارير معتمدة كافية لإصدار تقييم — غياب البيانات ليس تزكية.',
    bg: '#F1F5F9', fg: '#475569', ring: '#94A3B8', soft: '#E2E8F0',
  },
}

/** Three quarters of a circle, so it reads as a gauge and not a loading ring. */
function ScoreDial({ score, band, known }) {
  const b = BAND[band] || BAND.none
  const pct = known ? Math.max(0, Math.min(100, Number(score) || 0)) : 0
  const R = 58
  const C = 2 * Math.PI * R
  const dash = C * 0.75

  return (
    <div style={{ position: 'relative', width: '150px', height: '150px', flex: 'none' }}>
      <svg width="150" height="150" viewBox="0 0 150 150" style={{ transform: 'rotate(135deg)' }}>
        <circle cx="75" cy="75" r={R} fill="none" stroke="#F1F5F9" strokeWidth="12"
                strokeDasharray={`${dash} ${C}`} strokeLinecap="round" />
        {known && (
          <circle cx="75" cy="75" r={R} fill="none" stroke={b.ring} strokeWidth="12"
                  strokeDasharray={`${dash * (pct / 100)} ${C}`} strokeLinecap="round" />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', paddingBottom: '9px' }}>
        <div style={{ fontSize: '42px', fontWeight: 900, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {known ? Math.round(score) : '—'}
        </div>
        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, marginTop: '2px' }}>من 100</div>
      </div>
    </div>
  )
}

function Chip({ ok, children, title }) {
  const tone = ok === true ? { bg: '#ECFDF5', fg: '#15803D', mark: '✓' }
    : ok === false ? { bg: '#FEF2F2', fg: '#B91C1C', mark: '✕' }
      : { bg: '#F1F5F9', fg: '#64748B', mark: '•' }
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: tone.bg, color: tone.fg, borderRadius: '999px',
      padding: '6px 13px', fontSize: '12.5px', fontWeight: 800,
    }}>
      {tone.mark} {children}
    </span>
  )
}

/**
 * A registry field, shown whether or not it has a value.
 *
 * An empty field is information: it says the record is incomplete, which is
 * itself part of what the platform layer of the score measures. Hiding it
 * implies the question was never asked.
 */
function Fact({ k, v }) {
  const empty = v === null || v === undefined || v === '' || v === '—'
  return (
    <div>
      <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700 }}>{k}</div>
      <div style={{
        fontSize: '14px', fontWeight: empty ? 700 : 800, marginTop: '3px',
        color: empty ? '#CBD5E1' : '#0F172A',
      }}>
        {empty ? '—' : v}
      </div>
    </div>
  )
}

export default function ReportHeader({
  identity, company, score, band, tier, market, behaviour, quality,
  partner, connected, liveAt, actions,
}) {
  const b = BAND[band] || BAND.none
  const known = tier !== 'none' && Number.isFinite(Number(score))
  const name = identity?.name || company?.name || '—'

  const reports = Number(behaviour?.reports_approved ?? 0)
  const parties = Number(behaviour?.counterparties ?? 0)
  const docs = Number(quality?.documents ?? 0)
  const completeness = quality?.profile_completeness

  // How far from the sector, stated as the difference rather than two numbers
  // the reader has to subtract. Only when both exist — «أقل من متوسط —» is not
  // a comparison.
  const avg = Number(market?.sector_avg)
  const gap = known && Number.isFinite(avg) ? Math.round(score - avg) : null

  // The warning that keeps the report honest about its own thinness. Shown by
  // the size of the evidence, not by the score: a high score from one report is
  // exactly the case a reader must not take at face value.
  const thin = known && (reports < 3 || parties < 2)

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px',
                      overflow: 'hidden', marginBottom: '18px' }}>
      <div style={{ height: '5px', background: b.ring }} />

      <div style={{ padding: '26px 28px' }}>
        <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', alignItems: 'center' }}>
          <ScoreDial score={score} band={band} known={known} />

          <div style={{ flex: 1, minWidth: '290px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '9px' }}>
              <h1 style={{ fontSize: '25px', fontWeight: 900, color: '#0F172A', margin: 0, lineHeight: 1.4 }}>
                {name}
              </h1>
              {partner && (
                <span title={partner.note} style={{ background: '#F0FDF4', color: '#15803D',
                       border: '1px solid #BBF7D0', borderRadius: '7px', padding: '4px 11px',
                       fontSize: '12px', fontWeight: 800 }}>
                  ★ {partner.label}
                </span>
              )}
              <LiveBadge connected={connected} liveAt={liveAt} />
            </div>

            {company?.name_en && (
              <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600, marginBottom: '10px' }}>
                {company.name_en}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{ background: b.bg, color: b.fg, border: `1px solid ${b.soft}`,
                             borderRadius: '999px', padding: '7px 16px', fontSize: '13.5px', fontWeight: 900 }}>
                ● {b.label}
              </span>
              {tier === 'preliminary' && (
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                  تقييم أوّلي — يكتمل عند ٥ تقارير
                </span>
              )}
            </div>

            <p style={{ fontSize: '15px', color: '#334155', fontWeight: 600, margin: '0 0 10px', lineHeight: 1.9, maxWidth: '58ch' }}>
              {b.verdict}
            </p>

            {/* A score has no meaning without a reference. 72 reads as a pass
                mark until you know the sector sits at 86. */}
            {gap !== null && (
              <div style={{ fontSize: '13.5px', color: '#475569', fontWeight: 700 }}>
                متوسط القطاع <strong style={{ color: '#0F172A' }}>{Math.round(avg)}</strong>
                {gap === 0 ? ' — مطابق للمتوسط'
                  : gap > 0 ? ` — أعلى بـ ${gap} نقطة`
                    : ` — أقل بـ ${Math.abs(gap)} نقطة`}
                {Number(market?.rated_total) > 0 && (
                  <span style={{ color: '#94A3B8', fontWeight: 600 }}> · من {market.rated_total} شركة مقيّمة</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* The honesty line. It is not a disclaimer at the foot — it belongs
            beside the number it qualifies, where somebody reading only the top
            of the page will see it. */}
        {thin && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '11px',
                        padding: '13px 16px', marginTop: '18px', fontSize: '13.5px',
                        color: '#92400E', fontWeight: 700, lineHeight: 1.8 }}>
            ⚠ التقييم مبني على {reports === 0 ? 'لا تقارير' : `${reports} تقرير`}
            {parties > 0 && ` من ${parties} ${parties === 1 ? 'طرف واحد' : 'أطراف'}`}
            {' '}— اقرأه كإشارة أولية لا كسجل مكتمل.
          </div>
        )}

        <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap', marginTop: '18px',
                      paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
          <Chip ok={!!identity?.verified}
                title={identity?.verified_at ? `وُثّقت في ${new Date(identity.verified_at).toLocaleDateString('en-GB')}` : undefined}>
            {identity?.verified ? 'موثّقة من مرصد' : 'غير موثّقة'}
          </Chip>
          <Chip ok={(identity?.cr_status || company?.cr_status) === 'active'}>
            {(identity?.cr_status || company?.cr_status) === 'active' ? 'سجل تجاري نشط'
              : `السجل ${identity?.cr_status || company?.cr_status || 'غير معروف'}`}
          </Chip>
          <Chip ok={docs > 0 ? true : null}>
            {docs > 0 ? `${docs} مستند موثّق` : 'لا مستندات موثّقة'}
          </Chip>
          {completeness != null && (
            <Chip ok={completeness >= 70 ? true : completeness >= 40 ? null : false}>
              الملف مكتمل {Math.round(completeness)}%
            </Chip>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 30px', marginTop: '18px',
                      paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
          <Fact k="القطاع" v={identity?.sector || company?.sector} />
          <Fact k="المدينة" v={identity?.city || company?.city} />
          <Fact k="السجل التجاري" v={identity?.cr_number || company?.cr_number} />
          <Fact k="آخر تحديث للمؤشر"
                v={identity?.computed_at ? new Date(identity.computed_at).toLocaleDateString('en-GB') : null} />
        </div>

        {actions && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px',
                        paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
            {actions}
          </div>
        )}
      </div>
    </section>
  )
}
