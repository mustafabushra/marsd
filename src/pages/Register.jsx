import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignUp } from '@clerk/react'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CaptchaSlot, CodeField, ErrorBanner, Field, InfoBanner, SubmitButton, TextButton } from '../components/auth/AuthKit'

/**
 * /register — founding a new company account.
 *
 * Clerk's prebuilt <SignUp/> handled the email-code round trip for us; driving
 * it ourselves means owning both steps explicitly:
 *   1. create the sign-up, then ask Clerk to email a verification code
 *   2. attempt the code, activate the session, hand off to /auth/callback
 *
 * /auth/callback then sees a user with no tenant and routes to onboarding, so
 * this page does not need to know where a brand-new account goes next.
 */
export default function Register() {
  const navigate = useNavigate()
  const { isLoaded, signUp, setActive } = useSignUp()
  const [step, setStep] = useState('details')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const startSignUp = async () => {
    if (busy) return
    if (!isLoaded) { setError('نظام التسجيل لم يكتمل تحميله بعد — انتظر لحظة أو حدّث الصفحة'); return }
    const address = email.trim().toLowerCase()
    if (!firstName.trim()) { setError('أدخل الاسم الأول'); return }
    if (!address) { setError('أدخل بريدك الإلكتروني'); return }
    if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return }

    setError('')
    setBusy(true)
    try {
      await signUp.create({
        emailAddress: address,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setNotice(`أرسلنا رمزاً من 6 أرقام إلى ${address}`)
      setStep('verify')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر إنشاء الحساب'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (busy) return
    if (!isLoaded) { setError('نظام التسجيل لم يكتمل تحميله بعد — حدّث الصفحة'); return }
    if (code.length !== 6) { setError('الرمز مكوّن من 6 أرقام'); return }

    setError('')
    setBusy(true)
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/auth/callback', { replace: true })
        return
      }

      setError('لم يكتمل التحقق — راجع الرمز وأعد المحاولة')
    } catch (err) {
      setError(clerkErrorMessage(err, 'رمز غير صحيح'))
    } finally {
      setBusy(false)
    }
  }

  const resendCode = async () => {
    if (busy) return
    if (!isLoaded) { setError('نظام التسجيل لم يكتمل تحميله بعد — حدّث الصفحة'); return }
    setError('')
    setBusy(true)
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setNotice('أرسلنا رمزاً جديداً — تحقق من بريدك')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر إرسال رمز جديد'))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'verify') {
    return (
      <AuthCard
        title="تأكيد بريدك الإلكتروني"
        subtitle="خطوة أخيرة لتأمين حسابك"
        footer={<TextButton onClick={() => { setStep('details'); setError(''); setNotice('') }} disabled={busy}>← تعديل البيانات</TextButton>}
      >
        <ErrorBanner>{error}</ErrorBanner>
        <InfoBanner>{notice}</InfoBanner>

        <CodeField
          label="رمز التحقق"
          value={code}
          onChange={setCode}
          disabled={busy}
          onEnter={verify}
          hint="لم يصلك؟ تحقّق من مجلد الرسائل غير المرغوبة."
        />

        <SubmitButton onClick={verify} busy={busy}>تأكيد وإنشاء الحساب</SubmitButton>

        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <TextButton onClick={resendCode} disabled={busy}>إعادة إرسال الرمز</TextButton>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="إنشاء حساب شركة"
      subtitle="انضم إلى مرصد وابدأ تقييم شركائك خلال دقائق"
      footer={<>لديك حساب بالفعل؟ <AuthLink href="/login">تسجيل الدخول</AuthLink></>}
    >
      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <Field label="الاسم الأول" value={firstName} onChange={setFirstName} placeholder="محمد" autoComplete="given-name" disabled={busy} onEnter={startSignUp} ltr={false} />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="اسم العائلة" value={lastName} onChange={setLastName} placeholder="العتيبي" autoComplete="family-name" disabled={busy} onEnter={startSignUp} ltr={false} />
        </div>
      </div>

      <Field
        label="البريد الإلكتروني"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="name@company.com"
        autoComplete="email"
        disabled={busy}
        onEnter={startSignUp}
      />

      <Field
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        disabled={busy}
        onEnter={startSignUp}
        hint="8 أحرف على الأقل. اخلط أحرفاً وأرقاماً ورموزاً."
      />

      <CaptchaSlot />

      <SubmitButton onClick={startSignUp} busy={busy}>
        إنشاء الحساب
      </SubmitButton>
    </AuthCard>
  )
}
