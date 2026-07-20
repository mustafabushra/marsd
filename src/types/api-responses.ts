/**
 * TypeScript Interfaces for Marsad API Responses
 * Frontend type definitions for all API operations
 *
 * Import and use these types for type-safe API interactions
 */

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  name: string
  email: string
  password: string
  crNumber: string
  phone?: string
  city?: string
  sector?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'user' | 'reviewer' | 'platform_admin'
  tenantId: string
  crNumber?: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  expiresIn: number
}

export interface JwtPayload {
  sub: string
  email: string
  role: 'user' | 'reviewer' | 'platform_admin'
  tenantId: string
  iat: number
  exp: number
}

// ============================================================================
// COMPANY TYPES
// ============================================================================

export interface Company {
  id: string
  name: string
  crNumber: string
  sector: string
  city: string
  trustScore: number
  status: 'active' | 'suspended' | 'pending'
  claimedBy?: string
  lastUpdated: Date | string
}

export interface CompanyReport extends Company {
  totalReports: number
  approvedReports: number
  averagePaymentDelay: number
  defaultRate: number
  transactionHistory: Transaction[]
}

export interface Transaction {
  date: Date | string
  amount: string
  paymentDelay: number
  defaulted: boolean
  reportedBy: string
}

export interface CompanySearchParams {
  q: string
  page?: number
  limit?: number
}

export interface CompanySearchResult {
  data: Company[]
  total: number
  page: number
  limit: number
}

export interface AddCompanyRequest {
  name: string
  crNumber: string
  sector?: string
  city?: string
}

// ============================================================================
// REPORT TYPES
// ============================================================================

export interface CreateReportRequest {
  targetCompanyId: string
  dealAmountRange: string
  paymentCommitment: string
  delayDays?: number
  defaulted?: boolean
  dealtAt: Date | string
}

export interface Report {
  id: string
  reporterCompanyId: string
  targetCompanyId: string
  targetCompanyName?: string
  dealAmountRange: string
  paymentCommitment: string
  delayDays: number
  defaulted: boolean
  status: 'pending' | 'approved' | 'rejected' | 'info_requested'
  approvedBy?: string
  approvedAt?: Date | string
  rejectionReason?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ReportListResult {
  data: Report[]
  total: number
  page: number
  limit: number
}

export interface ReportFilter {
  status?: 'pending' | 'approved' | 'rejected' | 'info_requested'
  page?: number
  limit?: number
}

// ============================================================================
// TRUST SCORE TYPES
// ============================================================================

export interface TrustScore {
  companyId: string
  score: number // 0-100
  level: 'low' | 'medium' | 'high' | 'excellent'
  basedOn: {
    totalReports: number
    approvedReports: number
    averagePaymentDelay: number
    defaultRate: number
    reviewPeriod: string
  }
  factors: TrustScoreFactor[]
  lastCalculated: Date | string
}

export interface TrustScoreFactor {
  name: string
  weight: number
  impact: 'positive' | 'negative' | 'neutral'
  value: number | string
}

// ============================================================================
// ADMIN TYPES
// ============================================================================

export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'user' | 'reviewer' | 'platform_admin'
  status: 'active' | 'suspended'
  crNumber?: string
  company?: string
  createdAt: Date | string
  lastLogin?: Date | string
}

export interface AuditLog {
  id: string
  userId: string
  userEmail: string
  action: string
  entity: string
  entityId: string
  changes?: Record<string, any>
  timestamp: Date | string
  ipAddress?: string
  status: 'success' | 'failure'
}

export interface BusinessRequest {
  id: string
  type: string
  status: 'pending' | 'approved' | 'rejected'
  requestedBy: string
  requestedAt: Date | string
  approvedBy?: string
  approvedAt?: Date | string
  rejectionReason?: string
  data?: Record<string, any>
}

// ============================================================================
// PAGINATION & FILTERING
// ============================================================================

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface ApiError {
  statusCode: number
  errorCode: string
  message: string
  details?: Record<string, any>
  timestamp: Date | string
  path?: string
}

export interface ValidationError {
  field: string
  message: string
  value?: any
}

export interface ApiErrorResponse {
  error: ApiError
  isRetryable: boolean
}

