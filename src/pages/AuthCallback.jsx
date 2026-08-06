import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { SkeletonPanel } from '../components/Skeleton'

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

      // Record the sign-in. last_login_at had never been written for any
      // account, so the admin panel's "آخر دخول" column was blank for everyone
      // and an abandoned seat looked exactly like an active one.
      //
      // Through an RPC rather than an update from here: a policy permissive
      // enough to let a member set a timestamp on their own row lets them set
      // anything on it, and role, tenant_id and status live on that row too.
      // touch_last_login() takes no arguments, so the only row it can reach is
      // the caller's. Failure is logged and ignored — a login must not be
      // blocked by bookkeeping about the login.
      supabase.rpc('touch_last_login').then(({ error }) => {
        if (error) console.error('Failed to record sign-in time:', error)
      })

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

  // Inline styles, like every other screen here.
  //
  // This page was written in Tailwind classes — `flex items-center`,
  // `text-red-600`, `animate-spin` — and Tailwind is not built into this
  // project: it is in package.json and has no config file, no PostCSS entry and
  // no import in index.css. Every class was inert. So the sign-in callback, the
  // screen someone lands on between Clerk and their dashboard, rendered as
  // unstyled black text on white with an invisible spinner that was an empty
  // 0×0 div.
  const centre = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: '24px', background: '#F8FAFC',
    fontFamily: 'Tajawal, system-ui, sans-serif',
  }

  if (error) {
    return (
      <div dir="rtl" style={centre}>
        <div style={{ maxWidth: '520px', width: '100%', background: '#fff', border: '1px solid #FECACA', borderRadius: '16px', padding: '28px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#B91C1C', margin: '0 0 12px' }}>
            خطأ في المصادقة
          </h1>
          <p style={{ fontSize: '14.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 10px' }}>{error}</p>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>جاري التوجيه…</p>
        </div>
      </div>
    )
  }

  // No spinner. The skeleton is the loading language everywhere else in this
  // product, and the spinner beside it was the only one in the codebase — and
  // invisible at that.
  return (
    <div dir="rtl" style={{ ...centre, alignItems: 'flex-start', paddingTop: '48px' }}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        <SkeletonPanel rows={3} title={false} />
      </div>
    </div>
  )
}
