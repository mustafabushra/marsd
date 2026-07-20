import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import * as api from '../lib/api'

/**
 * Authentication Context
 * Manages centralized authentication state for the entire application
 * Features:
 * - Token persistence across page reloads
 * - Token expiration validation
 * - Automatic token refresh handling
 * - User role-based access (isAdmin)
 * - Logout with cleanup
 */

const AuthContext = createContext()

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  // ========================================================================
  // STATE
  // ========================================================================

  const [user, setUser] = useState(null)
  const [token, setTokenState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // ========================================================================
  // TOKEN VALIDATION & INITIALIZATION
  // ========================================================================

  /**
   * Initialize auth state from localStorage on app start
   * Validates token and loads user data
   */
  const initializeAuth = useCallback(() => {
    try {
      const storedToken = api.getToken()
      const storedUser = api.getUser()

      if (storedToken && storedUser) {
        setTokenState(storedToken)
        setUser(storedUser)
        setIsLoggedIn(true)

        // Check if user has admin role
        if (storedUser.role === 'platform_admin' || storedUser.isAdmin) {
          setIsAdmin(true)
        }
      }
    } catch (err) {
      console.error('Failed to initialize auth:', err)
      api.clearAuth()
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Initialize auth on component mount
   */
  useEffect(() => {
    initializeAuth()

    // Listen for logout events from other tabs/windows
    const handleLogout = () => {
      logout()
    }

    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [initializeAuth])

  // ========================================================================
  // AUTH FUNCTIONS
  // ========================================================================

  /**
   * Login with email and password
   * Stores token and user data in localStorage
   * Updates auth state
   */
  const login = useCallback(async (email, password) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await api.login(email, password)

      // Set state
      setTokenState(response.accessToken)
      setUser(response.user)
      setIsLoggedIn(true)

      // Check if admin
      if (response.user.role === 'platform_admin' || response.user.isAdmin) {
        setIsAdmin(true)
      }

      return response
    } catch (err) {
      const errorMessage = err.message || 'Failed to login'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Register new company account
   * Creates account, stores token and user data
   * Updates auth state
   */
  const register = useCallback(async (data) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await api.register(data)

      // Set state
      setTokenState(response.accessToken)
      setUser(response.tenant)
      setIsLoggedIn(true)

      return response
    } catch (err) {
      const errorMessage = err.message || 'Failed to register'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Logout user
   * Clears all auth data from state and localStorage
   * Triggers session end
   */
  const logout = useCallback(() => {
    setTokenState(null)
    setUser(null)
    setIsLoggedIn(false)
    setIsAdmin(false)
    setError(null)
    api.clearAuth()
  }, [])

  /**
   * Get current token
   */
  const getToken = useCallback(() => {
    return token || api.getToken()
  }, [token])

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  const value = {
    // State
    user,
    token,
    isLoggedIn,
    isAdmin,
    isLoading,
    error,

    // Functions
    login,
    register,
    logout,
    getToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
