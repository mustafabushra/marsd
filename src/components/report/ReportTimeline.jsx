/**
 * The reports themselves, newest first.
 *
 * ============================================================================
 * Two defects this replaces
 * ============================================================================
 * The row picked its icon by comparing `report.severity` against Arabic
 * strings — 'دفع متأخر', 'عدم التزام', 'ممتاز'. The RPC puts `r.category` in
 * that column, which holds `late_payment`, `no_payment`, `quality`. No
 * comparison ever matched, so every report in the platform's history rendered
 * the same grey 📋, and the branch that was supposed to distinguish them had
 * never once been taken.
 *
 * And each row printed the reporting company's name, three panels below a
 * disclaimer promising it never would. The database now withholds it from
 * everyone but Marsad staff (migration 107); this shows the sector, and says
 * plainly that the identity is protected rather than missing.
 */

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

/** Same three levels as ReportBreakdown, so one report reads the same twice. */
const SEVERITY = {
  fraud: 3, no_payment: 3,
  contract_breach: 2, dispute: 2, late_payment: 2,
  execution_delay: 1, quality: 1, other: 1,
}

const TONE = {
  3: { bar: '#DC2626', fg: '#B91C1C', bg: '#FEF2F2' },
  2: { bar: '#F59E0B', fg: '#B45309', bg: '#FFFBEB' },
  1: { bar: '#94A3B8', fg: '#475569', bg: '#F8FAFC' },
}

const PANEL = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
  padding: '24px', marginBottom: '18px',
}

export default function ReportTimeline({ reports }) {
  if (!reports?.length) return null

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          أحدث التقارير المعتمدة
        </h3>
        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
          الأحدث أولاً
        </span>
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        ما كتبه المتعاملون، بعد مراجعة إدارة مرصد واعتماده.
      </p>

      <div style={{ display: 'grid', gap: '2px' }}>
        {reports.map((r, i) => {
          const sev = SEVERITY[r.severity] ?? 1
          const tone = TONE[sev]
          const label = LABEL[r.severity] || r.severity || 'تقرير'

          return (
            <div key={r.id || i} style={{ display: 'flex', gap: '14px' }}>
              {/* A rail rather than an icon. The colour carries the severity and
                  the line carries the sequence — an emoji did neither, and the
                  one that was drawn was the wrong one on every row. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%',
                               background: tone.bar, marginTop: '5px', flex: 'none' }} />
                {i < reports.length - 1 && (
                  <span style={{ width: '2px', flex: 1, background: '#F1F5F9', marginTop: '5px' }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, paddingBottom: i < reports.length - 1 ? '20px' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px',
                              flexWrap: 'wrap', marginBottom: '5px' }}>
                  <span style={{ background: tone.bg, color: tone.fg, borderRadius: '999px',
                                 padding: '3px 11px', fontSize: '11.5px', fontWeight: 800 }}>
                    {label}
                  </span>
                  <span style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700, direction: 'ltr' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : ''}
                  </span>
                </div>

                {r.title && (
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A',
                                marginBottom: '4px', lineHeight: 1.6 }}>
                    {r.title}
                  </div>
                )}

                {r.summary && (
                  <div style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.9,
                                marginBottom: '8px', whiteSpace: 'pre-line' }}>
                    {r.summary}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '999px',
                    padding: '4px 11px', fontSize: '11.5px', color: '#64748B', fontWeight: 700,
                  }}>
                    🔒 قطاع المُبلِّغ: {r.reporter_sector || 'غير محدد'}
                  </span>

                  {/* Only Marsad receives a name from the database at all; this
                      is labelled so a reviewer never mistakes their own view for
                      what a customer sees. */}
                  {r.reporter_is_visible && (
                    <span style={{ background: '#F5F3FF', color: '#7C3AED', borderRadius: '999px',
                                   padding: '4px 11px', fontSize: '11.5px', fontWeight: 800 }}>
                      {r.reporter_company_name} · يظهر لفريق مرصد فقط
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px',
                    padding: '12px 15px', marginTop: '18px', fontSize: '12.5px',
                    color: '#64748B', fontWeight: 600, lineHeight: 1.9 }}>
        🛡 هوية الجهة المُبلِّغة محجوبة عن جميع الشركات — يُعرض قطاعها فقط.
      </div>
    </div>
  )
}
