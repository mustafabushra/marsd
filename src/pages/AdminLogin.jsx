import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, ErrorBanner, Field, SubmitButton } from '../components/auth/AuthKit'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!isLoaded) { setError('نظام تسجيل الدخول لم يكتمل تحميله بعد — انتظر لحظة أو حدّث الصفحة'); return }
    const identifier = email.trim().toLowerCase()
    if (!identifier) { setError('أدخل بريدك الإلكتروني'); return }
    if (!password) { setError('أدخل كلمة المرور'); return }

    setError('')
    setBusy(true)
    try {
      const attempt = await signIn.create({ identifier, password })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/admin', { replace: true })
        return
      }

      setError('حسابك يتطلب خطوة تحقق إضافية غير مدعومة هنا — تواصل مع الدعم')
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
