/**
 * Mock API Server للتطوير
 * يحاكي Marsad Backend API
 */

interface Company {
  id: string
  name: string
  category: string
  trustScore: number
  city: string
  employeeCount: number
  reports: number
  rating: number
}

interface Report {
  id: string
  companyName: string
  rating: number
  description: string
  author: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

// Mock Data
const mockCompanies: Company[] = [
  {
    id: '1',
    name: 'شركة النور',
    category: 'تكنولوجيا',
    trustScore: 94,
    city: 'الرياض',
    employeeCount: 150,
    reports: 45,
    rating: 4.5,
  },
  {
    id: '2',
    name: 'شركة الرؤية',
    category: 'التجارة',
    trustScore: 78,
    city: 'جدة',
    employeeCount: 200,
    reports: 32,
    rating: 4.0,
  },
  {
    id: '3',
    name: 'شركة المستقبل',
    category: 'الخدمات',
    trustScore: 65,
    city: 'الدمام',
    employeeCount: 80,
    reports: 18,
    rating: 3.5,
  },
]

const mockReports: Report[] = [
  {
    id: '1',
    companyName: 'شركة النور',
    rating: 5,
    description: 'تجربة رائعة جداً مع الخدمات',
    author: 'محمد علي',
    createdAt: new Date().toISOString(),
    status: 'approved',
  },
  {
    id: '2',
    companyName: 'شركة الرؤية',
    rating: 3,
    description: 'خدمات جيدة لكن التسليم متأخر',
    author: 'فاطمة أحمد',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'pending',
  },
]

// API Handler
export const mockAPI = {
  // Auth
  async login(email: string, password: string) {
    if (!email || !password) {
      throw new Error('Email and password required')
    }
    return {
      user: {
        id: '1',
        email,
        name: email.split('@')[0],
      },
      token: `mock_token_${email}`,
    }
  },

  // Companies
  async getCompanies(params?: { search?: string; limit?: number }) {
    let results = mockCompanies
    if (params?.search) {
      results = results.filter(c =>
        c.name.toLowerCase().includes(params.search!.toLowerCase())
      )
    }
    return {
      data: results.slice(0, params?.limit || 10),
      total: mockCompanies.length,
    }
  },

  async getCompany(id: string) {
    const company = mockCompanies.find(c => c.id === id)
    if (!company) throw new Error('Company not found')
    return company
  },

  // Reports
  async getReports(params?: { limit?: number }) {
    return {
      data: mockReports.slice(0, params?.limit || 10),
      total: mockReports.length,
    }
  },

  async createReport(data: any) {
    const report: Report = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    mockReports.push(report)
    return report
  },
}
