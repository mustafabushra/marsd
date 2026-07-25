import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSignUp } from '@clerk/react'
import { clerkErrorMessage } from '../lib/clerkErrors'
import { AuthCard, AuthLink, CaptchaSlot, CLERK_NOT_READY, ErrorBanner, Field, SubmitButton, useClerkReady } from '../components/auth/AuthKit'

/**
 * /accept-invite — where an invitation email lands.
 *
 * Clerk appends __clerk_ticket to the invitation's redirect_url. The ticket
 * strategy carries the invited address itself, so the invitee is never asked
 * for an email and cannot sign up as someone else — they choose a password and
 * nothing more. No verification code either: following the emailed link is the
 * proof of address.
 *
 * On success /auth/callback reads pending_invites and attaches the new user to
 * the inviting tenant with the invited role.
 */
export default function AcceptInvite() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const ticket = params.get('__clerk_ticket')
  const { isLoaded, signUp, setActive } = useSignUp()
  const waitForClerk = useClerkReady(isLoaded)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return }

    setError('')
    setBusy(true)
    try {
      if (!(await waitForClerk())) { setError(CLERK_NOT_READY); return }

      const attempt = await signUp.create({ strategy: 'ticket', ticket, password })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId })
        navigate('/auth/callback', { replace: true })
        return
      }

      setError('لم يكتمل تفعيل الدعوة — اطلب من مدير شركتك إعادة إرسالها')
    } catch (err) {
      setError(clerkErrorMessage(err, 'تعذّر تفعيل الدعوة'))
    } finally {
      setBusy(false)
    }
  }

  if (!ticket) {
    return (
      <AuthCard title="دعوة الانضمام" subtitle="هذه الصفحة تُفتح من رابط الدعوة المُرسل إلى بريدك">
        <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.9, margin: '0 0 18px', textAlign: 'center' }}>
          لم نجد رمز دعوة في هذا الرابط. افتحه من رسالة الدعوة كما وصلتك،
          أو اطلب من مدير شركتك إعادة إرسالها.
        </p>
        <div style={{ textAlign: 'center' }}>
          <AuthLink href="/login">لديك حساب؟ سجّل الدخول</AuthLink>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="تفعيل دعوتك"
      subtitle="عيّن كلمة مرورك للانضمام إلى فريق شركتك على مرصد"
      footer={<>لديك حساب بالفعل؟ <AuthLink href="/login">تسجيل الدخول</AuthLink></>}
    >
      <ErrorBanner>{error}</ErrorBanner>

      <Field
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        disabled={busy}
        onEnter={submit}
        hint="8 أحرف على الأقل. اخلط أحرفاً وأرقاماً ورموزاً."
      />

      <Field
        label="تأكيد كلمة المرور"
        type="password"
        value={confirm}
        onChange={setConfirm}
        placeholder="••••••••"
        autoComplete="new-password"
        disabled={busy}
        onEnter={submit}
      />

      <CaptchaSlot />

      <SubmitButton onClick={submit} busy={busy}>
        تفعيل الحساب والانضمام
      </SubmitButton>
    </AuthCard>
  )
}
