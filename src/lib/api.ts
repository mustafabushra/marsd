/**
 * API Client — يربط React مع Backend
 * يستخدم Mock Server محلياً للتطوير
 *
 * Updated: Mock Server Integration
 * - Local development with mock data
 * - No external API dependency
 */

import { mockAPI } from '../api/mockServer'

// ============================================================================
// API CONFIGURATION
// ============================================================================

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const USE_MOCK_API = true // استخدم Mock API للتطوير

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

const TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_KEY = 'user'
const TOKEN_EXPIRY_KEY = 'tokenExpiry'

/**
 * Decodes JWT token payload (without verification)
 * Used client-side for expiration checking
 */
function decodeToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const decoded = JSON.parse(atob(parts[1]))
    return decoded
  } catch {
    return null
  }
}

/**
 * Checks if token is expired
 */
function isTokenExpired(token: string | null): boolean {
  if (!token) return true

  const decoded = decodeToken(token)
  if (!decoded || !decoded.exp) return true

  // If exp is in seconds (JWT standard), convert to milliseconds
  const expiryTime = decoded.exp * 1000
  const currentTime = Date.now()

  // Consider token expired if less than 1 minute remaining
  return expiryTime - currentTime < 60000
}

/**
 * Get token from localStorage
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Set token in localStorage
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)

  // Calculate and store expiry time
  const decoded = decodeToken(token)
  if (decoded && decoded.exp) {
    localStorage.setItem(TOKEN_EXPIRY_KEY, decoded.exp.toString())
  }
}

/**
 * Set refresh token
 */
export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

/**
 * Get refresh token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/**
 * Clear all auth data from localStorage
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
}

/**
 * Store user data
 */
export function setUser(user: Record<string, any>): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * Get user data from localStorage
 */
export function getUser(): Record<string, any> | null {
  try {
    const userStr = localStorage.getItem(USER_KEY)
    return userStr ? JSON.parse(userStr) : null
  } catch {
    return null
  }
}

/**
 * API Request wrapper with JWT interceptor
 * Automatically attaches Bearer token to all requests
 * Handles 401 errors
 */
async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken()

  // Add authorization header if token exists
  const headers = new Headers(options.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Content-Type', 'application/json')

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle 401 Unauthorized (token expired)
  if (response.status === 401) {
    clearAuth()
    // Trigger logout by dispatching custom event
    window.dispatchEvent(new Event('auth:logout'))
    throw new Error('Token expired. Please login again.')
  }

  return response
}

// ============================================================================
// MOCK DATA — من Smoke Test results
// ============================================================================

const mockTrustScores: Record<string, any> = {
  '1': { score: 94, riskBand: 'low', tier: 'full', approvedReports: 5 },
  '2': { score: 74, riskBand: 'low', tier: 'full', approvedReports: 5 },
  '3': { score: 52, riskBand: 'medium', tier: 'full', approvedReports: 5 },
  '4': { score: 78, riskBand: 'low', tier: 'full', approvedReports: 5 },
  '5': { score: 91, riskBand: 'low', tier: 'full', approvedReports: 5 },
}

const mockCompanies = [
  {
    id: '1',
    name: 'شركة نجد للمقاولات',
    crNumber: '1010123456',
    sector: 'مقاولات',
    city: 'الرياض',
    foundedYear: 2014,
    crStatus: 'active',
  },
  {
    id: '2',
    name: 'الرياض للتجارة',
    crNumber: '1010789456',
    sector: 'تجارة',
    city: 'الرياض',
    foundedYear: 2018,
    crStatus: 'active',
  },
  {
    id: '3',
    name: 'التقنية المتقدمة',
    crNumber: '1010456789',
    sector: 'تقنية',
    city: 'جدة',
    foundedYear: 2020,
    crStatus: 'active',
  },
  {
    id: '4',
    name: 'الشرق للتوريد',
    crNumber: '1010111222',
    sector: 'توريد',
    city: 'الدمام',
    foundedYear: 2016,
    crStatus: 'active',
  },
  {
    id: '5',
    name: 'الخليج للخدمات',
    crNumber: '1010333444',
    sector: 'خدمات',
    city: 'الرياض',
    foundedYear: 2012,
    crStatus: 'active',
  },
]

