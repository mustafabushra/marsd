import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * /auth/callback — نقطة الدخول الوحيدة بعد تسجيل الدخول عبر Clerk
 *
 * الفلو:
 * 1. Clerk يتحقق من البريد والكلمة المرور
 * 2. المستخدم يُوجَّه إلى هنا
 * 3. نقرأ قاعدة البيانات لتحديد حالة المستخدم
 * 4. نُوجّه إلى الصفحة المناسبة
 *
 * الحالات الممكنة:
 * - tenant_id NULL → لم يملأ الاستمارة بعد → /company-onboarding
 * - tenant_id NOT NULL, company_status='pending' → ينتظر الموافقة الإدارية → /registration-pending
 * - tenant_id NOT NULL, company_status='approved' → موافق، لديه الوصول → /dashboard
 * - tenant_id NOT NULL, company_status='rejected' → تم الرفض → /account-rejected
 * - tenant_id NOT NULL, company_status='suspended' → معلق → /account-suspended
 */

export default function AuthCallback() {
  const navigate = useNavigate()
  const { isLoaded, userId } = useAuth()
  const { isLoaded: isUserLoaded, user } = useUser()
  const [error, setError] = useState(null)
  // React StrictMode mounts effects twice in dev; without this guard the
  // "create the user row" branch runs twice and the second insert collides.
  const startedRef = useRef(false)

  useEffect(() => {
    // Both hooks must be ready: useAuth gives us the id, useUser the email.
    if (!isLoaded || !isUserLoaded) {
      return // Wait for Clerk to load
    }

    if (!userId) {
      // Invitations sent before /accept-invite existed still point here, and
      // they arrive carrying an unconsumed __clerk_ticket. Sending those to
      // /login strands the invitee: they have no password yet. Hand the ticket
      // to the page that can actually redeem it.
      const ticket = new URLSearchParams(window.location.search).get('__clerk_ticket')
      navigate(ticket ? `/accept-invite?__clerk_ticket=${encodeURIComponent(ticket)}` : '/login', { replace: true })
      return
    }

    if (startedRef.current) return
    startedRef.current = true
    determineRoute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isUserLoaded, userId])

  async function determineRoute() {
    try {
      const supabase = getSupabase()

      // 1. Query users table
      let { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, tenant_id, role, status')
        .eq('id', userId)
        .single()

      if (userError && userError.code === 'PGRST116') {
        // User doesn't exist yet - create it. The email comes from the Clerk
        // session already loaded in the browser (same source the onboarding and
        // registration pages use) — no server round-trip needed.
        const email = (user?.primaryEmailAddress?.emailAddress || '').toLowerCase().trim()
        if (!email) {
          throw new Error('لم يتم العثور على بريد إلكتروني في حسابك')
        }

        // Honor a pending invitation for this email, if any: attach the new
        // user to the inviting tenant with the invited role instead of sending
        // them to onboarding. Works regardless of how the invite was delivered.
        const { data: invite } = await supabase
          .from('pending_invites')
          .select('id, tenant_id, role')
          .eq('email', email)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{
            id: userId,
            email,
            first_name: user?.firstName || null,
            last_name: user?.lastName || null,
            role: invite?.role || 'company_member',
            status: 'active',
            tenant_id: invite?.tenant_id || null,
          }])
          .select('id, email, tenant_id, role')
          .single()

        if (createError || !newUser) {
          throw new Error('فشل إنشاء ملف المستخدم')
        }

        if (invite) {
          // Mark the invite accepted, then continue into the normal tenant /
          // company-status routing below using the freshly created record.
          await supabase.from('pending_invites').update({ status: 'accepted' }).eq('id', invite.id)
          userData = newUser
        } else {
          // Brand-new user with no invite - collect company details first.
          navigate('/company-onboarding')
          return
        }
      } else if (userError || !userData) {
        throw new Error('فشل البحث عن المستخدم')
      }

      // 2. Marsad's own staff have no tenant and never will, so the absence of
      //    one is not an unfinished sign-up. Sending an administrator to a
      //    company sign-up form at every sign-in was the last of four places
      //    reading that absence the same way — and the earliest, so it fired
      //    before any of the others could.
      if (userData.role === 'platform_admin' || userData.role === 'reviewer') {
        navigate('/admin')
        return
      }

      // 3. A company user with no tenant has not finished signing up.
      if (!userData.tenant_id) {
        navigate('/company-onboarding')
        return
      }

      // 3. User has tenant - check company status
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('company_id')
        .eq('id', userData.tenant_id)
        .single()

      if (tenantError || !tenantData) {
        throw new Error('فشل البحث عن بيانات الشركة')
      }

      // 4. If no company, go to onboarding
      if (!tenantData.company_id) {
        navigate('/company-onboarding')
        return
      }

      // 5. Check company status
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('status')
        .eq('id', tenantData.company_id)
        .single()

      if (companyError || !companyData) {
        throw new Error('فشل البحث عن حالة الشركة')
      }

      // Route based on company.status
      switch (companyData.status) {
        case 'pending':
          navigate('/registration-pending')
          break
        case 'approved':
        case 'active':
          navigate('/dashboard')
          break
        case 'rejected':
          navigate('/account-rejected')
          break
        case 'suspended':
          navigate('/account-suspended')
          break
        default:
          console.warn('Unknown company status:', companyData.status)
          navigate('/dashboard')
      }
    } catch (err) {
      console.error('Auth callback error:', err)
      setError(err.message || 'حدث خطأ في المصادقة')
      // Fallback after 3 seconds
      setTimeout(() => {
        navigate('/dashboard')
      }, 3000)
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">خطأ في المصادقة</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">جاري التوجيه...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">جاري تحميل حسابك...</p>
      </div>
    </div>
  )
}
