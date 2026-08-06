/**
 * What was actually reported, and in what proportion.
 *
 * ============================================================================
 * What this replaces
 * ============================================================================
 * A row of tiles, each an emoji above a number above a raw database code:
 *
 *     ⚔️  2  dispute        📄  1  contract_breach
 *     ⏳  1  execution_delay ⚠️  1  no_payment
 *
 * Three things were wrong with it. The label was the column value rather than
 * the Arabic name — and the Arabic names were already in the file, used by a
 * different panel two hundred lines away. The emoji came out of a CASE
 * statement inside `get_company_reports_summary`, so presentation was being
 * decided in SQL and could not be changed without a migration. And four numbers
 * side by side answer «how many of each» while hiding «out of how many», which
 * is the question a reader actually has.
 *
 * ============================================================================
 * Why bars
 * ============================================================================
 * «2 disputes» means nothing alone. Two out of three reports is a company in
 * constant conflict; two out of forty is noise. Proportion is the finding, so
 * proportion is what is drawn — the counts stay, beside it, for anyone
 * checking.
 *
 * Nothing here is computed beyond dividing by a total. The categories, their
 * counts and the report itself all arrive from the database unchanged.
 */

/** The Arabic name of each category. Matches CATEGORIES in AddReport.jsx. */
const LABEL = {
  late_payment: 'تأخير في السداد',
  no_payment: 'عدم سداد',
  contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل',
  execution_delay: 'تأخير في التنفيذ',
  dispute: 'نزاع',
  fraud: 'احتيال',
  other: 'أخرى',
}

/**
 * How much each category should worry a reader, in three levels.
 *
 * Decided here rather than read from the `color` column the RPC returns,
 * because what a category means to a credit decision is a judgement about the
 * product, and a judgement that lives in a CASE statement inside a stored
 * procedure cannot be revised without a migration.
 */
const SEVERITY = {
  fraud: 3, no_payment: 3,
  contract_breach: 2, dispute: 2, late_payment: 2,
  execution_delay: 1, quality: 1, other: 1,
}

const TONE = {
  3: { bar: '#DC2626', fg: '#B91C1C', bg: '#FEF2F2', name: 'خطر' },
  2: { bar: '#F59E0B', fg: '#B45309', bg: '#FFFBEB', name: 'ملاحظة' },
  1: { bar: '#94A3B8', fg: '#475569', bg: '#F8FAFC', name: 'عادي' },
}

const PANEL = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
  padding: '24px', marginBottom: '18px',
}

export default function ReportBreakdown({ summary }) {
  const rows = (summary ?? [])
    .map((s) => {
      const sev = SEVERITY[s.category] ?? 1
      return {
        key: s.category,
        label: LABEL[s.category] || s.category,
        n: Number(s.count) || 0,
        sev,
        tone: TONE[sev],
      }
    })
    .filter((r) => r.n > 0)
    // Most serious first, then most frequent. A reader scanning the top of the
    // list should meet the worst thing said about this company, not the most
    // common one — «احتيال ×1» outranks «تأخير ×6».
    .sort((a, b) => b.sev - a.sev || b.n - a.n)

  const total = rows.reduce((a, r) => a + r.n, 0)

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          ما الذي أُبلغ عنه
        </h3>
        {total > 0 && (
          <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
            {total} تقرير معتمد
          </span>
        )}
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        تصنيفات التقارير المعتمَدة، مرتّبة بالأشدّ أثراً على قرار التعامل.
      </p>

      {total === 0 ? (
        <div style={{ background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '12px',
                      padding: '26px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748B' }}>
            لا تقارير معتمدة بعد
          </div>
          <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '6px' }}>
            غياب التقارير ليس تزكية — يعني أن أحداً لم يُبلّغ.
          </div>
        </div>
      ) : (
        <>
          {/* The mix in one line, before the detail. A reader sees whether this
              company's record is mostly red or mostly grey without reading a
              single label. */}
          <div style={{ display: 'flex', height: '12px', borderRadius: '6px',
                        overflow: 'hidden', marginBottom: '20px', gap: '2px' }}>
            {rows.map((r) => (
              <div key={r.key} title={`${r.label}: ${r.n}`}
                   style={{ width: `${(r.n / total) * 100}%`, background: r.tone.bar }} />
            ))}
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {rows.map((r) => {
              const pct = Math.round((r.n / total) * 100)
              return (
                <div key={r.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                        {r.label}
                      </span>
                      <span style={{ background: r.tone.bg, color: r.tone.fg, borderRadius: '999px',
                                     padding: '2px 9px', fontSize: '10.5px', fontWeight: 800 }}>
                        {r.tone.name}
                      </span>
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155',
                                   fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                      {r.n}
                      <span style={{ color: '#94A3B8', fontWeight: 700 }}> من {total} · {pct}%</span>
                    </span>
                  </div>
                  <div style={{ height: '10px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: r.tone.bar,
                                  borderRadius: '5px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
