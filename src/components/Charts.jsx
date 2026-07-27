import { useState } from 'react'

/**
 * The chart pieces the admin analytics screens are built from.
 *
 * Shared rather than repeated per screen so the encoding rules hold in one
 * place. The rules that matter here:
 *
 *  · Colours come from a validated categorical palette, assigned in fixed slot
 *    order and never cycled. Marsad's own navy (#1E2A52) is not among them — it
 *    fails the chroma floor, meaning it reads as grey rather than as an
 *    identity — so brand colour stays on chrome and the data wears these.
 *
 *  · Status colours are reserved for state (approved / pending / rejected) and
 *    never reused as a series. They always ship with a written label, because
 *    two of them sit below 3:1 on a light surface and colour alone would be the
 *    only thing carrying the meaning.
 *
 *  · Every bar is directly labelled with its value. That is also the relief the
 *    palette requires: the aqua slot is under 3:1 against white.
 *
 *  · One axis, always. Two measures of different scale get two charts.
 */

// Validated categorical order — first three slots clear every gate on all pairs.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a']

// Reserved for state. Never a series.
export const STATUS_COLOR = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#6b7280',
}

const INK = { primary: '#0F172A', secondary: '#52514e', muted: '#94A3B8' }
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

/** A single number that is the whole answer. Not a chart. */
export function StatTile({ label, value, sub, tone }) {
  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: '12.5px', color: INK.secondary, fontWeight: 700, marginBottom: '7px', textAlign: 'right' }}>{label}</div>
      <div style={{ fontSize: '27px', fontWeight: 900, color: tone || INK.primary, textAlign: 'right', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: INK.muted, fontWeight: 600, marginTop: '5px', textAlign: 'right' }}>{sub}</div>}
    </div>
  )
}

/**
 * Magnitude across a handful of named things. Horizontal because the names are
 * Arabic words, not dates — a vertical bar chart would turn every label on its
 * side to save space it does not need.
 */
export function BarList({ title, rows, unit = '', color, empty = 'لا توجد بيانات' }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div style={{ ...card, padding: '22px' }}>
      <h3 style={{ fontSize: '15.5px', fontWeight: 900, color: INK.primary, margin: '0 0 18px', textAlign: 'right' }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ fontSize: '13.5px', color: INK.muted, fontWeight: 600, textAlign: 'right', padding: '12px 0' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
          {rows.map((r, i) => {
            const c = r.color || color || SERIES[i % SERIES.length]
            return (
              <div
                key={r.label}
                onMouseEnter={() => setHover(r.label)}
                onMouseLeave={() => setHover(null)}
                style={{ position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px', gap: '10px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: INK.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  {/* Direct label on every bar: the value in ink, identity on the
                      mark beside it. Text never wears the series colour. */}
                  <span style={{ fontSize: '13px', fontWeight: 800, color: INK.secondary, flexShrink: 0 }}>
                    {r.value.toLocaleString('en-US')}{unit}
                  </span>
                </div>
                <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(r.value / max) * 100}%`,
                    height: '100%',
                    background: c,
                    borderRadius: '0 5px 5px 0',
                    transition: 'width .3s',
                    opacity: hover && hover !== r.label ? 0.55 : 1,
                  }} />
                </div>
                {r.note && <div style={{ fontSize: '11.5px', color: INK.muted, fontWeight: 600, marginTop: '4px', textAlign: 'right' }}>{r.note}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Change over time, one series. A line, because the reader is looking at a
 * trend rather than comparing individual months — and one series, so no legend:
 * the title names it.
 */
export function TrendLine({ title, points, unit = '' }) {
  const [hover, setHover] = useState(null)
  const W = 520, H = 150, PAD = 8

  if (points.length < 2) {
    return (
      <div style={{ ...card, padding: '22px' }}>
        <h3 style={{ fontSize: '15.5px', fontWeight: 900, color: INK.primary, margin: '0 0 12px', textAlign: 'right' }}>{title}</h3>
        <div style={{ fontSize: '13.5px', color: INK.muted, fontWeight: 600, textAlign: 'right' }}>لا توجد فترة كافية للرسم</div>
      </div>
    )
  }

  const max = Math.max(1, ...points.map((p) => p.value))
  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  return (
    <div style={{ ...card, padding: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', gap: '10px' }}>
        <h3 style={{ fontSize: '15.5px', fontWeight: 900, color: INK.primary, margin: 0, textAlign: 'right' }}>{title}</h3>
        <span style={{ fontSize: '12.5px', color: INK.muted, fontWeight: 700 }}>
          {hover != null ? `${points[hover].label}: ${points[hover].value.toLocaleString('en-US')}${unit}` : `الذروة ${max.toLocaleString('en-US')}${unit}`}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label={title}>
        {/* Recessive grid: it locates the marks, it does not compete with them. */}
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} stroke="#F1F5F9" strokeWidth="1" />
        ))}
        <path d={path} fill="none" stroke={SERIES[0]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {/* The hit target is wider than the mark. */}
            <rect x={x(i) - 14} y={0} width="28" height={H} fill="transparent" />
            <circle
              cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5}
              fill={SERIES[0]} stroke="#fff" strokeWidth="2"
            />
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '9px', fontSize: '11.5px', color: INK.muted, fontWeight: 700 }}>
        {points.map((p, i) => (
          <span key={p.label} style={{ color: hover === i ? INK.primary : INK.muted }}>{p.label}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * A distribution across states. Each segment carries an icon and a written
 * label as well as its colour — two of the status steps are under 3:1 on white,
 * and a state must never be legible only to someone who can see the hue.
 */
export function StatusBar({ title, segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div style={{ ...card, padding: '22px' }}>
      <h3 style={{ fontSize: '15.5px', fontWeight: 900, color: INK.primary, margin: '0 0 16px', textAlign: 'right' }}>{title}</h3>

      {total === 0 ? (
        <div style={{ fontSize: '13.5px', color: INK.muted, fontWeight: 600, textAlign: 'right' }}>لا توجد بيانات</div>
      ) : (
        <>
          {/* 2px surface gaps between segments, so adjacent fills never touch. */}
          <div style={{ display: 'flex', gap: '2px', height: '11px', marginBottom: '16px' }}>
            {segments.filter((s) => s.value > 0).map((s) => (
              <div key={s.label} title={`${s.label}: ${s.value}`} style={{ flex: s.value, background: s.color, borderRadius: '3px' }} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {segments.map((s) => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: INK.primary }}>
                  <span aria-hidden style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
                  {s.icon} {s.label}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: INK.secondary }}>
                  {s.value.toLocaleString('en-US')}
                  <span style={{ color: INK.muted, fontWeight: 700 }}> · {total ? Math.round((s.value / total) * 100) : 0}%</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
