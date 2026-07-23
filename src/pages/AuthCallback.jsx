import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
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
  const { isLoaded, userId, sessionId } = useAuth()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded) {
      return // Wait for Clerk to load
    }

    if (!userId) {
      // Not authenticated - redirect to login
      navigate('/login')
      return
    }

    determineRoute()
  }, [isLoaded, userId])

  async function determineRoute() {
    try {
      setLoading(true)
      const supabase = getSupabase()

      // 1. Get Clerk user email
      const clerkUser = await fetch('/api/clerk/user').then(r => r.json())
      if (!clerkUser || !clerkUser.email) {
        throw new Error('فشل الحصول على بيانات المستخدم من Clerk')
      }

      // 2. Query users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, tenant_id, role, status')
        .eq('id', userId)
        .single()

      if (userError && userError.code === 'PGRST116') {
        // User doesn't exist yet - create it
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{
            id: userId,
            email: clerkUser.email.toLowerCase().trim(),
            role: 'company_member',
            status: 'active'
            // tenant_id NULL until onboarding
          }])
          .select('id, email, tenant_id')
          .single()

        if (createError || !newUser) {
          throw new Error('فشل إنشاء ملف المستخدم')
        }

        // New user - no tenant yet
        navigate('/company-onboarding')
        return
      }

      if (userError || !userData) {
        throw new Error('فشل البحث عن المستخدم')
      }

      // 3. If no tenant, go to onboarding
      if (!userData.tenant_id) {
        navigate('/company-onboarding')
        return
      }

      // 4. User has tenant - check company status
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('company_id')
        .eq('id', userData.tenant_id)
        .single()

      if (tenantError || !tenantData) {
        throw new Error('فشل البحث عن بيانات الشركة')
      }

      // 5. If no company, go to onboarding
      if (!tenantData.company_id) {
        navigate('/company-onboarding')
        return
      }

      // 6. Check company status
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
    } finally {
      setLoading(false)
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
