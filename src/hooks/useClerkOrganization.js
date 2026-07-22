import { useOrganization, useUser } from '@clerk/react'

export function useClerkOrganization() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization()
  const { user, isLoaded: isUserLoaded } = useUser()

  const isAdmin = organization?.membership?.role === 'admin' || user?.publicMetadata?.role === 'admin'
  const organizationId = organization?.id
  const organizationName = organization?.name
  const userRole = organization?.membership?.role

  return {
    organization,
    organizationId,
    organizationName,
    userRole,
    isAdmin,
    isLoaded: isOrgLoaded && isUserLoaded,
    user
  }
}