// ============================================================================
// AUTH API
// ============================================================================

/**
 * Login with email and password
 * Makes POST request to backend API
 * Stores tokens and user data in localStorage
 */
export async function login(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || 'فشل تسجيل الدخول')
    }

    const data = await response.json()

    // Store tokens and user
    if (data.accessToken) {
      setToken(data.accessToken)
    }
    if (data.refreshToken) {
      setRefreshToken(data.refreshToken)
    }
    if (data.user) {
      setUser(data.user)
    }

    return data
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('خطأ في الاتصال بالخادم')
  }
}

/**
 * Register new company account
 * Makes POST request to backend API
 * Stores tokens and user data in localStorage
 */
export async function register(data: any) {
  try {
    // Map form fields to API payload
    const payload = {
      company: data.company || data.name,
      commercialNumber: data.commercialNumber || data.crNumber,
      sector: data.sector,
      city: data.city,
      phone: data.phone,
      email: data.email,
      password: data.password,
    }

    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || 'فشل إنشاء الحساب')
    }

    const responseData = await response.json()

    // Store tokens and user
    if (responseData.accessToken) {
      setToken(responseData.accessToken)
    }
    if (responseData.refreshToken) {
      setRefreshToken(responseData.refreshToken)
    }
    if (responseData.tenant) {
      setUser(responseData.tenant)
    } else if (responseData.user) {
      setUser(responseData.user)
    }

    return responseData
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('خطأ في الاتصال بالخادم')
  }
}

// ============================================================================
// COMPANIES API
// ============================================================================

export async function searchCompanies(q: string, page = 1, limit = 20) {
  await new Promise(resolve => setTimeout(resolve, 300))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const filtered = mockCompanies.filter(
    c =>
      c.name.includes(q) ||
      c.crNumber.includes(q) ||
      c.sector.includes(q)
  )

  // Merge company data with trust scores
  const enrichedData = filtered.slice(0, limit).map(company => ({
    ...company,
    trust_score: mockTrustScores[company.id] || null,
  }))

  return {
    data: enrichedData,
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.ceil(filtered.length / limit),
    },
  }
}

export async function getCompanyReport(companyId: string, planName = 'احترافي') {
  await new Promise(resolve => setTimeout(resolve, 400))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const company = mockCompanies.find(c => c.id === companyId)
  if (!company) throw new Error('شركة غير موجودة')

  const trustScore = mockTrustScores[companyId]

  // Gating: Check if plan allows viewing
  if (planName === 'مجاني') {
    return {
      company,
      status: 'locked',
      message: 'المؤشر مقفل في الباقة المجانية',
      tier: 'none',
    }
  }

  return {
    company,
    trustScore,
    status: 'full',
    tier: 'full',
    approvedReports: trustScore.approvedReports,
  }
}

// ============================================================================
// REPORTS API
// ============================================================================

export async function submitReport(data: any) {
  await new Promise(resolve => setTimeout(resolve, 500))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  return {
    id: 'report-' + Math.random().toString(36).substring(7),
    status: 'pending_review',
    ...data,
    submittedAt: new Date(),
  }
}

export async function getMyReports() {
  await new Promise(resolve => setTimeout(resolve, 300))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  return {
    data: [
      {
        id: 'report-1',
        targetCompany: mockCompanies[0],
        status: 'approved',
        paymentCommitment: 'full',
        delayDays: 0,
        submittedAt: new Date('2026-07-10'),
      },
      {
        id: 'report-2',
        targetCompany: mockCompanies[1],
        status: 'pending_review',
        paymentCommitment: 'partial',
        delayDays: 15,
        submittedAt: new Date('2026-07-08'),
      },
    ],
  }
}

// ============================================================================
// WATCHLIST API
// ============================================================================

