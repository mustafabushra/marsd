import { COLORS, BORDER_RADIUS } from '../theme/themeConstants'

/**
 * The pieces every admin screen was drawing by hand.
 *
 * ============================================================================
 * What this is for
 * ============================================================================
 * Counted before it was written: 33 files each declare their own `card`, in
 * four different corner radii. 405 buttons are styled inline across 60 files.
 * `#64748B` is typed out 666 times, `#E2E8F0` 558. Nothing is shared, so
 * nothing is consistent — and changing one thing means finding sixty places
 * that agreed by coincidence rather than by reference.
 *
 * The values here are not new. They are the ones already dominant in the
 * product, so adopting a primitive is meant to change nothing visible on the
 * screen that adopts it. That is deliberate: a migration that also redesigns
 * cannot be reviewed, because every difference looks intentional.
 *
 * ============================================================================
 * Why it builds on themeConstants
 * ============================================================================
 * src/theme/themeConstants.js already holds the palette, the radii, the
 * shadows — «Single Source of Truth extracted from design-approved.html» — and
 * is imported by exactly zero files. The system was written and never adopted,
 * which is why the hand-written copies exist. It is the source here rather than
 * a second one beside it; the only thing added to it was the danger and warning
 * families, which were missing and are why those two colours were typed out
 * three hundred times.
 */

const FONT = 'inherit'

/** A panel. The 16px radius is what 22 of the 33 hand-written cards used. */
export function Card ({ children, style, ...rest }) {
  return (
    <div style={{
      background: COLORS.bgWhite,
      border: `1px solid ${COLORS.border}`,
      borderRadius: BORDER_RADIUS.r16,
      padding: '20px',
      ...style,
    }} {...rest}>{children}</div>
  )
}

/** A panel's heading, with the rule under it that most of them drew. */
export function SectionTitle ({ children, note, style }) {
  return (
    <div style={{ marginBottom: note ? '12px' : '14px', ...style }}>
      <h2 style={{
        fontSize: '15px', fontWeight: 900, color: COLORS.textDark || '#0F172A',
        margin: 0, lineHeight: 1.5,
      }}>{children}</h2>
      {note && (
        <p style={{ fontSize: '12.5px', color: COLORS.textMuted || '#64748B', margin: '4px 0 0', lineHeight: 1.9 }}>
          {note}
        </p>
      )}
    </div>
  )
}

const TONE = {
  primary: { bg: COLORS.primary, fg: '#fff', border: 0 },
  success: { bg: COLORS.success, fg: '#fff', border: 0 },
  danger: { bg: '#fff', fg: COLORS.danger, border: `1.5px solid ${COLORS.dangerBorder}` },
  quiet: { bg: '#fff', fg: COLORS.primary, border: `1.5px solid ${COLORS.border}` },
}

/**
 * A button.
 *
 * `tone` rather than a colour, so a screen says what the action is and not what
 * it looks like — the reason the same green appeared as four different hex
 * values depending on who typed it.
 */
export function Button ({ tone = 'quiet', size = 'md', busy, disabled, children, style, ...rest }) {
  const t = TONE[tone] || TONE.quiet
  const off = disabled || busy
  const pad = size === 'sm' ? '7px 14px' : size === 'lg' ? '12px 24px' : '9px 18px'
  const fs = size === 'sm' ? '12.5px' : size === 'lg' ? '14.5px' : '13.5px'
  return (
    <button
      disabled={off}
      style={{
        padding: pad,
        borderRadius: BORDER_RADIUS.r10,
        border: t.border,
        // Disabled is a flat grey rather than the tone at low opacity: a faded
        // green still reads as «go» at a glance.
        background: off ? (t.border ? '#fff' : '#CBD5E1') : t.bg,
        color: off && !t.border ? '#fff' : off ? '#94A3B8' : t.fg,
        fontSize: fs,
        fontWeight: 800,
        cursor: off ? 'default' : 'pointer',
        fontFamily: FONT,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >{children}</button>
  )
}

const PILL = {
  neutral: { bg: COLORS.bgVeryLight, fg: '#475569' },
  success: { bg: COLORS.successLight, fg: COLORS.successDark },
  danger: { bg: COLORS.dangerLight, fg: COLORS.danger },
  warning: { bg: COLORS.warningLight, fg: COLORS.warning },
  info: { bg: COLORS.infoLight, fg: COLORS.info },
}

/** A state, as a word with a colour behind it. */
export function Pill ({ tone = 'neutral', children, style }) {
  const t = PILL[tone] || PILL.neutral
  return (
    <span style={{
      background: t.bg, color: t.fg,
      borderRadius: BORDER_RADIUS.rFull,
      padding: '4px 12px', fontSize: '12px', fontWeight: 800,
      whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  )
}

/**
 * Nothing here — said as a fact rather than a blank.
 *
 * An empty panel and a broken one look identical, and «لا توجد نتائج» with no
 * second line leaves the reader unable to tell which they are looking at.
 */
export function EmptyState ({ title, children, action }) {
  return (
    <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2, padding: '4px 0' }}>
      <b style={{ color: '#0F172A' }}>{title}</b>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: '12px' }}>{action}</div>}
    </div>
  )
}

/** A section that failed on its own, and can be retried on its own. */
export function ErrorState ({ what, message, onRetry }) {
  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: COLORS.danger }}>
        تعذّر تحميل {what}
      </div>
      {message && (
        <div style={{ fontSize: '12.5px', color: '#64748B', margin: '5px 0 10px', lineHeight: 1.9 }}>
          {message}
        </div>
      )}
      {onRetry && <Button size="sm" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  )
}

/**
 * A label over a value — the shape every «facts» grid was rebuilding.
 *
 * `hideEmpty` because several screens drop a field entirely rather than print
 * «—» for it, and a primitive that cannot do that is one they will fork.
 */
export function Field ({ label, value, mono, hideEmpty, style }) {
  if (hideEmpty && (value == null || value === '')) return null
  return (
    <div style={style}>
      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700 }}>{label}</div>
      <div style={{
        fontSize: '14px', color: '#0F172A', fontWeight: 700, marginTop: '3px',
        wordBreak: 'break-word',
        ...(mono ? { fontVariantNumeric: 'tabular-nums' } : null),
      }}>{value ?? '—'}</div>
    </div>
  )
}

/** Fields laid out so they reflow instead of overflowing. */
export function FieldGrid ({ children, min = '170px', style }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
      gap: '14px', ...style,
    }}>{children}</div>
  )
}

/** The heading of a screen. */
export function PageTitle ({ children, note }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        {children}
      </h1>
      {note && (
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.9, maxWidth: '70ch' }}>
          {note}
        </p>
      )}
    </div>
  )
}
