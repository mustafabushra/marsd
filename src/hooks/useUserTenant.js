import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * Hook: Get current user's tenant info from Supabase
 * Links Clerk authentication with Supabase business data
 *
 * Returns: { tenantId, crNumber, companyName, approvalStatus, loading, error }
 */
export function useUserTenant() {
  const { user } = useUser()
  const [tenantId, setTenantId] = useState(null)
  const [crNumber, setCrNumber] = useState(null)
  const [companyName, setCompanyName] = useState(null)
  const [approvalStatus, setApprovalStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    const fetchTenantInfo = async () => {
      try {
        const supabase = getSupabase()

        // Step 1: Get tenant_id from Supabase users table
        // Link: Clerk user ID → Supabase users.id
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (userError) {
          if (userError.code === 'PGRST116') {
            // User not found - new user
            setError(null)
            setLoading(false)
            return
          }
          throw userError
        }

        if (!userData?.tenant_id) {
          setError('No tenant found')
          setLoading(false)
          return
        }

        // Step 2: Get tenant info (company name, CR, approval status)
        // Link: tenant_id → Supabase tenants table
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('id, cr_number, name, approval_status')
          .eq('id', userData.tenant_id)
          .single()

        if (tenantError) throw tenantError

        // Set all tenant information
        setTenantId(tenantData.id)
        setCrNumber(tenantData.cr_number)
        setCompanyName(tenantData.name)
        setApprovalStatus(tenantData.approval_status)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch tenant info:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchTenantInfo()
  }, [user?.id])

  return {
    tenantId,
    crNumber,
    companyName,
    approvalStatus,
    loading,
    error
  }
}
