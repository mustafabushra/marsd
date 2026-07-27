/**
 * A screen for a system Marsad has not built yet.
 *
 * These four pages held invented data — a cache hit rate, a queue of jobs, a
 * list of transactions — for systems that do not exist. That is the worst state
 * a screen can be in: an operator reading a number believes there is something
 * producing it, and acts on it.
 *
 * Removing them from the navigation hid the problem without answering it, and
 * the answer people actually want is "not yet, and here is what it will be".
 * So the page stays reachable, says plainly that the system is not built, and
 * lists what it will do — which is also the specification for whoever builds it.
 *
 * The one rule: no numbers. Not one. A page that says "قيد التطوير" at the top
 * and shows a chart underneath has told the reader the chart is real.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

export default function ComingSoon({ icon, title, why, willDo, needs, instead }) {
  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ ...card, padding: '34px', textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px', flexDirection: 'row-reverse', justifyContent: 'flex-end', marginBottom: '18px' }}>
          <span style={{ fontSize: '34px' }} aria-hidden>{icon}</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{title}</h1>
              <span style={{ background: '#F1F5F9', color: '#52514e', borderRadius: '999px', padding: '4px 13px', fontSize: '12px', fontWeight: 800 }}>
                🔒 قيد التطوير
              </span>
            </div>
            <p style={{ fontSize: '13.5px', color: '#64748B', margin: '5px 0 0', fontWeight: 600, lineHeight: 1.8 }}>{why}</p>
          </div>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', margin: '0 0 11px' }}>ما ستقوم به هذه الشاشة</h3>
          <ul style={{ margin: 0, paddingRight: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {willDo.map((line) => (
              <li key={line} style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, lineHeight: 1.9 }}>{line}</li>
            ))}
          </ul>
        </div>

        <div style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: '12px', padding: '15px 18px', marginBottom: instead ? '16px' : 0 }}>
          <h3 style={{ fontSize: '13.5px', fontWeight: 900, color: '#92400E', margin: '0 0 7px' }}>ما تحتاجه قبل أن تعمل</h3>
          <p style={{ fontSize: '13.5px', color: '#78350F', margin: 0, fontWeight: 600, lineHeight: 1.9 }}>{needs}</p>
        </div>

        {instead && (
          <div style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: '12px', padding: '15px 18px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: 900, color: '#15803D', margin: '0 0 7px' }}>ماذا تفعل الآن بدلاً منها</h3>
            <p style={{ fontSize: '13.5px', color: '#14532D', margin: 0, fontWeight: 600, lineHeight: 1.9 }}>{instead}</p>
          </div>
        )}
      </div>
    </div>
  )
}
