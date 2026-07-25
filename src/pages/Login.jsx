import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react/legacy'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CaptchaSlot, CLERK_NOT_READY, ErrorBanner, Field, SubmitButton, useClerkReady } from '../components/auth/AuthKit'

/**
 * /login — our own form driven by Clerk's headless hooks.
 *
 * The hooks come from @clerk/react/legacy, an export path the package defines
 * for exactly this shape. The package root ships a Signal-based useSignIn
 * instead — { signIn, errors, fetchStatus }, where create() resolves to
 * { error } rather than throwing and carries no status. Against that hook the
 * classic destructure silently yields undefined for isLoaded and setActive:
 * every readiness check fails and no error is ever surfaced.
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

      let attempt = await signIn.create({ identifier, password })

      // create() does not always settle in one call: depending on the instance
      // it can come back asking for the password as an explicit first factor
      // rather than consuming the one just passed.
      if (attempt.status === 'needs_first_factor') {
        attempt = await signIn.attemptFirstFactor({ strategy: 'password', password })
      }

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/auth/callback', { replace: true })
        return
      }

      if (attempt.status === 'needs_second_factor') {
        setError('حسابك محمي بالتحقق بخطوتين، وهو غير مدعوم في هذه الشاشة بعد — تواصل مع الدعم')
        return
      }

      if (attempt.status === 'needs_identifier') {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
        return
      }

      // Bot protection wants the client verified. Clerk renders its widget into
      // #clerk-captcha, which the page mounts below — reaching here means the
      // challenge is still outstanding rather than that anything is broken.
      if (attempt.status === 'needs_client_trust') {
        setError('أكمل التحقق من أنك لست روبوتاً أدناه ثم اضغط دخول مرة أخرى')
        return
      }

      // Name the status rather than hiding it: an unhandled one is a bug we
      // want reported, not a dead end the user has to guess at.
      setError(`تعذّر إكمال تسجيل الدخول (${attempt.status || 'حالة غير معروفة'})`)
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

      <CaptchaSlot />

      <SubmitButton onClick={submit} busy={busy}>
        دخول
      </SubmitButton>
    </AuthCard>
  )
}
