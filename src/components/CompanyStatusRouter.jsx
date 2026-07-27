import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompanyStatus } from '../hooks/useCompanyStatus'
import { useUserRole } from '../hooks/useUserRole'
import { COMPANY_STATUS } from '../lib/constants'

/**
 * Routes a company user according to their company's status.
 *
 * It also routed Marsad's own staff, who have no company and never will. A
 * platform administrator resolves to status null, which this read as "new user
 * with no company yet" and answered by redirecting to company onboarding — so
 * opening a trust report as an administrator landed on a sign-up form for a
 * company account. The page an operator most needs to see whole was the one
 * they could not reach at all.
 *
 * The absence of a company means two different things and only one of them is a
 * new customer. Marsad staff pass through: there is no onboarding for them to
 * do, and no company status to be blocked by.
 */
export default function CompanyStatusRouter({ children }) {
  const navigate = useNavigate()
  const { status, loading, error } = useCompanyStatus()
  const { isPlatformAdmin, role, loading: roleLoading } = useUserRole()

  // A reviewer works for Marsad too and has no company either.
  const isStaff = isPlatformAdmin || role === 'reviewer'

  useEffect(() => {
    if (loading || roleLoading) return
    if (isStaff) return

    if (status === null) {
      navigate('/company-onboarding', { replace: true })
    } else if (status === COMPANY_STATUS.PENDING) {
      navigate('/account-pending', { replace: true })
    } else if (status === COMPANY_STATUS.REJECTED) {
      navigate('/account-rejected', { replace: true })
    } else if (status === COMPANY_STATUS.SUSPENDED) {
      navigate('/account-suspended', { replace: true })
    } else if (status === COMPANY_STATUS.APPROVED || status === COMPANY_STATUS.ACTIVE) {
      return
    } else {
      console.warn(`⚠️ Unknown company status: ${status}`)
      navigate('/account-pending', { replace: true })
    }
  }, [status, loading, roleLoading, isStaff, navigate])

  // Waiting on the role as well as the status: deciding on the status alone
  // redirects staff for the moment before the role arrives, and a replace()
  // cannot be taken back.
  if (loading || roleLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '16px', color: '#64748B', background: '#F8FAFC' }}>
        🔍 جاري التحقق من حالة الشركة...
      </div>
    )
  }

  if (isStaff) return children

  return (status === COMPANY_STATUS.APPROVED || status === COMPANY_STATUS.ACTIVE) ? children : null
}
