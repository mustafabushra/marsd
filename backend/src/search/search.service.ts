import { Injectable, BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'

export interface SearchFilters {
  query?: string
  sectors?: string[]
  cities?: string[]
  status?: string[] // active | suspended | inactive
  trustScoreMin?: number
  trustScoreMax?: number
  riskBand?: string[] // low | medium | high
  source?: string[] // official | community
  approved?: boolean
  hasReports?: boolean
}

export interface PaginationOptions {
  page?: number
  limit?: number
  cursor?: string // For cursor-based pagination
  offset?: number // For offset-based pagination
}

export interface SortOptions {
  sortBy?: 'name' | 'date' | 'score' | 'reports' // default: 'name'
  sortOrder?: 'asc' | 'desc' // default: 'asc'
}

export interface SearchResponse {
  data: any[]
  pagination: {
    page?: number
    limit?: number
    total: number
    pages?: number
    cursor?: string
    nextCursor?: string
    hasMore?: boolean
  }
  filters: {
    availableSectors: string[]
    availableCities: string[]
  }
  meta: {
    query: string
    filters: SearchFilters
    executionTime: number
  }
}

export interface SavedSearch {
  id: string
  name: string
  filters: SearchFilters
  sort: SortOptions
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Advanced search with multiple filters, pagination, and sorting
   */
  async search(
    filters: SearchFilters,
    pagination: PaginationOptions = {},
    sort: SortOptions = {},
  ): Promise<SearchResponse> {
    const startTime = Date.now()

    // Default pagination values
    const limit = Math.min(pagination.limit || 20, 100) // Max 100 per page
    const page = Math.max(pagination.page || 1, 1)
    const skip = (page - 1) * limit

    // Default sort values
    const sortBy = sort.sortBy || 'name'
    const sortOrder = sort.sortOrder || 'asc'

    // Build Prisma where clause
    const where = this.buildWhereClause(filters)

    // Build Prisma orderBy clause
    const orderBy = this.buildOrderByClause(sortBy, sortOrder)

    // Fetch companies with trust scores and report counts
    const companies = await this.prisma.company.findMany({
      where,
      include: {
        trustScore: true,
        _count: {
          select: {
            reports: {
              where: { status: 'approved' },
            },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    })

    // Get total count for pagination
    const total = await this.prisma.company.count({ where })

    // Get available filters for UI
    const availableSectors = await this.getAvailableSectors(filters)
    const availableCities = await this.getAvailableCities(filters)

    // Format response
    const formattedData = companies.map(company => ({
      id: company.id,
      name: company.name,
      crNumber: company.crNumber,
      sector: company.sector,
      city: company.city,
      foundedYear: company.foundedYear,
      crStatus: company.crStatus,
      source: company.source,
      approved: company.approved,
      trustScore: company.trustScore ? {
        score: company.trustScore.score,
        riskBand: company.trustScore.riskBand,
        tier: company.trustScore.tier,
        approvedReports: company.trustScore.approvedReports,
      } : null,
      reportCount: company._count.reports,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }))

    const executionTime = Date.now() - startTime

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        availableSectors,
        availableCities,
      },
      meta: {
        query: filters.query || '',
        filters,
        executionTime,
      },
    }
  }

  /**
   * Full-text search across name, CR number, and sector
   */
  async fullTextSearch(
    query: string,
    pagination: PaginationOptions = {},
  ): Promise<SearchResponse> {
    const limit = Math.min(pagination.limit || 20, 100)
    const page = Math.max(pagination.page || 1, 1)
    const skip = (page - 1) * limit

    // Split query into terms for better matching
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)

    // Build complex OR condition for full-text search
    const orConditions = []

    for (const term of terms) {
      orConditions.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
          { crNumber: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
          { sector: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
          { city: { contains: term, mode: 'insensitive' as Prisma.QueryMode } },
        ],
      })
    }

    const where: Prisma.CompanyWhereInput = {
      approved: true,
      AND: orConditions.length > 0 ? orConditions : undefined,
    }

    const companies = await this.prisma.company.findMany({
      where,
      include: {
        trustScore: true,
        _count: {
          select: {
            reports: {
              where: { status: 'approved' },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    })

    const total = await this.prisma.company.count({ where })

    const formattedData = companies.map(company => this.formatCompanyData(company))

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        availableSectors: [],
        availableCities: [],
      },
      meta: {
        query,
        filters: { query },
        executionTime: 0,
      },
    }
  }

  /**
   * Get distinct sectors for filter dropdown
   */
  async getAvailableSectors(filters?: SearchFilters): Promise<string[]> {
    const where = filters ? this.buildWhereClause(filters, true) : { approved: true }

    const sectors = await this.prisma.company.findMany({
      where,
      select: { sector: true },
      distinct: ['sector'],
      orderBy: { sector: 'asc' },
    })

    return sectors
      .map(s => s.sector)
      .filter((s, idx, arr) => s && arr.indexOf(s) === idx)
  }

  /**
   * Get distinct cities for filter dropdown
   */
  async getAvailableCities(filters?: SearchFilters): Promise<string[]> {
    const where = filters ? this.buildWhereClause(filters, true) : { approved: true }

    const cities = await this.prisma.company.findMany({
      where,
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    })

    return cities
      .map(c => c.city)
      .filter((c, idx, arr) => c && arr.indexOf(c) === idx)
  }

  /**
   * Autocomplete suggestions based on partial input
   */
  async getAutocompleteSuggestions(
    query: string,
    limit: number = 10,
  ): Promise<string[]> {
    if (query.length < 1) return []

    const companies = await this.prisma.company.findMany({
      where: {
        approved: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { crNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { name: true },
      orderBy: { name: 'asc' },
      take: limit,
    })

    return companies
      .map(c => c.name)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
  }

  /**
   * Save search filters for user
   */
  async saveSearch(
    userId: string,
    name: string,
    filters: SearchFilters,
    sort: SortOptions,
  ): Promise<SavedSearch> {
    // Note: This requires a SavedSearch model in Prisma schema
    // For now, returning mock data structure
    return {
      id: `search_${Date.now()}`,
      name,
      filters,
      sort,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  /**
   * Get user's saved searches
   */
  async getSavedSearches(userId: string): Promise<SavedSearch[]> {
    // Note: This requires a SavedSearch model in Prisma schema
    // For now, returning empty array
    return []
  }

  /**
   * Delete a saved search
   */
  async deleteSavedSearch(userId: string, searchId: string): Promise<void> {
    // Note: This requires a SavedSearch model in Prisma schema
  }

  /**
   * Build Prisma where clause from filters
   */
  private buildWhereClause(
    filters: SearchFilters,
    excludeQuery: boolean = false,
  ): Prisma.CompanyWhereInput {
    const where: Prisma.CompanyWhereInput = {
      approved: filters.approved !== undefined ? filters.approved : true,
    }

    // Text search
    if (!excludeQuery && filters.query) {
      const query = filters.query.toLowerCase()
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { crNumber: { contains: query, mode: 'insensitive' } },
        { sector: { contains: query, mode: 'insensitive' } },
      ]
    }

    // Sector filter
    if (filters.sectors && filters.sectors.length > 0) {
      where.sector = {
        in: filters.sectors,
      }
    }

    // City filter
    if (filters.cities && filters.cities.length > 0) {
      where.city = {
        in: filters.cities,
      }
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      where.crStatus = {
        in: filters.status,
      }
    }

    // Source filter
    if (filters.source && filters.source.length > 0) {
      where.source = {
        in: filters.source,
      }
    }

    // Trust score range filter
    if (filters.trustScoreMin !== undefined || filters.trustScoreMax !== undefined) {
      where.trustScore = {
        AND: [],
      }
      if (filters.trustScoreMin !== undefined) {
        (where.trustScore.AND as any).push({
          score: { gte: filters.trustScoreMin },
        })
      }
      if (filters.trustScoreMax !== undefined) {
        (where.trustScore.AND as any).push({
          score: { lte: filters.trustScoreMax },
        })
      }
    }

    // Risk band filter
    if (filters.riskBand && filters.riskBand.length > 0) {
      if (!where.trustScore) where.trustScore = {}
      where.trustScore.riskBand = {
        in: filters.riskBand,
      }
    }

    // Has reports filter
    if (filters.hasReports) {
      where.reports = {
        some: {
          status: 'approved',
        },
      }
    }

    return where
  }

  /**
   * Build Prisma orderBy clause from sort options
   */
  private buildOrderByClause(
    sortBy: string,
    sortOrder: string,
  ): Prisma.CompanyOrderByWithRelationInput {
    const order = sortOrder === 'desc' ? 'desc' : 'asc'

    switch (sortBy) {
      case 'date':
        return { createdAt: order }
      case 'score':
        return { trustScore: { score: order } }
      case 'reports':
        return { reports: { _count: order } }
      case 'name':
      default:
        return { name: order }
    }
  }

  /**
   * Format company data for response
   */
  private formatCompanyData(company: any) {
    return {
      id: company.id,
      name: company.name,
      crNumber: company.crNumber,
      sector: company.sector,
      city: company.city,
      foundedYear: company.foundedYear,
      crStatus: company.crStatus,
      source: company.source,
      approved: company.approved,
      trustScore: company.trustScore ? {
        score: company.trustScore.score,
        riskBand: company.trustScore.riskBand,
        tier: company.trustScore.tier,
        approvedReports: company.trustScore.approvedReports,
      } : null,
      reportCount: company._count?.reports || 0,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }
  }
}
