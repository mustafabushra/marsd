import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CLERK_NOT_READY, ErrorBanner, Field, SubmitButton, useClerkReady } from '../components/auth/AuthKit'

/**
 * /login — our own form driven by Clerk's headless useSignIn.
 *
 * Sends the session to /auth/callback rather than straight to /dashboard: the
 * callback is what reads the user's tenant and company status and decides where
 * they actually belong (onboarding, pending approval, dashboard).
 */
export default function Login() {
  const navigate = useNavigate()
  const { isLoaded, signIn, setActive } = useSignIn()
  const waitForClerk = useClerkReady(isLoaded)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    const identifier = email.trim().toLowerCase()
    if (!identifier) { setError('أدخل بريدك الإلكتروني'); return }
    if (!password) { setError('أدخل كلمة المرور'); return }

    setError('')
    setBusy(true)
    try {
      if (!(await waitForClerk())) { setError(CLERK_NOT_READY); return }

      const attempt = await signIn.create({ identifier, password })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/auth/callback', { replace: true })
        return
      }

      // Anything else means the instance asks for a second step we do not
      // render (MFA, for example). Say so plainly instead of failing silently.
      setError('حسابك يتطلب خطوة تحقق إضافية غير مدعومة هنا — تواصل مع الدعم')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر تسجيل الدخول'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="أدخل بياناتك للوصول إلى حساب شركتك"
      footer={<>ليس لديك حساب؟ <AuthLink href="/register">أنشئ حساب شركة</AuthLink></>}
    >
      <ErrorBanner>{error}</ErrorBanner>

      <Field
        label="البريد الإلكتروني"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="name@company.com"
        autoComplete="email"
        disabled={busy}
        onEnter={submit}
      />

      <Field
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
        disabled={busy}
        onEnter={submit}
      />

      <div style={{ textAlign: 'left', marginBottom: '16px' }}>
        <AuthLink href="/forgot-password">نسيت كلمة المرور؟</AuthLink>
      </div>

      <SubmitButton onClick={submit} busy={busy}>
        دخول
      </SubmitButton>
    </AuthCard>
  )
}
