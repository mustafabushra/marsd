/**
 * TypeScript Types and Interfaces for Marsad Platform
 * Defines all data structures and component props
 */

// ============================================================================
// USER & AUTHENTICATION
// ============================================================================

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'company' | 'visitor'
  company?: Company
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
  tenant?: Company
}

// ============================================================================
// COMPANY
// ============================================================================

export interface Company {
  id: string
  name: string
  crNumber: string
  commercialNumber?: string
  sector: string
  city: string
  foundedYear?: number
  crStatus: 'active' | 'inactive' | 'suspended'
  status?: 'pending' | 'approved' | 'rejected'
  createdAt?: string
  updatedAt?: string
}

export interface CompanyWithTrust extends Company {
  trust_score?: TrustScore
  reportCount?: number
  lastReportDate?: string
}

// ============================================================================
// TRUST SCORE & RATINGS
// ============================================================================

export interface TrustScore {
  score: number
  riskBand: 'low' | 'medium' | 'high'
  tier: 'none' | 'partial' | 'full'
  approvedReports: number
  lastUpdated?: string
}

// ============================================================================
// REPORTS
// ============================================================================

export interface Report {
  id: string
  companyId: string
  targetCompany?: Company
  reporterId?: string
  status: 'pending_review' | 'approved' | 'rejected' | 'archived'
  paymentCommitment: 'full' | 'partial' | 'none'
  delayDays: number
  reason?: string
  submittedAt: Date | string
  approvedAt?: Date | string
  rejectedAt?: Date | string
  reviewNotes?: string
}

export interface ReportData {
  targetCompanyId: string
  paymentCommitment: 'full' | 'partial' | 'none'
  delayDays: number
  details?: string
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface SearchCompaniesResponse extends PaginatedResponse<CompanyWithTrust> {}

export interface GetReportsResponse extends PaginatedResponse<Report> {}

export interface ApiError {
  message: string
  code?: string
  statusCode?: number
}

// ============================================================================
// COMPONENT PROPS - UI COMPONENTS
// ============================================================================

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  children: React.ReactNode
  onClick?: () => void | Promise<void>
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  helperText?: string
}

export interface CardProps {
  title?: string
  subtitle?: string
  padding?: number | string
  border?: boolean
  shadow?: boolean
  children: React.ReactNode
  className?: string
  header?: React.ReactNode
  footer?: React.ReactNode
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdropClick?: boolean
}

// ============================================================================
// COMPONENT PROPS - FORM COMPONENTS
// ============================================================================

export interface LoginFormProps {
  onSuccess?: (user: User) => void
  onError?: (error: string) => void
  isLoading?: boolean
}

export interface RegisterFormProps {
  onSuccess?: (user: User) => void
  onError?: (error: string) => void
  isLoading?: boolean
}

export interface SearchFormProps {
  onSearch?: (query: string, filters?: SearchFilters) => void | Promise<void>
  isLoading?: boolean
  placeholder?: string
}

export interface SearchFilters {
  sector?: string
  city?: string
  status?: string
}

// ============================================================================
// COMPONENT PROPS - TABLE COMPONENTS
// ============================================================================

export interface CompaniesTableProps {
  companies: CompanyWithTrust[]
  isLoading?: boolean
  pagination?: Pagination
  onRowClick?: (company: CompanyWithTrust) => void
  onPageChange?: (page: number) => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ReportsTableProps {
  reports: Report[]
  isLoading?: boolean
  pagination?: Pagination
  onApprove?: (reportId: string) => void | Promise<void>
  onReject?: (reportId: string, reason?: string) => void | Promise<void>
  onView?: (reportId: string) => void
  onPageChange?: (page: number) => void
}

// ============================================================================
// COMPONENT PROPS - CARD COMPONENTS
// ============================================================================

export interface StatCardProps {
  icon?: React.ReactNode
  label: string
  value: string | number
  subtitle?: string
  color?: 'green' | 'blue' | 'orange' | 'red'
  trend?: number
  className?: string
}

export interface CompanyCardProps {
  company: Company
  trustScore?: TrustScore
  onViewReport?: () => void
  onClaimProfile?: () => void
  className?: string
}

// ============================================================================
// COMPONENT PROPS - LAYOUT COMPONENTS
// ============================================================================

export interface MenuItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  onClick?: () => void
  active?: boolean
  children?: MenuItem[]
}

export interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  company?: Company
  onLogout?: () => void
  onSelectCompany?: (company: Company) => void
  className?: string
}

export interface HeaderProps {
  onSearch?: (query: string) => void
  onNotification?: () => void
  onProfile?: () => void
  onLanguageChange?: (lang: 'en' | 'ar') => void
  currentLang?: 'en' | 'ar'
  notificationCount?: number
  userName?: string
  className?: string
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export interface UseApiReturn<T> extends UseApiState<T> {
  call: (...args: any[]) => Promise<void>
  reset: () => void
}

export interface UseFormState {
  values: Record<string, any>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  setValue: (field: string, value: any) => void
  setError: (field: string, error: string) => void
  setTouched: (field: string, touched: boolean) => void
  resetForm: () => void
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleBlur: (e: React.FocusEvent<HTMLInputElement>) => void
  handleSubmit: (callback: () => Promise<void>) => (e: React.FormEvent) => Promise<void>
}

// ============================================================================
// ADMIN TYPES
// ============================================================================

export interface AdminUser extends User {
  role: 'platform_admin' | 'company_admin' | 'user'
  lastLogin?: string
  isActive: boolean
}

export interface Subscription {
  id: string
  companyId: string
  planName: string
  planTier: 'starter' | 'professional' | 'enterprise'
  status: 'active' | 'inactive' | 'suspended' | 'expired'
  startDate: string
  endDate: string
  billingCycle: 'monthly' | 'yearly'
  amount: number
  currency: string
  nextBillingDate?: string
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  userEmail: string
  action: string
  entity: string
  entityId: string
  changes?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  timestamp: string
  status: 'success' | 'failed'
}

export interface AdminDashboardData {
  overview: {
    totalCompanies: number
    activeSubscriptions: number
    pendingReports: number
    totalRevenue: number
    activeUsers: number
    suspendedCompanies: number
  }
  recentActivity: AuditLog[]
  topReporting: Company[]
  revenueByMonth: { month: string; amount: number }[]
  reportsByStatus: { status: string; count: number }[]
}

export interface UsersTableData {
  users: AdminUser[]
  pagination: Pagination
}

export interface CompaniesTableData {
  companies: Company[]
  pagination: Pagination
}

export interface ReportsTableData {
  reports: Report[]
  pagination: Pagination
}

export interface SubscriptionsTableData {
  subscriptions: Subscription[]
  pagination: Pagination
}
