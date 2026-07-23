import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * Hook to get user's role from database
 * Returns: owner | admin | manager | viewer | null
 *
 * TODO: Once Supabase migrations applied, queries will use real data
 * Currently: Falls back to 'owner' for logged-in users (development mode)
 */
export function useUserRole() {
  const { user } = useUser()
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadUserRole = async () => {
      try {
        if (!user?.id) {
          setRole(null)
          setLoading(false)
          return
        }

        const supabase = getSupabase()

        try {
          // Try to get user's role from database
          const { data, error: dbError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

          if (dbError) {
            throw dbError
          }

          setRole(data?.role || 'viewer')
          setError(null)
        } catch (dbErr) {
          // Fallback: If users table doesn't exist or query fails,
          // assign 'owner' role for logged-in users (development mode)
          // This allows testing without Supabase migrations
          console.warn('useUserRole: Using fallback (owner) for development:', dbErr?.message)
          setRole('owner')
          setError(null) // Clear error since fallback is intentional
        }
      } catch (err) {
        console.error('Error in useUserRole:', err)
        setError(err.message)
        setRole('owner') // Fallback
      } finally {
        setLoading(false)
      }
    }

    loadUserRole()
  }, [user?.id])

  return { role, loading, error }
}