export async function addToWatchlist(companyId: string) {
  await new Promise(resolve => setTimeout(resolve, 300))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  return {
    id: 'watchlist-' + Math.random().toString(36).substring(7),
    companyId,
    createdAt: new Date(),
  }
}

export async function getWatchlist() {
  await new Promise(resolve => setTimeout(resolve, 300))

  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  return {
    data: [
      { ...mockCompanies[0], watchlistId: 'w-1' },
      { ...mockCompanies[2], watchlistId: 'w-2' },
    ],
  }
}

// ============================================================================
// ADMIN API - All endpoints require platform_admin role
// ============================================================================

export async function getAdminReports(page = 1, limit = 20) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(
    `/admin/reports?page=${page}&limit=${limit}`,
    {
      method: 'GET',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch reports: ${response.statusText}`)
  }

  return response.json()
}

export async function approveReport(reportId: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/reports/${reportId}/approve`, {
    method: 'PATCH',
  })

  if (!response.ok) {
    throw new Error(`Failed to approve report: ${response.statusText}`)
  }

  return response.json()
}

export async function rejectReport(reportId: string, reason?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/reports/${reportId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    throw new Error(`Failed to reject report: ${response.statusText}`)
  }

  return response.json()
}

export async function batchApproveReports(reportIds: string[]) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest('/admin/reports/batch-approve', {
    method: 'POST',
    body: JSON.stringify({ reportIds }),
  })

  if (!response.ok) {
    throw new Error(`Failed to batch approve reports: ${response.statusText}`)
  }

  return response.json()
}

export async function getAdminCompanies(page = 1, limit = 20, status?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const statusParam = status ? `&status=${status}` : ''
  const response = await apiRequest(
    `/admin/companies?page=${page}&limit=${limit}${statusParam}`,
    {
      method: 'GET',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch companies: ${response.statusText}`)
  }

  return response.json()
}

export async function approveCompany(companyId: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/companies/${companyId}/approve`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Failed to approve company: ${response.statusText}`)
  }

  return response.json()
}

export async function rejectCompany(companyId: string, reason?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/companies/${companyId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    throw new Error(`Failed to reject company: ${response.statusText}`)
  }

  return response.json()
}

export async function getAdminUsers(page = 1, limit = 20, role?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const roleParam = role ? `&role=${role}` : ''
  const response = await apiRequest(`/admin/users?page=${page}&limit=${limit}${roleParam}`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`)
  }

  return response.json()
}

export async function updateUserStatus(userId: string, status: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

  if (!response.ok) {
    throw new Error(`Failed to update user status: ${response.statusText}`)
  }

  return response.json()
}

export async function getAuditLogs(
  page = 1,
  limit = 20,
  action?: string,
  entity?: string,
  startDate?: string,
  endDate?: string
) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (action) params.append('action', action)
  if (entity) params.append('entity', entity)
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)

  const response = await apiRequest(`/admin/audit-logs?${params.toString()}`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch audit logs: ${response.statusText}`)
  }

  return response.json()
}

export async function getAdminRequests(page = 1, limit = 20, status?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const statusParam = status ? `&status=${status}` : ''
  const response = await apiRequest(
    `/admin/requests?page=${page}&limit=${limit}${statusParam}`,
    {
      method: 'GET',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch requests: ${response.statusText}`)
  }

  return response.json()
}

export async function approveBusinessRequest(requestId: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/requests/${requestId}/approve`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Failed to approve request: ${response.statusText}`)
  }

  return response.json()
}

export async function rejectBusinessRequest(requestId: string, reason?: string) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest(`/admin/requests/${requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    throw new Error(`Failed to reject request: ${response.statusText}`)
  }

  return response.json()
}

export async function bulkImportCompanies(companies: any[]) {
  const token = getToken()
  if (!token) throw new Error('Unauthorized: Please login')

  const response = await apiRequest('/admin/bulk-upload', {
    method: 'POST',
    body: JSON.stringify({ companies }),
  })

  if (!response.ok) {
    throw new Error(`Failed to bulk import companies: ${response.statusText}`)
  }

  return response.json()
}
