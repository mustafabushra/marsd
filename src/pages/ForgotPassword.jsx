import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CodeField, ErrorBanner, Field, InfoBanner, SubmitButton, TextButton } from '../components/auth/AuthKit'

/**
 * /forgot-password — a real reset, over Clerk.
 *
 * The previous version never contacted anything: it awaited setTimeout(1000),
 * announced "تم إرسال رمز التحقق", advanced the step, and accepted any six
 * digits. Every visitor who genuinely lost their password was walked through a
 * flow that could not possibly restore access to their account.
 *
 * Two steps, both real:
 *   1. reset_password_email_code — Clerk emails the code
 *   2. attemptFirstFactor with the code and the new password, then activate
 *      the returned session so the user lands signed in.
 */
export default function ForgotPassword() {
  const navigate = useNavigate()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    if (!isLoaded || busy) return
    const identifier = email.trim().toLowerCase()
    if (!identifier) { setError('أدخل بريدك الإلكتروني'); return }

    setError('')
    setBusy(true)
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier })
      setNotice(`أرسلنا رمزاً من 6 أرقام إلى ${identifier}`)
      setStep('reset')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر إرسال رمز الاستعادة'))
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    if (!isLoaded || busy) return
    if (code.length !== 6) { setError('الرمز مكوّن من 6 أرقام'); return }
    if (password.length < 8) { setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'); return }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return }

    setError('')
    setBusy(true)
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/auth/callback', { replace: true })
        return
      }

      setError('حسابك يتطلب خطوة تحقق إضافية غير مدعومة هنا — تواصل مع الدعم')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر تعيين كلمة المرور'))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'reset') {
    return (
      <AuthCard
        title="تعيين كلمة مرور جديدة"
        subtitle="أدخل الرمز الذي وصلك مع كلمة المرور الجديدة"
        footer={<TextButton onClick={() => { setStep('email'); setError(''); setNotice('') }} disabled={busy}>← استخدام بريد آخر</TextButton>}
      >
        <ErrorBanner>{error}</ErrorBanner>
        <InfoBanner>{notice}</InfoBanner>

        <CodeField
          label="رمز الاستعادة"
          value={code}
          onChange={setCode}
          disabled={busy}
          hint="لم يصلك؟ تحقّق من مجلد الرسائل غير المرغوبة."
        />

        <Field
          label="كلمة المرور الجديدة"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={busy}
          hint="8 أحرف على الأقل."
        />

        <Field
          label="تأكيد كلمة المرور"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={busy}
          onEnter={resetPassword}
        />

        <SubmitButton onClick={resetPassword} busy={busy}>حفظ كلمة المرور والدخول</SubmitButton>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="استعادة كلمة المرور"
      subtitle="أدخل بريدك وسنرسل لك رمزاً لتعيين كلمة مرور جديدة"
      footer={<>تذكّرتها؟ <AuthLink href="/login">العودة لتسجيل الدخول</AuthLink></>}
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
        onEnter={sendCode}
      />

      <SubmitButton onClick={sendCode} busy={busy} disabled={!isLoaded}>
        إرسال رمز الاستعادة
      </SubmitButton>
    </AuthCard>
  )
}
