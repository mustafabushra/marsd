import { SignUp } from '@clerk/react'
import { useSearchParams } from 'react-router-dom'
import { AuthCard, AuthLink } from '../components/auth/AuthKit'

/**
 * /accept-invite — where an invitation email lands.
 *
 * Clerk appends __clerk_ticket to the invitation's redirect_url, and <SignUp/>
 * consumes it: the invited address is carried by the ticket, pre-filled and
 * locked, so the invitee sets a password and nothing else and cannot sign up as
 * anyone but themselves.
 *
 * Afterwards /auth/callback reads pending_invites and attaches the new user to
 * the inviting tenant with the invited role.
 *
 * Without a ticket the page explains itself rather than showing a bare sign-up
 * form, which would quietly create an unaffiliated account instead.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams()
  const hasTicket = !!params.get('__clerk_ticket')

  if (!hasTicket) {
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
      <SignUp
        routing="virtual"
        signInUrl="/login"
        forceRedirectUrl="/auth/callback"
      />
    </AuthCard>
  )
}
