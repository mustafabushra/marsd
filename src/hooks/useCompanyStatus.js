import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRecord } from './useUserRecord'

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

    const resolveCompanyStatus = async () => {
      try {
        const supabase = getSupabase()

        const userData = { tenant_id: sharedTenantId }

        if (!userData.tenant_id) {
          // No tenant linked to this user — a new account, not a failure.
          setStatus(null)
          setLoading(false)
          return
        }

        setTenantId(userData.tenant_id)

        // STEP 2: Get tenant data and company_id
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('company_id')
          .eq('id', userData.tenant_id)
          .single()

        if (tenantError) {
          if (tenantError.code === 'PGRST116') {
            // Tenant not found
            setStatus(null)
            setLoading(false)
            return
          }
          throw tenantError
        }

        if (!tenantData?.company_id) {
          // No company linked to tenant
          setStatus(null)
          setLoading(false)
          return
        }

        setCompanyId(tenantData.company_id)

        // STEP 3: Get company status from companies table
        // This is the SOURCE OF TRUTH
        const { data: companyData, error: companyError } = await supabase
          .from('companies')
          .select('status')
          .eq('id', tenantData.company_id)
          .single()

        if (companyError) {
          if (companyError.code === 'PGRST116') {
            // Company not found
            setStatus(null)
            setLoading(false)
            return
          }
          throw companyError
        }

        // Set status from company table (DATABASE IS SOURCE OF TRUTH)
        setStatus(companyData.status)
        setError(null)
      } catch (err) {
        console.error('❌ Failed to resolve company status:', err)
        setError(err.message)
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
    loading,
    error
  }
}
