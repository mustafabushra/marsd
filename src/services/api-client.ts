/**
 * Marsad API Client
 * Production-ready HTTP client with retry logic, error handling, and token management
 *
 * Usage:
 * ```typescript
 * import { apiClient } from '@/services/api-client'
 *
 * // Login
 * const auth = await apiClient.auth.login({ email: 'user@example.com', password: 'pass' })
 *
 * // Search companies
 * const results = await apiClient.companies.search({ q: 'سابك', page: 1 })
 *
 * // Submit report
 * const report = await apiClient.reports.create({
 *   targetCompanyId: 'comp_123',
 *   dealAmountRange: '10000-50000',
 *   paymentCommitment: '30',
 *   delayDays: 5,
 *   defaulted: false,
 *   dealtAt: new Date()
 * })
 * ```
 */

import type {
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
  AuthUser,
  Company,
  CompanyReport,
  CompanySearchParams,
  CompanySearchResult,
  AddCompanyRequest,
  CreateReportRequest,
  Report,
  ReportListResult,
  TrustScore,
  AdminUser,
  AuditLog,
  BusinessRequest,
  PaginationParams,
  ApiError,
  ApiResponse,
  ApiListResponse,
  PaginatedResponse,
  UploadDocumentRequest,
  UploadDocumentResponse,
  BatchApproveRequest,
  BatchApproveResponse,
  BulkImportRequest,
  BulkImportResponse,
  RequestOptions,
} from '@/types/api-responses'

interface ApiClientConfig {
  baseUrl: string
  timeout?: number
  retryConfig?: {
    maxRetries: number
    backoffMultiplier: number
    initialDelay: number
  }
}

interface RetryConfig {
  maxRetries: number
  backoffMultiplier: number
  initialDelay: number
}

