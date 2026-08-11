/**
 * The trust report as a printed document.
 *
 * ============================================================================
 * Why this is a separate component and not the screen with a print stylesheet
 * ============================================================================
 * The screen is written in inline styles, laid out for a viewport, and carries
 * chrome — a sidebar, a header, live badges, buttons. Printing it means hiding
 * things and hoping the rest reflows, which is how the current `window.print()`
 * works and why the result depends on whoever's browser and page settings
 * produced it. Two people asking for the same report get two different papers.
 *
 * This is one document at one size. It is rendered on the server to static
 * markup and handed to Chromium, so the output is the same every time, from
 * anywhere, whatever the reader's machine is set to.
 *
 * ============================================================================
 * Held to A4 by the paper, not by pixels
 * ============================================================================
 * `@page { size: A4 }` and margins in millimetres. Nothing here is sized in
 * viewport units, because there is no viewport — a `vh` in a PDF resolves
 * against the page box and quietly changes when the margin does.
 *
 * The running header and footer are NOT in this markup. Chromium draws them per
 * page from its own templates, which is the only way to get «صفحة ٢ من ٧» right
 * — CSS counters cannot see the pagination that Chromium performs after layout.
 * They live beside the launcher, in api/trust-report-pdf.js.
 *
 * ============================================================================
 * The rule that keeps it professional at any data volume
 * ============================================================================
 * A report is a decision document, so a page break must never fall between a
 * number and what it means. Every panel and every table row carries
 * `break-inside: avoid`, and each section can start a page rather than begin
 * three lines from the bottom. A company with no reports and a company with two
 * hundred produce the same document with different amounts in it, not two
 * different documents.
 */


const GREEN = '#16A34A'

const MUTED = '#64748B'
const LINE = '#E2E8F0'

const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  : '—')
const num = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('ar-SA'))
const pct = (v) => (v == null ? '—' : `${Math.round(Number(v))}%`)

/** A band, not a verdict. The number is a summary; the label is what it means. */
function band (score) {
  const s = Number(score) || 0
  if (s >= 80) return { t: 'موثوقية عالية', c: '#15803D', bg: '#ECFDF5' }
  if (s >= 60) return { t: 'موثوقية جيّدة', c: '#0369A1', bg: '#EFF6FF' }
  if (s >= 40) return { t: 'موثوقية متوسطة', c: '#B45309', bg: '#FFFBEB' }
  if (s > 0) return { t: 'موثوقية منخفضة', c: '#B91C1C', bg: '#FEF2F2' }
  return { t: 'لا توجد بيانات كافية', c: '#475569', bg: '#F8FAFC' }
}

function Panel ({ title, children, note }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {note && <p className="panel-note">{note}</p>}
      {children}
    </section>
  )
}

