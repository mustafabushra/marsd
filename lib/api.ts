import { API_BASE_URL, API_TIMEOUT } from './constants'

interface RequestOptions extends RequestInit {
  timeout?: number
}

class APIClient {
  private baseURL: string
  private timeout: number

  constructor(baseURL: string = API_BASE_URL, timeout: number = API_TIMEOUT) {
    this.baseURL = baseURL
    this.timeout = timeout
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    const timeout = options.timeout || this.timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  // Authentication APIs
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async register(data: {
    fullName: string
    email: string
    password: string
    companyName: string
  }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    })
  }

  async getCurrentUser() {
    return this.request('/auth/me', {
      method: 'GET',
    })
  }

  // Company APIs
  async getCompanies(params?: {
    page?: number
    limit?: number
    search?: string
    industry?: string
  }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.search) query.append('search', params.search)
    if (params?.industry) query.append('industry', params.industry)

    return this.request(`/companies?${query.toString()}`, {
      method: 'GET',
    })
  }

  async getCompany(id: string) {
    return this.request(`/companies/${id}`, {
      method: 'GET',
    })
  }

  async createCompany(data: any) {
    return this.request('/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCompany(id: string, data: any) {
    return this.request(`/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteCompany(id: string) {
    return this.request(`/companies/${id}`, {
      method: 'DELETE',
    })
  }

  async bulkImportCompanies(data: any) {
    return this.request('/companies/bulk-import', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Report APIs
  async getReports(params?: {
    page?: number
    limit?: number
    companyId?: string
    status?: string
  }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.companyId) query.append('companyId', params.companyId)
    if (params?.status) query.append('status', params.status)

    return this.request(`/reports?${query.toString()}`, {
      method: 'GET',
    })
  }

  async getReport(id: string) {
    return this.request(`/reports/${id}`, {
      method: 'GET',
    })
  }

  async createReport(data: any) {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateReport(id: string, data: any) {
    return this.request(`/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async approveReport(id: string) {
    return this.request(`/reports/${id}/approve`, {
      method: 'POST',
    })
  }

  async rejectReport(id: string) {
    return this.request(`/reports/${id}/reject`, {
      method: 'POST',
    })
  }

  // Watchlist APIs
  async getWatchlist() {
    return this.request('/watchlist', {
      method: 'GET',
    })
  }

  async addToWatchlist(companyId: string) {
    return this.request('/watchlist', {
      method: 'POST',
      body: JSON.stringify({ companyId }),
    })
  }

  async removeFromWatchlist(companyId: string) {
    return this.request(`/watchlist/${companyId}`, {
      method: 'DELETE',
    })
  }

  // Search APIs
  async searchCompanies(query: string, params?: any) {
    return this.request('/search', {
      method: 'GET',
      body: JSON.stringify({ query, ...params }),
    })
  }

  // Subscription APIs
  async getSubscriptionPlans() {
    return this.request('/subscriptions/plans', {
      method: 'GET',
    })
  }

  async getUserSubscription() {
    return this.request('/subscriptions/current', {
      method: 'GET',
    })
  }

  async upgradePlan(planId: string) {
    return this.request('/subscriptions/upgrade', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    })
  }

  // Admin APIs
  async getUsers(params?: { page?: number; limit?: number; role?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.role) query.append('role', params.role)

    return this.request(`/admin/users?${query.toString()}`, {
      method: 'GET',
    })
  }

  async suspendUser(userId: string) {
    return this.request(`/admin/users/${userId}/suspend`, {
      method: 'POST',
    })
  }

  async unsuspendUser(userId: string) {
    return this.request(`/admin/users/${userId}/unsuspend`, {
      method: 'POST',
    })
  }

  async getAuditLogs(params?: {
    page?: number
    limit?: number
    action?: string
  }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.action) query.append('action', params.action)

    return this.request(`/admin/audit-logs?${query.toString()}`, {
      method: 'GET',
    })
  }

  async getDashboardStats() {
    return this.request('/admin/stats', {
      method: 'GET',
    })
  }

  // User Profile APIs
  async getUserProfile() {
    return this.request('/users/profile', {
      method: 'GET',
    })
  }

  async updateUserProfile(data: any) {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  }

  // Admin Plans APIs
  async getPlans(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    return this.request(`/admin/plans?${query.toString()}`, { method: 'GET' })
  }

  async createPlan(data: any) {
    return this.request('/admin/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePlan(id: string, data: any) {
    return this.request(`/admin/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePlan(id: string) {
    return this.request(`/admin/plans/${id}`, { method: 'DELETE' })
  }

  // Admin Payments APIs
  async getPayments(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/payments?${query.toString()}`, { method: 'GET' })
  }

  async getPayment(id: string) {
    return this.request(`/admin/payments/${id}`, { method: 'GET' })
  }

  async refundPayment(id: string) {
    return this.request(`/admin/payments/${id}/refund`, {
      method: 'POST',
    })
  }

  // Admin Companies APIs
  async getAdminCompanies(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.search) query.append('search', params.search)
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/companies?${query.toString()}`, { method: 'GET' })
  }

  async verifyCompany(id: string) {
    return this.request(`/admin/companies/${id}/verify`, {
      method: 'POST',
    })
  }

  // Admin Reports APIs
  async getAdminReports(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/reports?${query.toString()}`, { method: 'GET' })
  }

  // Admin Tenants APIs
  async getTenants(params?: { page?: number; limit?: number; search?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.search) query.append('search', params.search)
    return this.request(`/admin/tenants?${query.toString()}`, { method: 'GET' })
  }

  async getTenant(id: string) {
    return this.request(`/admin/tenants/${id}`, { method: 'GET' })
  }

  async updateTenant(id: string, data: any) {
    return this.request(`/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteTenant(id: string) {
    return this.request(`/admin/tenants/${id}`, { method: 'DELETE' })
  }

  // Admin Subscriptions APIs
  async getSubscriptions(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/subscriptions?${query.toString()}`, { method: 'GET' })
  }

  async cancelSubscription(id: string) {
    return this.request(`/admin/subscriptions/${id}/cancel`, {
      method: 'POST',
    })
  }

  // Admin Analytics APIs
  async getTrustScoreAnalytics(params?: { period?: string }) {
    const query = new URLSearchParams()
    if (params?.period) query.append('period', params.period)
    return this.request(`/admin/analytics/trust-score?${query.toString()}`, { method: 'GET' })
  }

  async getReportAnalytics(params?: { period?: string }) {
    const query = new URLSearchParams()
    if (params?.period) query.append('period', params.period)
    return this.request(`/admin/analytics/reports?${query.toString()}`, { method: 'GET' })
  }

  async getTenantAnalytics(tenantId: string, params?: { period?: string }) {
    const query = new URLSearchParams()
    if (params?.period) query.append('period', params.period)
    return this.request(`/admin/analytics/tenants/${tenantId}?${query.toString()}`, { method: 'GET' })
  }

  // Admin System APIs
  async getSystemHealth() {
    return this.request('/admin/system/health', { method: 'GET' })
  }

  async getFraudDetectionStats() {
    return this.request('/admin/system/fraud-detection', { method: 'GET' })
  }

  // Admin Integrations APIs
  async getIntegrations(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    return this.request(`/admin/integrations?${query.toString()}`, { method: 'GET' })
  }

  async createIntegration(data: any) {
    return this.request('/admin/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateIntegration(id: string, data: any) {
    return this.request(`/admin/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteIntegration(id: string) {
    return this.request(`/admin/integrations/${id}`, { method: 'DELETE' })
  }

  async testIntegration(id: string) {
    return this.request(`/admin/integrations/${id}/test`, {
      method: 'POST',
    })
  }

  // Admin Company Verification APIs
  async getCompanyVerifications(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/verifications?${query.toString()}`, { method: 'GET' })
  }

  async approveVerification(id: string) {
    return this.request(`/admin/verifications/${id}/approve`, {
      method: 'POST',
    })
  }

  async rejectVerification(id: string, reason: string) {
    return this.request(`/admin/verifications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  // Admin Data Export APIs
  async getDataExports(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    return this.request(`/admin/exports?${query.toString()}`, { method: 'GET' })
  }

  async createDataExport(format: string, type: string) {
    return this.request('/admin/exports', {
      method: 'POST',
      body: JSON.stringify({ format, type }),
    })
  }

  async downloadExport(id: string) {
    return this.request(`/admin/exports/${id}/download`, { method: 'GET' })
  }

  // Admin Disputes APIs
  async getDisputes(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.status) query.append('status', params.status)
    return this.request(`/admin/disputes?${query.toString()}`, { method: 'GET' })
  }

  async getDispute(id: string) {
    return this.request(`/admin/disputes/${id}`, { method: 'GET' })
  }

  async resolveDispute(id: string, resolution: string) {
    return this.request(`/admin/disputes/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    })
  }

  // Admin Email Templates APIs
  async getEmailTemplates(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    return this.request(`/admin/email-templates?${query.toString()}`, { method: 'GET' })
  }

  async getEmailTemplate(id: string) {
    return this.request(`/admin/email-templates/${id}`, { method: 'GET' })
  }

  async updateEmailTemplate(id: string, data: any) {
    return this.request(`/admin/email-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async testEmailTemplate(id: string, email: string) {
    return this.request(`/admin/email-templates/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  // Admin Backup APIs
  async getBackups(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    return this.request(`/admin/backups?${query.toString()}`, { method: 'GET' })
  }

  async createBackup() {
    return this.request('/admin/backups', {
      method: 'POST',
    })
  }

  async restoreBackup(id: string) {
    return this.request(`/admin/backups/${id}/restore`, {
      method: 'POST',
    })
  }

  async deleteBackup(id: string) {
    return this.request(`/admin/backups/${id}`, { method: 'DELETE' })
  }
}

// Export singleton instance
export const apiClient = new APIClient()

// Export class for custom instances
export default APIClient
