import { Navigate } from 'react-router-dom'

export function AdminRoute({ isLoggedIn, isAdmin, children }) {
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

export function CompanyRoute({ isLoggedIn, isAdmin, children }) {
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />
  }

  return children
}
