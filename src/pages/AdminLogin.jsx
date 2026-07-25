import { SignIn } from '@clerk/react'
import { AuthCard, AuthLink } from '../components/auth/AuthKit'

/**
 * /admin-login — the same credentials as /login, aimed at the admin console.
 *
 * Signing in here grants nothing on its own: AdminRoute checks the role once a
 * session exists and sends a non-admin to /unauthorized. This page only decides
 * where to land afterwards.
 */
export default function AdminLogin() {
  return (
    <AuthCard
      title="دخول الإدارة"
      subtitle="لوحة التحكم الإدارية لمنصة مرصد"
      footer={<>دخول عادي؟ <AuthLink href="/login">تسجيل دخول للشركات</AuthLink></>}
    >
      <SignIn
        routing="virtual"
        signUpUrl="/register"
        forceRedirectUrl="/admin"
      />
    </AuthCard>
  )
}
