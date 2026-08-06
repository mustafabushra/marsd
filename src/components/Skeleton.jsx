/**
 * Loading that does not announce itself.
 *
 * ============================================================================
 * What this replaces
 * ============================================================================
 * Thirty-six hand-written «جاري التحميل...» blocks. They used four different
 * heights (40vh, 50vh, 60vh, 100vh), two different ellipsis characters — thirty
 * with `...` and six with `…` — and centred themselves a slightly different way
 * each time. Moving between two screens meant watching the wait announce
 * itself twice, differently.
 *
 * Worse than inconsistent, they were the wrong shape. A centred sentence
 * occupies nothing like the table or the cards that replace it, so the moment
 * data arrived the whole page jumped.
 *
 * ============================================================================
 * Why a skeleton instead
 * ============================================================================
 * A placeholder built in the shape of what is coming makes the layout correct
 * *before* the data lands — nothing moves when it does. And there is no
 * sentence to read, so the wait stops being an event and becomes the page
 * arriving.
 *
 * These are dumb boxes on purpose. They take no props about progress, because
 * a progress figure nobody can act on is another thing to read.
 */

const BASE = {
  background: 'linear-gradient(100deg, #F1F5F9 30%, #E2E8F0 50%, #F1F5F9 70%)',
  backgroundSize: '200% 100%',
  animation: 'marsadShimmer 1.4s ease-in-out infinite',
  borderRadius: '8px',
}

/** One shimmering block. Everything below is built from these. */
export function Skeleton({ w = '100%', h = 16, r = 8, style }) {
  return (
    <div
      className="marsad-skeleton"
      aria-hidden="true"
      style={{
        ...BASE,
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: typeof r === 'number' ? `${r}px` : r,
        ...style,
      }}
    />
  )
}

/**
 * A panel the size of the panels this product actually uses.
 *
 * Rows vary in width because a paragraph of real text does. Equal-width bars
 * read as a loading bar; uneven ones read as text that has not painted yet,
 * which is what it is.
 */
export function SkeletonPanel({ rows = 3, title = true, style }) {
  const widths = ['92%', '78%', '85%', '64%', '88%']
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
      padding: '24px', marginBottom: '18px', ...style,
    }}>
      {title && (
        <>
          <Skeleton w={190} h={17} />
          <div style={{ height: '10px' }} />
          <Skeleton w={300} h={12} />
          <div style={{ height: '20px' }} />
        </>
      )}
      <div style={{ display: 'grid', gap: '11px' }}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} w={widths[i % widths.length]} h={13} />
        ))}
      </div>
    </div>
  )
}

/** A row of stat cards, as the dashboards draw them. */
export function SkeletonStats({ n = 4 }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(190px,1fr))`,
      gap: '18px', marginBottom: '18px',
    }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0',
                              borderRadius: '16px', padding: '22px' }}>
          <Skeleton w={110} h={12} />
          <div style={{ height: '14px' }} />
          <Skeleton w={72} h={30} r={9} />
          <div style={{ height: '9px' }} />
          <Skeleton w={90} h={11} />
        </div>
      ))}
    </div>
  )
}

/** A list or table, which is what most admin screens are. */
export function SkeletonTable({ rows = 6, cols = 4 }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0',
                  borderRadius: '16px', overflow: 'hidden', marginBottom: '18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`,
                    gap: '16px', padding: '15px 18px', background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0' }}>
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} w="70%" h={12} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`,
                              gap: '16px', padding: '16px 18px',
                              borderBottom: r < rows - 1 ? '1px solid #F1F5F9' : 'none' }}>
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} w={i === 0 ? '85%' : '55%'} h={13} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The inside of a picker while it searches.
 *
 * Four screens each wrote their own sentence for this — «جاري البحث...»,
 * «جاري البحث…», «جاري قراءة السجل…» — in three sizes and two ellipsis
 * characters, inside a box that then filled with rows of a quite different
 * height. The panel resized every time a search finished: the same jump the
 * skeletons removed everywhere else, left behind in the one place small enough
 * that nobody had looked.
 */
export function SkeletonList({ rows = 4 }) {
  return (
    <div aria-busy="true" style={{ display: 'grid', gap: '10px' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton w={i % 2 ? '58%' : '74%'} h={14} />
            <div style={{ height: '9px' }} />
            <Skeleton w="38%" h={11} />
          </div>
          <Skeleton w={46} h={26} r={999} style={{ flex: 'none' }} />
        </div>
      ))}
    </div>
  )
}

/**
 * A whole screen, for the gate that runs before anything is known.
 *
 * Deliberately generic: at this point the shell does not yet know whether a
 * table or a report is coming, and guessing wrong would cause exactly the jump
 * the skeleton exists to prevent. A heading and stat cards are common to
 * nearly every screen behind it.
 */
export function SkeletonPage({ stats = 4, panels = 2 }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* The only text anywhere in here, and it is for screen readers. Sighted
          readers get the shape; a reader who cannot see the shape gets told. */}
      <span style={{
        position: 'absolute', width: '1px', height: '1px', overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>
        يجري تحميل المحتوى
      </span>

      <Skeleton w={230} h={24} r={9} />
      <div style={{ height: '10px' }} />
      <Skeleton w={340} h={13} />
      <div style={{ height: '24px' }} />

      {stats > 0 && <SkeletonStats n={stats} />}
      {Array.from({ length: panels }, (_, i) => (
        <SkeletonPanel key={i} rows={i === 0 ? 4 : 3} />
      ))}
    </div>
  )
}

/** The trust report's own shape: a tall header, then panels. */
export function SkeletonReport() {
  return (
    <div aria-busy="true">
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px',
                    overflow: 'hidden', marginBottom: '18px' }}>
        <Skeleton w="100%" h={5} r={0} />
        <div style={{ padding: '26px 28px', display: 'flex', gap: '26px', flexWrap: 'wrap' }}>
          <Skeleton w={150} h={150} r="50%" />
          <div style={{ flex: 1, minWidth: '280px' }}>
            <Skeleton w="65%" h={25} r={9} />
            <div style={{ height: '14px' }} />
            <Skeleton w={140} h={30} r={999} />
            <div style={{ height: '16px' }} />
            <Skeleton w="90%" h={14} />
            <div style={{ height: '8px' }} />
            <Skeleton w="72%" h={14} />
          </div>
        </div>
      </div>
      <SkeletonPanel rows={4} />
      <SkeletonPanel rows={3} />
    </div>
  )
}