function Facts ({ rows }) {
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div className="fact" key={k}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The score over time.
 *
 * Plain SVG with no animation and no canvas. A canvas element is a bitmap that
 * has to be drawn by script before the page is captured, and an animated chart
 * is captured mid-transition — both produce a chart that is empty or half drawn
 * in the PDF, which is worse than no chart because it looks like the data is
 * missing rather than the renderer.
 */
function ScoreTrend ({ history }) {
  const pts = (history || [])
    .map((h) => ({ at: h.at || h.recorded_at || h.created_at, v: Number(h.score) }))
    .filter((p) => Number.isFinite(p.v))
  if (pts.length < 2) return null

  const W = 640
  const H = 150
  const P = 22
  const vals = pts.map((p) => p.v)
  const lo = Math.max(0, Math.min(...vals) - 6)
  const hi = Math.min(100, Math.max(...vals) + 6)
  const span = hi - lo || 1
  const x = (i) => P + (i * (W - P * 2)) / (pts.length - 1)
  const y = (v) => H - P - ((v - lo) / span) * (H - P * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - P} L${P},${H - P} Z`
  const last = pts[pts.length - 1]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`تغيّر مؤشر الثقة عبر ${pts.length} قراءة`}>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={P} x2={W - P} y1={P + f * (H - P * 2)} y2={P + f * (H - P * 2)}
          stroke={LINE} strokeWidth="1" />
      ))}
      <path d={area} fill="rgba(22,163,74,.10)" />
      <path d={line} fill="none" stroke={GREEN} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.v)} r="4" fill={GREEN} />
      <text x={P} y={P - 7} fontSize="10" fill={MUTED} textAnchor="start">{Math.round(hi)}</text>
      <text x={P} y={H - P + 13} fontSize="10" fill={MUTED} textAnchor="start">{Math.round(lo)}</text>
    </svg>
  )
}

/** Where the number came from. A score with no sources is a claim. */
function Sources ({ sources }) {
  if (!sources?.length) {
    return <p className="empty">لم تُسجَّل مصادر مستقلّة لهذه الشركة بعد.</p>
  }
  return (
    <table className="tbl">
      <thead>
        <tr><th>المصدر</th><th>النوع</th><th>التاريخ</th></tr>
      </thead>
      <tbody>
        {sources.map((s, i) => (
          <tr key={i}>
            <td>{s.label || s.name || '—'}</td>
            <td>{s.kind || s.type || '—'}</td>
            <td className="num">{fmtDate(s.at || s.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function TrustReportDocument ({
  company, full, context, history, generatedAt, generatedFor, reportId,
}) {
  const identity = full?.identity || {}
  const behaviour = full?.behaviour || {}
  const quality = full?.quality || {}
  const market = full?.market || {}
  const score = history?.length ? Number(history[history.length - 1]?.score) : null
  const b = band(score)

  return (
    <article className="doc">
      {/* ===== Cover block — the answer first ===== */}
      <header className="cover">
        <div className="brand">
          <span className="brand-mark">مرصد</span>
          <span className="brand-sub">تقرير موثوقية شركة</span>
        </div>

        <h1 className="co-name">{company?.name || identity.name || '—'}</h1>

        <div className="co-meta">
          {identity.cr_number && <span>سجل تجاري {identity.cr_number}</span>}
          {identity.unified_number && <span>رقم موحّد {identity.unified_number}</span>}
          {identity.city && <span>{identity.city}</span>}
          {identity.verified && <span className="ok">موثّقة من مرصد</span>}
        </div>

        <div className="score-row">
          <div className="score-box" style={{ background: b.bg, borderColor: b.c }}>
            <div className="score-num" style={{ color: b.c }}>
              {score == null ? '—' : Math.round(score)}
            </div>
            <div className="score-of">من ١٠٠</div>
          </div>
          <div className="score-say">
            <div className="score-band" style={{ color: b.c }}>{b.t}</div>
            <p className="score-note">
              مؤشر الثقة رقم مُركّب من سجلّات رسمية وتجارب موثّقة مع هذه الشركة.
              {market.rated_total > 0 && ` من بين ${num(market.rated_total)} شركة مُقيَّمة في مرصد.`}
              {' '}لا يُقرأ وحده — التفصيل في الصفحات التالية هو ما يُبنى عليه القرار.
            </p>
          </div>
        </div>
      </header>

      {/* ===== Identity ===== */}
      <Panel title="هوية الشركة">
        <Facts rows={[
          ['الاسم', company?.name || identity.name],
          ['رقم السجل التجاري', identity.cr_number],
          ['الرقم الموحّد', identity.unified_number],
          ['حالة السجل', identity.cr_status === 'active' ? 'قائم' : identity.cr_status],
          ['انتهاء السجل', identity.cr_expiry ? fmtDate(identity.cr_expiry) : '—'],
          ['الكيان القانوني', identity.entity_type],
          ['المدينة', identity.city],
          ['القطاع', identity.sector],
          ['سنة التأسيس', identity.founded],
          ['التوثيق', identity.verified ? 'موثّقة من مرصد' : 'غير موثّقة'],
        ]} />
      </Panel>

      {/* ===== Behaviour ===== */}
      <Panel title="السلوك التجاري"
        note="مبني على التقارير المعتمدة من أطراف تعاملت مع الشركة.">
        <Facts rows={[
          ['التقارير المعتمدة', num(behaviour.reports_approved)],
          ['أطراف متعاملة', num(behaviour.counterparties)],
          ['السداد في موعده', behaviour.on_time_pct == null ? '—' : pct(behaviour.on_time_pct)],
          ['متوسط التأخير', behaviour.avg_delay ? `${num(behaviour.avg_delay)} يوم` : '—'],
          ['أقصى تأخير', behaviour.max_delay ? `${num(behaviour.max_delay)} يوم` : '—'],
          ['حالات تعثّر', num(behaviour.defaults)],
        ]} />
        {Number(behaviour.reports_approved) === 0 && (
          <p className="empty">
            لم تصل مرصد تقارير معتمدة عن تعاملات هذه الشركة. غياب التقارير ليس حكماً سلبياً —
            هو غياب بيانات، ويُقرأ كذلك.
          </p>
        )}
      </Panel>

      {/* ===== Trend ===== */}
      {history?.length >= 2 && (
        <Panel title="تغيّر المؤشر" note="آخر القراءات المسجّلة للمؤشر.">
          <ScoreTrend history={history} />
        </Panel>
      )}

      {/* ===== Standing ===== */}
      <Panel title="الموقع مقارنةً بالقطاع">
        <Facts rows={[
          ['القطاع', context?.sector || identity.sector],
          ['متوسط القطاع', context?.sector_avg == null ? '—' : Math.round(context.sector_avg)],
          ['عدد شركات القطاع', num(context?.sector_count)],
          ['تقارير معتمدة', num(context?.approved_reports)],
          ['جهات مُبلِّغة مستقلّة', num(context?.distinct_reporters)],
          ['اعتراضات مفتوحة', num(context?.disputes ?? quality.disputes_open)],
        ]} />
        {context?.sector_count != null && context?.sector_min_peers != null
          && context.sector_count < context.sector_min_peers && (
          <p className="empty">
            عدد شركات هذا القطاع في مرصد أقل من الحدّ الذي تصبح عنده المقارنة ذات معنى،
            فالمقارنة أعلاه مُشار إليها ولا يُبنى عليها.
          </p>
        )}
      </Panel>

      {/* ===== Evidence ===== */}
      <Panel title="مصادر البيانات"
        note="كل رقم في هذا التقرير يعود إلى أحد هذه المصادر.">
        <Sources sources={full?.sources} />
        <Facts rows={[
          ['مستندات مُدقَّقة', num(quality.documents)],
          ['اكتمال الملف', quality.profile_completeness == null ? '—' : pct(quality.profile_completeness)],
          ['مصادر مستقلّة', num(quality.independent_sources)],
          ['آخر تقرير', quality.last_report_at ? fmtDate(quality.last_report_at) : '—'],
        ]} />
      </Panel>

      {/* ===== The limits, said plainly ===== */}
      <Panel title="حدود هذا التقرير">
        <ul className="limits">
          <li>
            مؤشر الثقة يصف ما وصل مرصد من سجلّات وتجارب موثّقة حتى تاريخ الإصدار،
            ولا يصف ما لم يُبلَّغ عنه.
          </li>
          <li>
            بيانات السجل التجاري مصدرها وزارة التجارة، وهي بيانات تعريفية —
            لا تُغني عن مستندات الشركة ولا تُقرأ كتوثيق لها.
          </li>
          <li>
            هذا التقرير أداة مساعدة على القرار، وليس تصنيفاً ائتمانياً ولا توصية
            بالتعامل أو الامتناع عنه.
          </li>
        </ul>
      </Panel>

      <footer className="issued">
        صدر في {fmtDate(generatedAt)}
        {generatedFor ? ` · لـ${generatedFor}` : ''}
        {reportId ? ` · رقم الإصدار ${String(reportId).slice(0, 8)}` : ''}
      </footer>
    </article>
  )
}
