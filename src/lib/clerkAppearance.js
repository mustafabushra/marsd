/**
 * How Clerk's components should look inside Marsad.
 *
 * We drive Clerk's own <SignIn/> and <SignUp/> rather than hand-built forms.
 * Those components own the parts that are easy to get wrong and expensive to
 * get wrong quietly — email codes, invitation tickets, password reset, and the
 * bot-protection step that a custom flow has to detect and drive itself.
 *
 * What is ours is the look. Everything below is the appearance contract: one
 * object, imported by every auth screen, so they cannot drift apart. Values
 * match the palette the rest of the app already uses inline.
 */

const INK = '#0F172A'
const MUTED = '#64748B'
const BORDER = '#E2E8F0'
const GREEN = '#16A34A'
const GREEN_DARK = '#15803D'

export const clerkAppearance = {
  variables: {
    colorPrimary: GREEN,
    colorText: INK,
    colorTextSecondary: MUTED,
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: INK,
    colorDanger: '#B91C1C',
    colorSuccess: GREEN,
    borderRadius: '10px',
    fontFamily: 'Tajawal, system-ui, sans-serif',
    fontSize: '14.5px',
  },
  elements: {
    // The page already renders its own heading and card frame, so Clerk's
    // chrome would only repeat it.
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
    card: { boxShadow: 'none', border: 'none', padding: 0, background: 'transparent' },
    header: { display: 'none' },

    formButtonPrimary: {
      background: GREEN,
      fontSize: '15px',
      fontWeight: 800,
      textTransform: 'none',
      boxShadow: 'none',
      '&:hover': { background: GREEN_DARK },
      '&:focus': { boxShadow: `0 0 0 3px ${GREEN}33` },
    },
    formFieldLabel: { fontSize: '13.5px', fontWeight: 800, color: INK },
    formFieldInput: {
      border: `1.5px solid ${BORDER}`,
      fontSize: '14.5px',
      padding: '11px 13px',
      '&:focus': { borderColor: GREEN, boxShadow: `0 0 0 3px ${GREEN}22` },
    },
    socialButtonsBlockButton: {
      border: `1.5px solid ${BORDER}`,
      fontSize: '14px',
      fontWeight: 700,
      '&:hover': { background: '#F8FAFC' },
    },
    dividerLine: { background: BORDER },
    dividerText: { color: MUTED, fontSize: '13px' },
    footerActionLink: { color: GREEN_DARK, fontWeight: 800 },
    identityPreviewEditButton: { color: GREEN_DARK },
    formResendCodeLink: { color: GREEN_DARK, fontWeight: 800 },
    otpCodeFieldInput: { border: `1.5px solid ${BORDER}`, fontSize: '20px', fontWeight: 800 },
    formFieldAction: { color: GREEN_DARK, fontWeight: 700 },
    alert: { fontSize: '13.5px' },
  },
  layout: {
    // Clerk's own footer branding is not removable on a development instance;
    // it disappears once the project moves to a paid production instance.
    socialButtonsPlacement: 'top',
    showOptionalFields: true,
  },
}
