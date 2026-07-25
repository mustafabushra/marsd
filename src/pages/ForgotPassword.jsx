import { SignIn } from '@clerk/react'
import { AuthCard, AuthLink } from '../components/auth/AuthKit'

/**
 * /forgot-password
 *
 * Clerk's <SignIn/> carries the reset flow behind its own "forgot password"
 * link — request the emailed code, then set a new password — so the route
 * stays for anyone who has the link bookmarked, and hands off to the component
 * rather than reimplementing it.
 *
 * Worth remembering what stood here before: a form that awaited
 * setTimeout(1000), announced "تم إرسال رمز التحقق", and accepted any six
 * digits, while contacting nothing at all. Anyone who genuinely lost their
 * password was walked through a reset that could never restore access.
 */
export default function ForgotPassword() {
  return (
    <AuthCard
      title="استعادة كلمة المرور"
      subtitle="اختر «نسيت كلمة المرور؟» لإرسال رمز إلى بريدك وتعيين كلمة مرور جديدة"
      footer={<>تذكّرتها؟ <AuthLink href="/login">العودة لتسجيل الدخول</AuthLink></>}
    >
      <SignIn
        routing="virtual"
        signUpUrl="/register"
        forceRedirectUrl="/auth/callback"
      />
    </AuthCard>
  )
}
