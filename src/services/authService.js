/**
 * Authentication Service
 * Handles user authentication, registration, and session management
 * Will be integrated with NestJS backend API
 */

export const authService = {
  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User object with token
   */
  login: async (email, password) => {
    // TODO: Replace with actual API call to NestJS backend
    // const response = await fetch('/api/auth/login', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password })
    // })
    // return response.json()

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          user: { id: 1, name: 'محمد علي', email },
          token: 'mock_token_' + Date.now()
        })
      }, 500)
    })
  },

  /**
   * Register new company account
   * @param {Object} data - Company registration data
   * @returns {Promise<Object>} Company object with token
   */
  register: async (data) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          company: { id: Date.now(), ...data },
          token: 'mock_token_' + Date.now()
        })
      }, 500)
    })
  },

  /**
   * Logout and clear session
   */
  logout: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
  },

  /**
   * Get current user session
   * @returns {Object|null} Current user or null
   */
  getCurrentUser: () => {
    const token = localStorage.getItem('auth_token')
    if (!token) return null
    // TODO: Decode JWT and validate
    return { id: localStorage.getItem('user_id') }
  },

  /**
   * Verify if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated: () => {
    return !!localStorage.getItem('auth_token')
  }
}
