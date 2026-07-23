import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompanyStatus } from '../hooks/useCompanyStatus'

/**
 * CompanyStatusRouter: Route based on company.status (database source of truth)
 *
 * Sequence:
 * 1. Get Clerk user ID
 * 2. Query users → tenant_id
 * 3. Query tenants → company_id
 * 4. Query companies → status (SOURCE OF TRUTH)
 * 5. Route based on status
 */
export default function CompanyStatusRouter({ children }) {
  const navigate = useNavigate()
  const { status, loading, error } = useCompanyStatus()

  useEffect(() => {
    if (loading) return // Still checking database

    // Route based on company.status from database
    if (status === null) {
      // No company exists → User is new
      navigate('/company-onboarding', { replace: true })
    } else if (status === 'pending') {
      // Company pending admin approval
      navigate('/account-pending', { replace: true })
    } else if (status === 'rejected') {
      // Company was rejected by admin
      navigate('/account-rejected', { replace: true })
    } else if (status === 'suspended') {
      // Company account was suspended
      navigate('/account-suspended', { replace: true })
    } else if (status === 'approved') {
      // Company is approved → Allow access
      return // Render children (dashboard access)
    } else {
      // Unknown status → Safety redirect
      console.warn(`⚠️ Unknown company status: ${status}`)
      navigate('/account-pending', { replace: true })
    }
  }, [status, loading, navigate])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: '16px',
          color: '#64748B',
          background: '#F8FAFC'
        }}
      >
        🔍 جاري التحقق من حالة الشركة...
      </div>
    )
  }

  // Only render children if company is approved
  return status === 'approved' ? children : null
}
