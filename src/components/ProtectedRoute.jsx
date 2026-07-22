import { Navigate } from 'react-router-dom'
import { useUser, useOrganization, useOrganizationList } from '@clerk/react'

export function AdminRoute({ isLoggedIn, isAdmin, children }) {
  const { isLoaded, user } = useUser()
  const { organization } = useOrganization()

  if (!isLoaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>جاري التحميل...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Check if user has admin role in any organization
  // For now, we'll check organization metadata or use a simpler approach
  const userRole = organization?.membership?.role
  const isAdminUser = userRole === 'admin' || user?.publicMetadata?.role === 'admin'

  if (!isAdminUser) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

export function CompanyRoute({ isLoggedIn, isAdmin, children }) {
  const { isLoaded, user } = useUser()
  const { organization } = useOrganization()

  if (!isLoaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>جاري التحميل...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Check if user is admin
  const userRole = organization?.membership?.role
  const isAdminUser = userRole === 'admin' || user?.publicMetadata?.role === 'admin'

  if (isAdminUser) {
    return <Navigate to="/admin" replace />
  }

  return children
}
