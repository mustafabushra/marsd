/**
 * The first screen of the report, and for most readers the only one.
 *
 * ============================================================================
 * What this replaces
 * ============================================================================
 * The report opened with the company's name, its score, and then twelve panels
 * in the order they were built. A reader looking for «should I deal with this
 * company» had to assemble the answer from four of them.
 *
 * An executive reads the top of a page and stops. So the top has to carry the
 * verdict, the confidence behind it, and the two or three facts that would
 * change a decision — and everything below it becomes the evidence for someone
 * who wants to check.
 *
 * ============================================================================
 * Nothing here is computed
 * ============================================================================
 * Every number and every band is passed in exactly as the database produced it.
 * This file chooses what to show first and how to draw it. It does not decide
 * what anything means: the band comes from `trust_score_rules`, the score from
 * `compute_trust_score`, the tier from `trust_scores`. A verdict sentence is
 * selected by the band, never derived from the score.
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

/**
 * The score as a ring.
 *
 * A number on its own gives no sense of scale — 62 reads as a pass mark until
 * you know the range. The arc shows the position without the reader having to
 * be told what the maximum is.
 */
function ScoreDial({ score, band, tier }) {
  const b = BAND[band] || BAND.none
  const known = tier !== 'none' && Number.isFinite(score)
  const pct = known ? Math.max(0, Math.min(100, score)) : 0

  const R = 62
  const C = 2 * Math.PI * R
  // Three quarters of the circle, so the gap at the bottom reads as a gauge
  // rather than a progress ring that happens to be incomplete.
  const SWEEP = 0.75
  const dash = C * SWEEP

  return (
    <div style={{ position: 'relative', width: '158px', height: '158px', flex: 'none' }}>
      <svg width="158" height="158" viewBox="0 0 158 158" style={{ transform: 'rotate(135deg)' }}>
        <circle cx="79" cy="79" r={R} fill="none" stroke="#F1F5F9" strokeWidth="13"
                strokeDasharray={`${dash} ${C}`} strokeLinecap="round" />
        {known && (
          <circle cx="79" cy="79" r={R} fill="none" stroke={b.ring} strokeWidth="13"
                  strokeDasharray={`${dash * (pct / 100)} ${C}`} strokeLinecap="round" />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', paddingBottom: '10px',
      }}>
        <div style={{ fontSize: '44px', fontWeight: 900, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {known ? Math.round(score) : '—'}
        </div>
        <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700, marginTop: '3px' }}>
          من 100
        </div>
      </div>
    </div>
  )
}

/** One fact, stated plainly. Green when it helps, red when it does not. */
function Signal({ ok, label, detail }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      background: ok === false ? '#FEF2F2' : ok === true ? '#F8FAFC' : '#F8FAFC',
      border: `1px solid ${ok === false ? '#FECACA' : '#E2E8F0'}`,
      borderRadius: '11px', padding: '12px 14px',
    }}>
      <span style={{ fontSize: '15px', flex: 'none', color: ok === false ? '#DC2626' : ok === true ? '#16A34A' : '#94A3B8' }}>
        {ok === false ? '✕' : ok === true ? '✓' : '•'}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', lineHeight: 1.5 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '2px', lineHeight: 1.6 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * @param {object} p
 * @param {object} p.identity     the company, as the knowledge base returned it
 * @param {number} p.score
 * @param {string} p.band         from trust_scores.risk_band — never derived
 * @param {string} p.tier
 * @param {number} p.reports      approved report count
 * @param {object} [p.behaviour]  payment counts, for the headline signals
 * @param {Array}  [p.history]    score points, for the direction of travel
 */
