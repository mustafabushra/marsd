import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react/legacy'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CLERK_NOT_READY, ErrorBanner, Field, SubmitButton, useClerkReady } from '../components/auth/AuthKit'

/**
 * /admin-login — same credentials as /login, aimed at the admin console.
 *
 * Authenticating here does not grant admin rights: AdminRoute still checks the
 * role after the session exists, and sends a non-admin to /unauthorized. This
 * page only decides where to land afterwards.
 */
export default function AdminLogin() {
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

      if (attempt.status === 'needs_first_factor') {
        attempt = await signIn.attemptFirstFactor({ strategy: 'password', password })
      }

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/admin', { replace: true })
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

      setError(`تعذّر إكمال تسجيل الدخول (${attempt.status || 'حالة غير معروفة'})`)
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر تسجيل الدخول'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="دخول الإدارة"
      subtitle="لوحة التحكم الإدارية لمنصة مرصد"
      footer={<>دخول عادي؟ <AuthLink href="/login">تسجيل دخول للشركات</AuthLink></>}
    >
      <ErrorBanner>{error}</ErrorBanner>

      <Field
        label="البريد الإلكتروني"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="admin@marsad.com"
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
        دخول لوحة الإدارة
      </SubmitButton>
    </AuthCard>
  )
}
