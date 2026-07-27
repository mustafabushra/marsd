import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRole } from './useUserRole'

/**
 * Whether the things a company needs in order to act are in order: its
 * subscription, its account, its tenant, and its credit balance.
 *
 * Two problems, and the second was hiding the first.
 *
 * Marsad's own staff have no tenant. Every query here is keyed on one, so all of
 * them failed for an administrator — and the catch block answered by granting
 * everything: subscriptionActive true, creditsBalance 999, "assume all systems
 * operational for logged-in users (development mode)". So an administrator did
 * have full access, by accident, through an error path, in production.
 *
 * That fallback is the real defect. It grants on failure, which means a network
 * blip, a policy change or a renamed column hands every signed-in user unlimited
 * credits and an active subscription. A check that cannot establish an answer
 * must not invent a permissive one — the same rule useUserRole follows when it
 * returns null rather than falling back to a role.
 *
 * Staff are now exempt by design rather than by accident, and a failure is a
 * failure.
 */
export function useSystemStatus() {
  const { user } = useUser()
  const { isPlatformAdmin, role, loading: roleLoading } = useUserRole()

  const [status, setStatus] = useState({
    subscriptionActive: false,
    creditsBalance: 0,
    accountActive: true,
    tenantActive: true,
    isPlatform: false,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    if (roleLoading) return

    const load = async () => {
      if (!user?.id) {
        setStatus((prev) => ({ ...prev, isLoading: false }))
        return
      }

      // Marsad staff are not a customer. There is no subscription to be expired,
      // no tenant to be suspended, and no balance to run out — the gates these
      // values feed exist to price and limit a customer's usage.
      if (isPlatformAdmin || role === 'reviewer') {
        setStatus({
          subscriptionActive: true,
          creditsBalance: Infinity,
          accountActive: true,
          tenantActive: true,
          isPlatform: true,
          isLoading: false,
          error: null,
        })
        return
      }

      try {
        const supabase = getSupabase()

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id, status')
          .eq('id', user.id)
          .maybeSingle()
        if (userError) throw userError

        // A signed-in account with no tenant is not an error and not a customer
        // in good standing either. It gets nothing, and says so.
        if (!userData?.tenant_id) {
          setStatus({
            subscriptionActive: false,
            creditsBalance: 0,
            accountActive: userData?.status === 'active',
            tenantActive: false,
            isPlatform: false,
            isLoading: false,
            error: null,
          })
          return
        }

        const [{ data: subData }, { data: creditsData }, { data: tenantData }] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('tenant_id', userData.tenant_id)
            .maybeSingle(),
          supabase.rpc('get_credit_balance', { p_tenant_id: userData.tenant_id }),
          supabase.from('tenants').select('status').eq('id', userData.tenant_id).maybeSingle(),
        ])

        setStatus({
          subscriptionActive:
            subData?.status === 'active' &&
            (!subData.current_period_end || new Date(subData.current_period_end) > new Date()),
          creditsBalance: Number(creditsData) || 0,
          accountActive: userData.status === 'active',
          tenantActive: tenantData?.status === 'active',
          isPlatform: false,
          isLoading: false,
          error: null,
        })
      } catch (err) {
        // Closed, not open. The previous version granted a subscription and 999
        // credits here.
        console.error('useSystemStatus failed:', err)
        setStatus({
          subscriptionActive: false,
          creditsBalance: 0,
          accountActive: false,
          tenantActive: false,
          isPlatform: false,
          isLoading: false,
          error: err.message || 'تعذّر التحقق من حالة الحساب',
        })
      }
    }

    load()
  }, [user?.id, isPlatformAdmin, role, roleLoading])

  return { ...status, isLoading: status.isLoading || roleLoading }
}
