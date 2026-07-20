/**
 * TypeScript Request/Response Schemas
 * Strongly typed interfaces for all API operations
 *
 * Import and use these types in your controllers and services for runtime validation.
 */

// ============================================================================
// AUTHENTICATION SCHEMAS
// ============================================================================

export interface RegisterRequest {
  name: string
  email: string
  password: string
  crNumber: string // Commercial Registration number
  phone?: string
  city?: string
  sector?: string
}

export interface RegisterResponse {
  id: string
  email: string
  name: string
  role: 'user' | 'reviewer' | 'platform_admin'
  crNumber: string
  createdAt: Date
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
    role: 'user' | 'reviewer' | 'platform_admin'
    tenantId: string
  }
  expiresIn: number // seconds
}

export interface JwtPayload {
  sub: string // userId
  email: string
  role: 'user' | 'reviewer' | 'platform_admin'
  tenantId: string
  iat: number
  exp: number
}

// ============================================================================
// COMPANY SCHEMAS
// ============================================================================

export interface CompanyAddRequest {
  name: string
  crNumber: string
  sector?: string
  city?: string
}

export interface CompanyAddResponse {
  id: string
  message: string
  status: 'pending' | 'approved'
}

export interface CompanySearchResponse {
  data: CompanySearchItem[]
  total: number
  page: number
  limit: number
}

export interface CompanySearchItem {
  id: string
  name: string
  crNumber: string
  trustScore: number
  sector: string
  city: string
  status: 'active' | 'suspended' | 'pending'
}

export interface CompanyReport {
  id: string
  name: string
  crNumber: string
  sector: string
  city: string
  trustScore: number
  totalReports: number
  approvedReports: number
  averagePaymentDelay: number
  defaultRate: number
  status: 'active' | 'suspended' | 'pending'
  claimedBy?: string // User ID if profile is claimed
  lastUpdated: Date
  transactionHistory: Transaction[]
}

export interface Transaction {
  date: Date
  amount: string
  paymentDelay: number // days
  defaulted: boolean
  reportedBy: string
}

// ============================================================================
// REPORT SCHEMAS
// ============================================================================

export interface ReportCreateRequest {
  targetCompanyId: string
  dealAmountRange: string // e.g., "10000-50000"
  paymentCommitment: string // e.g., "30" (days)
  delayDays?: number // default 0
  defaulted?: boolean // default false
  dealtAt: Date | string
}

export interface ReportResponse {
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
  approvedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

export interface ReportListResponse {
  data: ReportResponse[]
  total: number
  page: number
  limit: number
}

// ============================================================================
// TRUST SCORE SCHEMAS
// ============================================================================

export interface TrustScoreResponse {
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
  lastCalculated: Date
  factors: TrustScoreFactor[]
}

export interface TrustScoreFactor {
  name: string
  weight: number
  impact: 'positive' | 'negative' | 'neutral'
  value: number | string
}

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export interface UserResponse {
  id: string
  email: string
  name: string
  role: 'user' | 'reviewer' | 'platform_admin'
  status: 'active' | 'suspended'
  crNumber?: string
  company?: string
  createdAt: Date
  lastLogin?: Date
}

export interface AuditLogResponse {
  id: string
  userId: string
  userEmail: string
  action: string
  entity: string
  entityId: string
  changes?: Record<string, unknown>
  timestamp: Date
  ipAddress?: string
  status: 'success' | 'failure'
}

export interface AuditLogListResponse {
  data: AuditLogResponse[]
  total: number
  page: number
  limit: number
}

export interface BusinessRequestResponse {
  id: string
  type: string
  status: 'pending' | 'approved' | 'rejected'
  requestedBy: string
  requestedAt: Date
  approvedBy?: string
  approvedAt?: Date
  rejectionReason?: string
  data?: Record<string, unknown>
}

export interface BusinessRequestListResponse {
  data: BusinessRequestResponse[]
  total: number
  page: number
  limit: number
}

// ============================================================================
// PAGINATION & FILTERING
// ============================================================================

export interface PaginationParams {
  page?: number // default 1
  limit?: number // default 20
}

export interface FilterParams {
  status?: string
  role?: string
  action?: string
  entity?: string
  startDate?: string
  endDate?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ============================================================================
// ERROR SCHEMAS
// ============================================================================

export interface ErrorResponse {
  statusCode: number
  errorCode: string // e.g., 'ERR_4002'
  message: string
  details?: Record<string, unknown>
  timestamp: Date
  path?: string
}

export interface ValidationError {
  field: string
  message: string
  value?: unknown
}

// ============================================================================
// RESPONSE ENVELOPE
// ============================================================================

export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  data?: T
  error?: ErrorResponse
  message?: string
  timestamp: Date
}

export interface ListApiResponse<T> {
  success: boolean
  statusCode: number
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  timestamp: Date
}

// ============================================================================
// RATE LIMITING HEADERS
// ============================================================================

export interface RateLimitHeaders {
  'x-ratelimit-limit': string
  'x-ratelimit-remaining': string
  'x-ratelimit-reset': string
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

export interface AuthContext {
  userId: string
  tenantId: string
  role: 'user' | 'reviewer' | 'platform_admin'
  email: string
  permissions: string[]
}

export interface RequestContext {
  auth: AuthContext
  requestId: string
  timestamp: Date
  ipAddress: string
  userAgent: string
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
  errors?: BatchOperationError[]
}

export interface BatchOperationError {
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
  errors?: BatchOperationError[]
}

// ============================================================================
// NOTIFICATION & EMAIL SCHEMAS
// ============================================================================

export interface EmailNotification {
  to: string
  subject: string
  template: string
  data: Record<string, unknown>
}

export interface NotificationEvent {
  type: 'report_submitted' | 'report_approved' | 'report_rejected' | 'company_added'
  userId: string
  data: Record<string, unknown>
  timestamp: Date
}

// ============================================================================
// DOCUMENT UPLOAD
// ============================================================================

export interface DocumentUploadRequest {
  reportId: string
  fileName: string
  fileSize: number
  mimeType: string
}

export interface DocumentUploadResponse {
  documentId: string
  uploadUrl: string
  expiresIn: number // seconds
}

export interface DocumentMetadata {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedAt: Date
  uploadedBy: string
  reportId: string
}
