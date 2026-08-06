import { Navigate } from 'react-router-dom'
import { useUser, useOrganization } from '@clerk/react'
import { useCompanyOnboarding } from '../hooks/useCompanyOnboarding'
import { useUserRole } from '../hooks/useUserRole'
import { SkeletonPage } from './Skeleton'
import DeferredSkeleton from './DeferredSkeleton'

/**
 * Admin screens, gated on the role the database enforces.
 *
 * This asked Clerk — organization membership, or publicMetadata.role ===
 * 'admin' — while every policy behind those screens checks users.role ===
 * 'platform_admin'. Two switches for one permission, kept in step by hand:
 * an operator marked in Clerk but not in the database reaches the panel and
 * every save is silently refused, and one marked only in the database can write
 * but cannot get to the screens. Only the database enforces anything, so the
 * gate reads the same value the policies do.
 */
export function AdminRoute({ children }) {
  const { isLoaded, user } = useUser()
  const { loading: roleLoading, isPlatformAdmin } = useUserRole()

  if (!isLoaded || roleLoading) {
    return <DeferredSkeleton><div style={{ padding: '28px 32px' }}><SkeletonPage stats={0} panels={2} /></div></DeferredSkeleton>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

export function CompanyRoute({ children }) {
  const { isLoaded, user } = useUser()
  const { needsOnboarding, loading: onboardingLoading } = useCompanyOnboarding()
  const { isPlatformAdmin, role, loading: roleLoading } = useUserRole()

  // Marsad staff have no company and never will, so "no tenant" means something
  // different for them than for a customer who has not finished signing up.
  // Reading it the same way sent an administrator opening a trust report to a
  // company sign-up form.
  const isStaff = isPlatformAdmin || role === 'reviewer'

  if (!isLoaded || onboardingLoading || roleLoading) {
    return <DeferredSkeleton><div style={{ padding: '28px 32px' }}><SkeletonPage stats={0} panels={2} /></div></DeferredSkeleton>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Check if user needs to complete onboarding (old users without tenant)
  if (needsOnboarding && !isStaff) {
    return <Navigate to="/company-onboarding" replace />
  }

  // A platform administrator is no longer bounced to /admin from here. One
  // account may hold both jobs — running Marsad and belonging to a company on
  // it — and redirecting made the company screens unreachable for whoever does.
  // The admin panel is a destination, not somewhere to be sent from every
  // company page.
  return children
}
