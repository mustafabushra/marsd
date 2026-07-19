// User and Authentication Types
export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'staff'
  companyId?: string
  joinDate: string
  status: 'active' | 'inactive' | 'suspended'
}

export interface AuthContext {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
}

export interface RegisterData {
  fullName: string
  companyName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
}

// Company Types
export interface Company {
  id: string
  name: string
  industry: string
  website?: string
  email: string
  phone: string
  address?: string
  description?: string
  employees?: number
  yearFounded?: number
  trustScore: number
  status: 'active' | 'pending' | 'inactive'
  reportsCount: number
  lastUpdate: string
  createdAt: string
  updatedAt: string
}

export interface CompanyStats {
  totalCompanies: number
  activeCompanies: number
  avgTrustScore: number
  topCompanies: Company[]
}

// Report Types
export interface Report {
  id: string
  companyId: string
  type: 'positive' | 'negative' | 'neutral'
  rating: number
  title: string
  description: string
  author: string
  authorId?: string
  isAnonymous: boolean
  status: 'pending' | 'approved' | 'rejected'
  transactionDate: string
  createdAt: string
  updatedAt: string
  helpfulCount: number
  unhelpfulCount: number
}

export interface ReportFilters {
  companyId?: string
  type?: string
  status?: string
  rating?: number
  dateRange?: {
    startDate: string
    endDate: string
  }
}

// Subscription Types
export interface SubscriptionPlan {
  id: string
  name: string
  price: number
  period: 'monthly' | 'yearly'
  description: string
  features: string[]
  searchLimit: number
  reportLimit: number
  compareEnabled: boolean
  advancedReportsEnabled: boolean
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'canceled' | 'expired'
  startDate: string
  endDate: string
  autoRenew: boolean
}

// Audit Log Types
export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: string
  target: string
  status: 'success' | 'failure'
  timestamp: string
  details: string
  ipAddress?: string
}

// Watchlist Types
export interface WatchlistItem {
  id: string
  userId: string
  companyId: string
  companyName: string
  trustScore: number
  change: number
  addedDate: string
  alerts: WatchlistAlert[]
}

export interface WatchlistAlert {
  id: string
  type: 'score_change' | 'new_report' | 'status_change'
  message: string
  createdAt: string
  read: boolean
}

// Search and Filter Types
export interface SearchParams {
  query: string
  industry?: string
  minScore?: number
  maxScore?: number
  sortBy?: 'score' | 'name' | 'recent'
  limit?: number
  offset?: number
}

export interface SearchResult {
  companies: Company[]
  total: number
  hasMore: boolean
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  meta?: {
    timestamp: string
    version: string
  }
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasNextPage: boolean
}

// Form State Types
export interface FormState {
  isLoading: boolean
  error: string | null
  success: boolean
  data?: any
}

// Dashboard Stats Types
export interface DashboardStats {
  totalUsers: number
  totalCompanies: number
  totalReports: number
  avgTrustScore: number
  reportsToday: number
  newUsersToday: number
}
