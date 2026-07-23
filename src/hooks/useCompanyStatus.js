import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

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

    const resolveCompanyStatus = async () => {
      try {
        const supabase = getSupabase()

        // STEP 1: Get user by Clerk ID
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (userError) {
          if (userError.code === 'PGRST116') {
            // User not found in Supabase = New user, no company
            setStatus(null)
            setLoading(false)
            return
          }
          throw userError
        }

        if (!userData?.tenant_id) {
          // No tenant linked to this user
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
  }, [user?.id])

  return {
    status,      // null | pending | approved | rejected | suspended
    companyId,
    tenantId,
    loading,
    error
  }
}