class ApiClient {
  private baseUrl: string
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private timeout: number = 30000
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
  }
  private isRefreshing: boolean = false
  private refreshSubscribers: Array<(token: string) => void> = []

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl
    if (config.timeout) this.timeout = config.timeout
    if (config.retryConfig) this.retryConfig = config.retryConfig
    this.loadTokens()
  }

  // ========================================================================
  // TOKEN MANAGEMENT
  // ========================================================================

  private loadTokens(): void {
    try {
      const accessToken = localStorage.getItem('accessToken')
      const refreshToken = localStorage.getItem('refreshToken')
      if (accessToken) this.accessToken = accessToken
      if (refreshToken) this.refreshToken = refreshToken
    } catch (e) {
      console.warn('Failed to load tokens from localStorage')
    }
  }

  private saveTokens(accessToken: string, refreshToken: string): void {
    try {
      this.accessToken = accessToken
      this.refreshToken = refreshToken
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
    } catch (e) {
      console.warn('Failed to save tokens to localStorage')
    }
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.saveTokens(accessToken, refreshToken)
  }

  clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null
    try {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    } catch (e) {
      console.warn('Failed to clear tokens')
    }
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  // ========================================================================
  // HTTP METHODS
  // ========================================================================

  private async request<T = any>(
    method: string,
    endpoint: string,
    options?: Partial<RequestOptions>
  ): Promise<T> {
    let attempt = 0
    const maxRetries = options?.retry?.maxRetries ?? this.retryConfig.maxRetries

    while (attempt <= maxRetries) {
      try {
        return await this.makeRequest<T>(method, endpoint, options)
      } catch (error) {
        const apiError = error as ApiError

        // Check if retryable
        if (!this.isRetryable(apiError) || attempt >= maxRetries) {
          throw error
        }

        // Check for token expiration and refresh
        if (apiError.errorCode === 'ERR_4102' && this.refreshToken) {
          await this.refreshAccessToken()
          attempt++
          continue
        }

        // Exponential backoff
        const delay =
          this.retryConfig.initialDelay *
          Math.pow(this.retryConfig.backoffMultiplier, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        attempt++
      }
    }

    throw new Error('Max retries exceeded')
  }

  private async makeRequest<T = any>(
    method: string,
    endpoint: string,
    options?: Partial<RequestOptions>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    // Add query parameters
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    }

    // Add authorization header
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout ?? this.timeout
    )

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const error: ApiError = {
          statusCode: response.status,
          errorCode: data.errorCode || 'ERR_5000',
          message: data.message || 'An error occurred',
          details: data.details,
          timestamp: new Date(),
          path: endpoint,
        }
        throw error
      }

      return data as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private isRetryable(error: ApiError): boolean {
    const retryableCodes = [
      'ERR_4102', // Token expired
      'ERR_4401', // Rate limit
      'ERR_4402', // Throttled
      'ERR_4403', // Too many requests
      'ERR_5000', // Server error
      'ERR_5001', // Database error
      'ERR_5004', // Timeout
      'ERR_5005', // Service unavailable
    ]
    return retryableCodes.includes(error.errorCode)
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.isRefreshing) {
      return new Promise(resolve => {
        this.refreshSubscribers.push(() => {
          resolve()
        })
      })
    }

    this.isRefreshing = true

    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available')
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.refreshToken}`,
        },
        credentials: 'include',
      })

      if (!response.ok) {
        this.clearTokens()
        throw new Error('Token refresh failed')
      }

      const data = (await response.json()) as AuthResponse
      this.saveTokens(data.accessToken, data.refreshToken)

      // Notify waiting requests
      this.refreshSubscribers.forEach(callback =>
        callback(data.accessToken)
      )
      this.refreshSubscribers = []
    } catch (error) {
      this.clearTokens()
      throw error
    } finally {
      this.isRefreshing = false
    }
  }

  // ========================================================================
  // AUTHENTICATION ENDPOINTS
  // ========================================================================

  auth = {
    register: async (credentials: RegisterCredentials): Promise<AuthUser> => {
      return this.request<AuthUser>('POST', '/auth/register', {
        body: credentials,
      })
    },

    login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
      const response = await this.request<AuthResponse>('POST', '/auth/login', {
        body: credentials,
      })
      this.saveTokens(response.accessToken, response.refreshToken)
      return response
    },

    logout: async (): Promise<void> => {
      this.clearTokens()
    },

    refresh: async (): Promise<AuthResponse> => {
      return this.request<AuthResponse>('POST', '/auth/refresh')
    },

    forgotPassword: async (email: string): Promise<{ message: string }> => {
      return this.request('POST', '/auth/forgot-password', {
        body: { email },
      })
    },
  }

  // ========================================================================
  // COMPANY ENDPOINTS
  // ========================================================================

  companies = {
    search: async (
      params: CompanySearchParams
    ): Promise<CompanySearchResult> => {
      return this.request<CompanySearchResult>('GET', '/companies/search', {
        params: {
          q: params.q,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
        },
      })
    },

    getReport: async (companyId: string): Promise<CompanyReport> => {
      return this.request<CompanyReport>('GET', `/companies/${companyId}/report`)
    },

    requestAdd: async (data: AddCompanyRequest): Promise<any> => {
      return this.request('POST', '/companies/request-add', { body: data })
    },

    claimProfile: async (companyId: string): Promise<any> => {
      return this.request(
        'POST',
        `/companies/claim-profile/${companyId}`
      )
    },
  }

  // ========================================================================
  // REPORT ENDPOINTS
  // ========================================================================

  reports = {
    create: async (data: CreateReportRequest): Promise<Report> => {
      return this.request<Report>('POST', '/reports', { body: data })
    },

    getMyReports: async (
      params?: PaginationParams
    ): Promise<ReportListResult> => {
      return this.request<ReportListResult>('GET', '/reports/mine', {
        params,
      })
    },

    getReviewQueue: async (
      params?: PaginationParams
    ): Promise<ReportListResult> => {
      return this.request<ReportListResult>(
        'GET',
        '/reports/review-queue',
        { params }
      )
    },

    approve: async (reportId: string): Promise<Report> => {
      return this.request<Report>('POST', `/reports/${reportId}/approve`)
    },

    reject: async (
      reportId: string,
      reason: string
    ): Promise<Report> => {
      return this.request<Report>('POST', `/reports/${reportId}/reject`, {
        body: { reason },
      })
    },

    requestInfo: async (
      reportId: string,
      reason: string
    ): Promise<Report> => {
      return this.request<Report>(
        'POST',
        `/reports/${reportId}/request-info`,
        { body: { reason } }
      )
    },

    uploadDocument: async (
      reportId: string,
      data: UploadDocumentRequest
    ): Promise<UploadDocumentResponse> => {
      return this.request<UploadDocumentResponse>(
        'POST',
        `/reports/${reportId}/upload-document`,
        { body: data }
      )
    },
  }

  // ========================================================================
  // TRUST SCORE ENDPOINTS
  // ========================================================================

  trustScore = {
    get: async (companyId: string): Promise<TrustScore> => {
      return this.request<TrustScore>(
        'GET',
        `/trust-score/${companyId}`
      )
    },
  }

  // ========================================================================
  // ADMIN ENDPOINTS
  // ========================================================================

  admin = {
    getPendingReports: async (
      params?: PaginationParams
    ): Promise<ReportListResult> => {
      return this.request<ReportListResult>(
        'GET',
        '/admin/reports',
        { params }
      )
    },

    getAllReports: async (
      params?: PaginationParams & { status?: string }
    ): Promise<ReportListResult> => {
      return this.request<ReportListResult>(
        'GET',
        '/admin/reports/all',
        { params }
      )
    },

    approveReport: async (reportId: string): Promise<Report> => {
      return this.request<Report>(
        'PATCH',
        `/admin/reports/${reportId}/approve`
      )
    },

    rejectReport: async (
      reportId: string,
      reason: string
    ): Promise<Report> => {
      return this.request<Report>(
        'POST',
        `/admin/reports/${reportId}/reject`,
        { body: { reason } }
      )
    },

    batchApproveReports: async (
      reportIds: string[]
    ): Promise<BatchApproveResponse> => {
      return this.request<BatchApproveResponse>(
        'POST',
        '/admin/reports/batch-approve',
        { body: { reportIds } }
      )
    },

    getCompanies: async (
      params?: PaginationParams & { status?: string }
    ): Promise<PaginatedResponse<Company>> => {
      return this.request<PaginatedResponse<Company>>(
        'GET',
        '/admin/companies',
        { params }
      )
    },

    approveCompany: async (companyId: string): Promise<Company> => {
      return this.request<Company>(
        'POST',
        `/admin/companies/${companyId}/approve`
      )
    },

    rejectCompany: async (
      companyId: string,
      reason: string
    ): Promise<any> => {
      return this.request(
        'POST',
        `/admin/companies/${companyId}/reject`,
        { body: { reason } }
      )
    },

    getUsers: async (
      params?: PaginationParams & { role?: string }
    ): Promise<PaginatedResponse<AdminUser>> => {
      return this.request<PaginatedResponse<AdminUser>>(
        'GET',
        '/admin/users',
        { params }
      )
    },

    updateUserStatus: async (
      userId: string,
      status: string
    ): Promise<AdminUser> => {
      return this.request<AdminUser>('PATCH', `/admin/users/${userId}/status`, {
        body: { status },
      })
    },

    getAuditLogs: async (
      params?: PaginationParams & {
        action?: string
        entity?: string
        startDate?: string
        endDate?: string
      }
    ): Promise<PaginatedResponse<AuditLog>> => {
      return this.request<PaginatedResponse<AuditLog>>(
        'GET',
        '/admin/audit-logs',
        { params }
      )
    },

    getBusinessRequests: async (
      params?: PaginationParams & { status?: string }
    ): Promise<PaginatedResponse<BusinessRequest>> => {
      return this.request<PaginatedResponse<BusinessRequest>>(
        'GET',
        '/admin/requests',
        { params }
      )
    },

    approveBusinessRequest: async (
      requestId: string
    ): Promise<BusinessRequest> => {
      return this.request<BusinessRequest>(
        'POST',
        `/admin/requests/${requestId}/approve`
      )
    },

    rejectBusinessRequest: async (
      requestId: string,
      reason: string
    ): Promise<BusinessRequest> => {
      return this.request<BusinessRequest>(
        'POST',
        `/admin/requests/${requestId}/reject`,
        { body: { reason } }
      )
    },

    bulkImportCompanies: async (
      data: BulkImportRequest
    ): Promise<BulkImportResponse> => {
      return this.request<BulkImportResponse>(
        'POST',
        '/admin/bulk-upload',
        { body: data }
      )
    },
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const apiClient = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryConfig: {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
  },
})

export { apiClient, ApiClient }
export type { ApiClientConfig }
