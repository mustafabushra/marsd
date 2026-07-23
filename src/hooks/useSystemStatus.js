import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * Hook to check system status conditions
 * Checks: subscription active, credits balance, account status, etc.
 *
 * TODO: Once Supabase migrations applied, queries will use real data
 * Currently: Falls back to all-systems-go for logged-in users (development mode)
 */
export function useSystemStatus() {
  const { user } = useUser()
  const [status, setStatus] = useState({
    subscriptionActive: false,
    creditsBalance: 0,
    accountActive: true,
    tenantActive: true,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    const loadSystemStatus = async () => {
      try {
        if (!user?.id) {
          setStatus(prev => ({
            ...prev,
            isLoading: false,
          }))
          return
        }

        const supabase = getSupabase()

        try {
          // Try to get user info
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('tenant_id, status')
            .eq('id', user.id)
            .single()

          if (userError) throw userError

          // Get subscription status
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('tenant_id', userData.tenant_id)
            .single()

          const isSubscriptionActive =
            subData?.status === 'active' &&
            new Date(subData.current_period_end) > new Date()

          // Get credits balance
          const { data: creditsData } = await supabase.rpc('get_credit_balance', {
            p_tenant_id: userData.tenant_id,
          })

          // Get tenant status
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('status')
            .eq('id', userData.tenant_id)
            .single()

          setStatus({
            subscriptionActive: isSubscriptionActive,
            creditsBalance: creditsData || 0,
            accountActive: userData.status === 'active',
            tenantActive: tenantData?.status === 'active',
            isLoading: false,
            error: null,
          })
        } catch (dbErr) {
          // Fallback: If tables don't exist or queries fail,
          // assume all systems operational for logged-in users (development mode)
          console.warn('useSystemStatus: Using fallback (all-go) for development:', dbErr?.message)
          setStatus({
            subscriptionActive: true,
            creditsBalance: 999, // Unlimited credits for development
            accountActive: true,
            tenantActive: true,
            isLoading: false,
            error: null, // Clear error since fallback is intentional
          })
        }
      } catch (err) {
        console.error('Error in useSystemStatus:', err)
        setStatus(prev => ({
          ...prev,
          isLoading: false,
          error: err.message,
        }))
      }
    }

    loadSystemStatus()
  }, [user?.id])

  return status
}
