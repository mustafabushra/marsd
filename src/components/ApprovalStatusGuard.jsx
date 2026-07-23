import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * ApprovalStatusGuard: Checks if user's account is approved before allowing access
 * Redirects to /account-pending if approval_status='pending_approval'
 */
export default function ApprovalStatusGuard({ children }) {
  const navigate = useNavigate()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    const checkApprovalStatus = async () => {
      try {
        const supabase = getSupabase()

        // Get user's tenant
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (userError || !userData?.tenant_id) {
          // No tenant = new user, redirect to company-onboarding
          navigate('/company-onboarding', { replace: true })
          return
        }

        // Get tenant approval status
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('approval_status')
          .eq('id', userData.tenant_id)
          .single()

        if (tenantError || !tenantData) {
          // No tenant found = error
          navigate('/company-onboarding', { replace: true })
          return
        }

        // Check approval status
        if (tenantData.approval_status === 'pending_approval') {
          // Redirect to pending page
          navigate('/account-pending', { replace: true })
          return
        }

        if (tenantData.approval_status === 'rejected') {
          // Redirect to rejected page
          navigate('/account-rejected', { replace: true })
          return
        }

        // Approved! Allow access
        setApproved(true)
      } catch (err) {
        console.error('Approval status check failed:', err)
        setApproved(true) // Allow access on error (better UX)
      } finally {
        setLoading(false)
      }
    }

    checkApprovalStatus()
  }, [user?.id, navigate])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: '16px',
          color: '#64748B'
        }}
      >
        🔍 جاري التحقق من حالة الحساب...
      </div>
    )
  }

  // Only render children if approved
  return approved ? children : null
}
