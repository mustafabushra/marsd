import { SignUp } from '@clerk/react'
import { useSearchParams } from 'react-router-dom'

/**
 * /accept-invite — where an invitation email lands.
 *
 * Clerk appends __clerk_ticket to the invitation's redirect_url. Only a page
 * rendering <SignUp/> can consume that ticket; it then pre-fills and locks the
 * invited address and asks for nothing but a password.
 *
 * This used to point at /auth/callback, which renders no sign-up form at all,
 * so the ticket went unread, the visitor stayed signed out, and the callback
 * bounced them to /login. The only other <SignUp/> in the app is /register,
 * which is the found-a-company flow — an invited member sent there is asked to
 * create a company instead of joining one.
 *
 * After sign-up we force /auth/callback, which reads pending_invites and
 * attaches the new user to the inviting tenant with the invited role.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams()
  const hasTicket = !!params.get('__clerk_ticket')

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '50px 28px 70px', minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
            {hasTicket ? 'تفعيل دعوتك' : 'دعوة الانضمام'}
          </h1>
          <p style={{ fontSize: '15px', color: '#64748B', margin: 0, lineHeight: 1.8 }}>
            {hasTicket
              ? 'عيّن كلمة مرورك للانضمام إلى فريق شركتك على مرصد'
              : 'هذه الصفحة تُفتح من رابط الدعوة المُرسل إلى بريدك'}
          </p>
        </div>

        {hasTicket ? (
          <SignUp
            routing="virtual"
            forceRedirectUrl="/auth/callback"
            signInUrl="/login"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-lg rounded-2xl',
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-semibold',
                formFieldInput: 'border border-gray-200 rounded-lg px-4 py-3',
              },
            }}
          />
        ) : (
          <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', textAlign: 'center' }}>
            <p style={{ fontSize: '14.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 18px' }}>
              لم نجد رمز دعوة في هذا الرابط. افتح الرابط من رسالة الدعوة كما وصلتك،
              أو اطلب من مدير شركتك إعادة إرسالها.
            </p>
            <a
              href="/login"
              style={{ display: 'inline-block', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '11px 26px', fontSize: '14px', fontWeight: 800, textDecoration: 'none' }}
            >
              لديك حساب؟ سجّل الدخول
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
