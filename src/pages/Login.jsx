import { SignIn } from '@clerk/react'
import { AuthCard } from '../components/auth/AuthKit'

/**
 * /login
 *
 * Clerk's own component drives the flow. Hand-built forms on these screens were
 * abandoned for a reason worth recording: they have to recognise and drive every
 * branch Clerk can return — needs_first_factor, needs_client_trust, the emailed
 * code, the reset — and each one missed fails quietly, as a button that does
 * nothing rather than an error anyone can act on. The modal in the navigation
 * bar worked throughout precisely because Clerk was driving it.
 *
 * What stays ours: the page frame around it, the Arabic copy, and the palette —
 * localization and appearance are set once on ClerkProvider so this screen and
 * that modal cannot look like two different products.
 *
 * Routing goes to /auth/callback, which reads the user's tenant and company
 * status and decides where they actually belong.
 */
export default function Login() {
  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="أدخل بياناتك للوصول إلى حساب شركتك"
    >
      <SignIn
        routing="virtual"
        signUpUrl="/register"
        forceRedirectUrl="/auth/callback"
      />
    </AuthCard>
  )
}