export default function ExecutiveHeader({ identity, score, band, tier, reports, behaviour, history }) {
  if (!identity) return null
  const b = BAND[band] || BAND.none

  // Direction, from the two most recent points the history already contains.
  // Stated only when there are two — a single reading has no direction, and
  // drawing an arrow from one point would be inventing a trend.
  let move = null
  if (Array.isArray(history) && history.length >= 2) {
    const sorted = [...history].sort((a, x) => new Date(a.at ?? a.computed_at) - new Date(x.at ?? x.computed_at))
    const from = Number(sorted[sorted.length - 2]?.score)
    const to = Number(sorted[sorted.length - 1]?.score)
    if (Number.isFinite(from) && Number.isFinite(to) && Math.round(to) !== Math.round(from)) {
      move = { delta: Math.round(to - from), up: to > from }
    }
  }

  const late = Number(behaviour?.late ?? 0) + Number(behaviour?.default ?? behaviour?.unpaid ?? 0)
  const onTime = Number(behaviour?.full ?? 0)

  const signals = [
    // «طابقت مستنداتها الرسمية» was said about every verified company, and the
    // only verified companies are Ministry imports — which have no documents at
    // all. The flag there means the authority published the record; Marsad's
    // own verification is verification_source = 'marsad_review'.
    identity.verification_source === 'marsad_review'
      ? { ok: true, label: 'موثّقة من مرصد', detail: 'طابقت مستنداتها الرسمية' }
      : identity.verified
        ? { ok: true, label: 'مُطابَقة بالسجل التجاري',
            detail: 'قيدها منشور في سجل وزارة التجارة — لم تُدقَّق مستنداتها بعد' }
        : { ok: null, label: 'غير موثّقة', detail: 'لم تُقدَّم مستندات للتوثيق بعد' },

    identity.cr_status === 'active'
      ? { ok: true, label: 'سجل تجاري نشط' }
      : identity.cr_status
        ? { ok: false, label: `السجل التجاري ${identity.cr_status}` }
        : null,

    reports > 0
      ? { ok: null, label: `${reports} تقرير معتمد`, detail: 'من متعاملين سابقين' }
      : { ok: null, label: 'لا تقارير معتمدة', detail: 'المؤشر يستند للبيانات الرسمية وحدها' },

    (onTime + late) > 0
      ? late === 0
        ? { ok: true, label: 'لا حالات تعثّر مُبلَّغ عنها' }
        : { ok: false, label: `${late} حالة تأخر أو عدم سداد`, detail: `من ${onTime + late} تعامل مُبلَّغ عنه` }
      : null,
  ].filter(Boolean)

  return (
    <section style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px',
      overflow: 'hidden', marginBottom: '18px',
    }}>
      {/* A band of the verdict's own colour, so the answer registers before a
          word is read. */}
      <div style={{ height: '5px', background: b.ring }} />

      <div style={{ padding: '26px 28px' }}>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <ScoreDial score={score} band={band} tier={tier} />

          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 style={{ fontSize: '25px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px', lineHeight: 1.4 }}>
              {identity.name}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{
                background: b.bg, color: b.fg, border: `1px solid ${b.soft}`,
                borderRadius: '999px', padding: '7px 16px', fontSize: '13.5px', fontWeight: 900,
              }}>
                ● {b.label}
              </span>

              {tier === 'preliminary' && (
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                  تقييم أوّلي — يكتمل عند ٥ تقارير
                </span>
              )}

              {move && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: move.up ? '#ECFDF5' : '#FEF2F2',
                  color: move.up ? '#15803D' : '#B91C1C',
                  borderRadius: '999px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 800,
                }}>
                  {move.up ? '↑' : '↓'} {Math.abs(move.delta)} نقطة عن آخر قياس
                </span>
              )}
            </div>

            {/* The sentence a reader repeats to a colleague. Chosen by band, so
                it can never disagree with the badge beside it. */}
            <p style={{ fontSize: '15px', color: '#334155', fontWeight: 600, margin: 0, lineHeight: 1.9, maxWidth: '56ch' }}>
              {b.verdict}
            </p>
          </div>
        </div>

        {/* The facts that would change a decision, four at most. Everything
            else is evidence and lives below. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))',
          gap: '10px', marginTop: '22px', paddingTop: '20px', borderTop: '1px solid #F1F5F9',
        }}>
          {signals.map((s, i) => <Signal key={i} {...s} />)}
        </div>
      </div>
    </section>
  )
}
