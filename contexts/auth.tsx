'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, AuthContext as IAuthContext } from '@/types'

const AuthContext = createContext<IAuthContext | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (token) {
          // In a real app, verify the token with backend
          const userStr = localStorage.getItem('user')
          if (userStr) {
            setUser(JSON.parse(userStr))
          }
        }
      } catch (error) {
        console.error('Auth check error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      // Mock login - replace with actual API call
      const mockUser: User = {
        id: '1',
        name: 'مستخدم',
        email,
        role: 'user',
        joinDate: new Date().toISOString(),
        status: 'active',
      }

      localStorage.setItem('auth_token', 'token-' + Date.now())
      localStorage.setItem('user', JSON.stringify(mockUser))
      setUser(mockUser)
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (data: any) => {
    setIsLoading(true)
    try {
      // Mock register - replace with actual API call
      const mockUser: User = {
        id: '1',
        name: data.fullName,
        email: data.email,
        role: 'user',
        joinDate: new Date().toISOString(),
        status: 'active',
      }

      localStorage.setItem('auth_token', 'token-' + Date.now())
      localStorage.setItem('user', JSON.stringify(mockUser))
      setUser(mockUser)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const value: IAuthContext = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return context
}
