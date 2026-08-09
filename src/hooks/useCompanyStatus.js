import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRecord } from './useUserRecord'
import { COMPANY_STATUS } from '../lib/constants'

/**
 * Hook: Resolve company status from database (source of truth)
 *
 * Follows strict sequence:
 * 1. Get Clerk user ID
 * 2. Query users table → tenant_id
 * 3. Query tenants table → company_id
 * 4. Query companies table → status
 *
 * Returns: { status, companyId, tenantId, loading, error }
 * Status values: null (no company), pending, approved, rejected, suspended
 */
export function useCompanyStatus() {
  const { tenantId: sharedTenantId, loading: recordLoading } = useUserRecord()
  const { user } = useUser()
  const [status, setStatus] = useState(null)
  const [companyId, setCompanyId] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [companyName, setCompanyName] = useState(null)
  const [rejectionReason, setRejectionReason] = useState(null)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    // The user's row comes from the shared record rather than a fourth query
    // for it. This hook runs on the login path, behind useUserRole and
    // useCompanyOnboarding, and all three were fetching the same row of the
    // same table one after another — the wait after signing in was that queue,
    // not any single slow request.
    if (recordLoading) return

    /**
     * One question, answered where the facts are.
     *
     * This walked three tables in the browser — the user's row, the tenant, the
     * company — and assembled a status from them. Any one of the three coming
     * back null read as «no company yet», which is how a half-finished
     * registration became «start over».
     *
     * Reported: register a company, see «تحت المراجعة», sign out, sign in, and
     * land back on the form. The account had a company and no tenant, because
     * onboarding wrote four rows as four separate requests and one of them did
     * not land — and the assembled answer could not tell that apart from having
     * registered nothing.
     *
     * `my_registration_state()` decides it in the database, in one call, and
     * returns a state rather than a status: `none`, `pending_review`,
     * `approved`, `rejected`, `suspended`, `staff`.
     */
    const resolveCompanyStatus = async () => {
      try {
        setLoading(true)
        const { data, error: e } = await getSupabase().rpc('my_registration_state')
        if (e) throw e

        const row = Array.isArray(data) ? data[0] : data
        if (!row) throw new Error('تعذّر قراءة حالة الحساب')

        setCompanyId(row.company_id || null)
        setTenantId(row.tenant_id || null)
        setCompanyName(row.company_name || null)
        setRejectionReason(row.rejection_reason || null)

        // Mapped to the vocabulary the router already speaks, so nothing
        // downstream has to learn a second one. `staff` and `anonymous` both
        // resolve to null — neither is a company waiting on anything, and the
        // router lets both through.
        setStatus(
          row.state === 'pending_review' ? COMPANY_STATUS.PENDING
            : row.state === 'approved' ? COMPANY_STATUS.ACTIVE
              : row.state === 'rejected' ? COMPANY_STATUS.REJECTED
                : row.state === 'suspended' ? COMPANY_STATUS.SUSPENDED
                  : null,
        )
        setError(null)
      } catch (err) {
        setError(err.message || 'تعذّر قراءة حالة الحساب')
        setStatus(null)
      } finally {
        setLoading(false)
      }
    }

    resolveCompanyStatus()
  }, [user?.id, sharedTenantId, recordLoading])

  return {
    status,      // null | pending | approved | rejected | suspended
    companyId,
    tenantId,
    companyName,
    rejectionReason,
    loading,
    error
  }
}
