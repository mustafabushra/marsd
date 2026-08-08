/**
 * «الخطوة ٢ من ٤» — a wizard's position, at any width.
 *
 * Two identical copies of this existed, in AddReport and AdminBulkImport: four
 * circles, four labels and three connecting lines in a flex row. On a desktop
 * it reads well. On a 320px phone the four labels alone are wider than the
 * screen, so they wrapped underneath the circles, «تفاصيل التعامل» and «تأثير
 * التقرير» ran into each other, and the fourth step dropped to a line of its
 * own with its connector hanging beneath somebody else's label.
 *
 * ============================================================================
 * The phone gets a different indicator, not a smaller one
 * ============================================================================
 * Shrinking the type until four labels fit across 320px would make all four
 * unreadable to tell you which one you are on — and only one of them is the
 * answer to that question. A person filling a form needs to know where they
 * are, how far is left, and what this step is called. Nothing else on that row
 * is load-bearing.
 *
 * So below 720px it becomes a bar, a count and the current step's name. The
 * completed steps are in the filled portion of the bar, which is what the row
 * of ticks was for.
 *
 * Above 720px the row is exactly what it was — same sizes, same colours, same
 * markup — because it was never the problem.
 */
export default function Stepper({ steps, current, color = '#16A34A' }) {
  const now = steps.find((s) => s.n === current) || steps[0]
  const pct = Math.round((current / steps.length) * 100)

  return (
    <>
      {/* The row. Hidden on a phone by the stylesheet, untouched above it. */}
      <div className="marsad-stepper" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        {steps.map((w, idx) => {
          const done = w.n < current
          const active = w.n === current
          return (
            <div key={w.n} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                  fontSize: '14px', flex: 'none',
                  background: active || done ? color : '#E2E8F0',
                  color: active || done ? '#fff' : '#94A3B8',
                }}>
                  {done ? '✓' : String(w.n)}
                </div>
                <span style={{
                  fontSize: '13.5px', fontWeight: active ? 800 : 600,
                  color: active || done ? '#1E2A52' : '#94A3B8', whiteSpace: 'nowrap',
                }}>
                  {w.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: '#E2E8F0', margin: '0 10px', minWidth: '12px' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* The bar. The stylesheet shows this one instead, below 720px. */}
      <div className="marsad-stepper-compact" style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: '10px', marginBottom: '9px',
        }}>
          <span style={{
            fontSize: '15px', fontWeight: 900, color: '#0F172A',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {now.label}
          </span>
          {/* The count is the part that must never be truncated, so it does not
              shrink and the label gives way first. */}
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#64748B', flex: 'none' }}>
            {current} من {steps.length}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`الخطوة ${current} من ${steps.length}: ${now.label}`}
          style={{ height: '7px', background: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}
        >
          {/* insetInlineStart is not needed: the parent is RTL, so the bar
              already grows from the right. Setting a direction here would make
              it grow the wrong way against the page. */}
          <div style={{
            width: `${pct}%`, height: '100%', background: color,
            borderRadius: '99px', transition: 'width .25s ease',
          }} />
        </div>
      </div>
    </>
  )
}
