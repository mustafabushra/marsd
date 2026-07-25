/**
 * The page frame around Clerk's authentication components.
 *
 * Clerk renders the forms; this supplies the surround — the Arabic heading, the
 * card, the footer link — so /login, /register, /accept-invite and the rest read
 * as pages of this site rather than as an embedded widget. Field, button and
 * error components lived here too while the forms were hand-built; they went
 * with the forms.
 *
 * Colours follow the palette the rest of the app uses inline, and the same
 * values feed lib/clerkAppearance.js so the frame and its contents match.
 */

const C = {
  ink: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  bg: '#F8FAFC',
  greenDark: '#15803D',
}

export function AuthCard({ title, subtitle, children, footer, wide }) {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px 64px', minHeight: '100vh', background: C.bg }}>
      <div style={{ width: '100%', maxWidth: wide ? '480px' : '430px' }}>
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

export function AuthLink({ href, children }) {
  return <a href={href} style={{ color: C.greenDark, fontWeight: 800, textDecoration: 'none' }}>{children}</a>
}