// ============================================================================
// API RESPONSE WRAPPER
// ============================================================================

export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  data?: T
  error?: ApiError
  message?: string
  timestamp: Date | string
}

export interface ApiListResponse<T> {
  success: boolean
  statusCode: number
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  timestamp: Date | string
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: any
  params?: Record<string, any>
  timeout?: number
  retry?: {
    maxRetries: number
    backoffMultiplier: number
  }
}

// ============================================================================
// DOCUMENT UPLOAD
// ============================================================================

export interface UploadDocumentRequest {
  reportId: string
  fileName: string
  fileSize: number
  mimeType: string
}

export interface UploadDocumentResponse {
  documentId: string
  uploadUrl: string
  expiresIn: number
}

export interface DocumentMetadata {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedAt: Date | string
  uploadedBy: string
  reportId: string
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export interface BatchApproveRequest {
  reportIds: string[]
}

export interface BatchApproveResponse {
  approved: number
  failed: number
  errors?: BatchError[]
}

export interface BatchError {
  id: string
  error: string
}

export interface BulkImportRequest {
  companies: CompanyImportItem[]
}

export interface CompanyImportItem {
  name: string
  crNumber: string
  sector?: string
  city?: string
}

export interface BulkImportResponse {
  imported: number
  failed: number
  errors?: BatchError[]
}

// ============================================================================
// API CLIENT TYPES
// ============================================================================

export interface ApiClientConfig {
  baseUrl: string
  timeout?: number
  retryConfig?: {
    maxRetries: number
    backoffMultiplier: number
    initialDelay: number
  }
  interceptors?: {
    request?: (config: RequestOptions) => RequestOptions
    response?: (response: Response) => Response
    error?: (error: ApiError) => ApiError
  }
}

export interface ApiClientState {
  accessToken?: string
  refreshToken?: string
  user?: AuthUser
  isAuthenticated: boolean
  isLoading: boolean
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  title?: string
  duration?: number // milliseconds
  action?: {
    label: string
    onClick: () => void
  }
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface ReportFilterOptions {
  status?: 'pending' | 'approved' | 'rejected' | 'info_requested'
  startDate?: Date
  endDate?: Date
  targetCompanyId?: string
  reporterCompanyId?: string
}

export interface CompanyFilterOptions {
  status?: 'active' | 'suspended' | 'pending'
  sector?: string
  city?: string
  trustScoreMin?: number
  trustScoreMax?: number
}

export interface UserFilterOptions {
  role?: 'user' | 'reviewer' | 'platform_admin'
  status?: 'active' | 'suspended'
  createdAfter?: Date
  createdBefore?: Date
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

export interface SearchResult<T> {
  items: T[]
  total: number
  query: string
  filters: Record<string, any>
  executionTime: number // milliseconds
}

export interface SearchFilters {
  [key: string]: string | number | boolean | (string | number)[]
}

// ============================================================================
// SORTING TYPES
// ============================================================================

export type SortOrder = 'asc' | 'desc'

export interface SortBy {
  field: string
  order: SortOrder
}

// ============================================================================
// CHART DATA TYPES
// ============================================================================

export interface ChartDataPoint {
  label: string
  value: number
  color?: string
  metadata?: Record<string, any>
}

export interface TimeSeriesData {
  timestamp: Date | string
  value: number
}

export interface TrustScoreDistribution {
  score: number
  count: number
  percentage: number
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface Analytics {
  totalReports: number
  approvedReports: number
  rejectedReports: number
  averageTrustScore: number
  companiesCount: number
  usersCount: number
  reportsSubmittedToday: number
  reportsApprovedToday: number
}

export interface CompanyAnalytics {
  companyId: string
  totalReports: number
  approvedReports: number
  rejectedReports: number
  averagePaymentDelay: number
  defaultRate: number
  trustScoreTrend: TimeSeriesData[]
  topIssues: string[]
}

// ============================================================================
// TABLE COLUMN TYPES
// ============================================================================

export interface TableColumn<T> {
  key: keyof T
  label: string
  sortable?: boolean
  filterable?: boolean
  width?: string | number
  render?: (value: any, row: T) => React.ReactNode
}

export interface TableState {
  sortBy?: SortBy
  page: number
  limit: number
  filters: Record<string, any>
}
