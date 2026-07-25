import { SignUp } from '@clerk/react'
import { AuthCard } from '../components/auth/AuthKit'

/**
 * /register — founding a new company account.
 *
 * Clerk owns the two-step round trip (create the sign-up, verify the emailed
 * code) and the bot check that goes with it. /auth/callback then sees a user
 * with no tenant and routes to onboarding, so this page does not need to know
 * where a brand-new account goes next.
 */
export default function Register() {
  return (
    <AuthCard
      title="إنشاء حساب شركة"
      subtitle="انضم إلى مرصد وابدأ تقييم شركائك خلال دقائق"
    >
      <SignUp
        routing="virtual"
        signInUrl="/login"
        forceRedirectUrl="/auth/callback"
      />
    </AuthCard>
  )
}
