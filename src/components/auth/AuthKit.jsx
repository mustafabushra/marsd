/**
 * The shared shell and controls behind every authentication screen.
 *
 * All five screens were previously Clerk's prebuilt components, so they matched
 * each other for free. Now that the forms are ours, that consistency has to be
 * deliberate: one card, one field, one button, used everywhere. Styling follows
 * the palette the rest of the app already uses inline (#0F172A / #64748B /
 * #E2E8F0 / #16A34A) rather than theme/themeConstants.js, which no page imports.
 */

const C = {
  ink: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E2E8F0',
  bg: '#F8FAFC',
  green: '#16A34A',
  greenDark: '#15803D',
  danger: '#B91C1C',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  infoBg: '#EEF2FF',
  infoBorder: '#C7D2FE',
  infoInk: '#3730A3',
}

export function AuthCard({ title, subtitle, children, footer, wide }) {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px 64px', minHeight: '100vh', background: C.bg }}>
      <div style={{ width: '100%', maxWidth: wide ? '480px' : '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <h1 style={{ fontSize: '27px', fontWeight: 900, color: C.ink, margin: '0 0 8px' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '14.5px', color: C.muted, margin: 0, lineHeight: 1.85 }}>{subtitle}</p>}
        </div>

        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '16px', padding: '26px 24px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' }}>
          {children}
        </div>

        {footer && (
          <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '13.5px', color: C.muted }}>{footer}</p>
        )}
      </div>
    </main>
  )
}

export function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, disabled, onEnter, hint, ltr = true, inputMode }) {
  return (
    <label style={{ display: 'block', marginBottom: '15px' }}>
      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: C.ink, marginBottom: '7px' }}>{label}</span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        style={{
          width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.border}`, borderRadius: '9px',
          padding: '11px 13px', fontSize: '14.5px', outline: 'none', fontFamily: 'inherit',
          background: disabled ? C.bg : '#fff', color: C.ink,
          direction: ltr ? 'ltr' : 'rtl', textAlign: ltr ? 'left' : 'right',
        }}
        onFocus={(e) => { e.target.style.borderColor = C.green }}
        onBlur={(e) => { e.target.style.borderColor = C.border }}
      />
      {hint && <span style={{ display: 'block', fontSize: '12px', color: C.faint, marginTop: '6px', lineHeight: 1.7 }}>{hint}</span>}
    </label>
  )
}

/** Six-digit verification code: one wide, spaced, centred box — never RTL. */
export function CodeField({ label, value, onChange, disabled, onEnter, hint }) {
  return (
    <label style={{ display: 'block', marginBottom: '15px' }}>
      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: C.ink, marginBottom: '7px' }}>{label}</span>
      <input
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder="000000"
        style={{
          width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.border}`, borderRadius: '9px',
          padding: '13px', fontSize: '24px', fontWeight: 800, letterSpacing: '.42em', textIndent: '.42em',
          textAlign: 'center', direction: 'ltr', outline: 'none', fontFamily: 'inherit', color: C.ink,
          background: disabled ? C.bg : '#fff',
        }}
        onFocus={(e) => { e.target.style.borderColor = C.green }}
        onBlur={(e) => { e.target.style.borderColor = C.border }}
      />
      {hint && <span style={{ display: 'block', fontSize: '12px', color: C.faint, marginTop: '6px', lineHeight: 1.7 }}>{hint}</span>}
    </label>
  )
}

/**
 * Only `busy` disables this. Gating it on Clerk's isLoaded produced a button
 * that sat dead on screen with nothing to explain it — the click did nothing
 * and there was no message, no cursor change worth noticing, no way to tell a
 * broken page from a slow one. A click that cannot proceed must say why, so
 * callers check readiness inside their handler and surface a real message.
 */
export function SubmitButton({ children, onClick, busy, disabled }) {
  const off = busy || disabled
  return (
    <button
      onClick={onClick}
      disabled={off}
      style={{
        width: '100%', background: off ? '#94A3B8' : C.green, color: '#fff', border: 0, borderRadius: '10px',
        padding: '12px 18px', fontSize: '15px', fontWeight: 800, cursor: off ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', marginTop: '4px',
      }}
    >
      {busy ? 'جارٍ…' : children}
    </button>
  )
}

export function TextButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: 0, padding: 0, color: disabled ? C.faint : C.greenDark,
        fontSize: '13.5px', fontWeight: 800, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

export function ErrorBanner({ children }) {
  if (!children) return null
  return (
    <div role="alert" style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '10px', padding: '11px 14px', marginBottom: '15px', color: C.danger, fontSize: '13.5px', fontWeight: 700, lineHeight: 1.8 }}>
      ⚠️ {children}
    </div>
  )
}

export function InfoBanner({ children }) {
  if (!children) return null
  return (
    <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: '10px', padding: '11px 14px', marginBottom: '15px', color: C.infoInk, fontSize: '13.5px', fontWeight: 700, lineHeight: 1.8 }}>
      {children}
    </div>
  )
}

export function AuthLink({ href, children }) {
  return <a href={href} style={{ color: C.greenDark, fontWeight: 800, textDecoration: 'none' }}>{children}</a>
}

/**
 * Clerk's bot check renders into this node. Custom flows must provide it before
 * calling signUp.create — without it, sign-up fails with captcha_unavailable on
 * any instance that has bot protection switched on.
 */
export function CaptchaSlot() {
  return <div id="clerk-captcha" style={{ marginTop: '10px' }} />
}

export const AUTH_COLORS = C
