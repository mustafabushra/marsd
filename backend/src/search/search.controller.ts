import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common'
import { Request as ExpressRequest } from 'express'
import { SearchService, SearchFilters, PaginationOptions, SortOptions } from './search.service'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

interface AuthRequest extends ExpressRequest {
  user: {
    userId: string
    tenantId: string
    role: string
    email: string
  }
}

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  /**
   * Advanced search with filters and pagination
   * GET /search?q=...&sectors=...&cities=...&trustScoreMin=...&page=...
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('q') query: string = '',
    @Query('sectors') sectors?: string,
    @Query('cities') cities?: string,
    @Query('status') status?: string,
    @Query('trustScoreMin') trustScoreMin?: string,
    @Query('trustScoreMax') trustScoreMax?: string,
    @Query('riskBand') riskBand?: string,
    @Query('source') source?: string,
    @Query('approved') approved?: string,
    @Query('hasReports') hasReports?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('sortBy') sortBy: string = 'name',
    @Query('sortOrder') sortOrder: string = 'asc',
  ) {
    // Parse array filters
    const parseArrayFilter = (value: string): string[] => {
      if (!value) return []
      return value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    }

    // Parse numeric filters
    const parseNumber = (value: string): number | undefined => {
      const num = parseInt(value, 10)
      return isNaN(num) ? undefined : num
    }

    // Build filters object
    const filters: SearchFilters = {
      query: query || undefined,
      sectors: parseArrayFilter(sectors),
      cities: parseArrayFilter(cities),
      status: parseArrayFilter(status),
      trustScoreMin: parseNumber(trustScoreMin),
      trustScoreMax: parseNumber(trustScoreMax),
      riskBand: parseArrayFilter(riskBand),
      source: parseArrayFilter(source),
      approved: approved ? approved === 'true' : undefined,
      hasReports: hasReports ? hasReports === 'true' : undefined,
    }

    // Remove undefined values from filters
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof SearchFilters] === undefined) {
        delete filters[key as keyof SearchFilters]
      }
    })

    const pagination: PaginationOptions = {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    }

    const sort: SortOptions = {
      sortBy: (sortBy as any) || 'name',
      sortOrder: (sortOrder as any) || 'asc',
    }

    // Validate sort options
    if (!['name', 'date', 'score', 'reports'].includes(sortBy)) {
      throw new BadRequestException('Invalid sortBy parameter')
    }
    if (!['asc', 'desc'].includes(sortOrder)) {
      throw new BadRequestException('Invalid sortOrder parameter')
    }

    return this.searchService.search(filters, pagination, sort)
  }

  /**
   * Full-text search (simplified, faster)
   * GET /search/full-text?q=...&page=...
   */
  @Get('full-text')
  @UseGuards(JwtAuthGuard)
  async fullTextSearch(
    @Query('q') query: string = '',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    if (query.trim().length < 1) {
      throw new BadRequestException('Search query is required')
    }

    const pagination: PaginationOptions = {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    }

    return this.searchService.fullTextSearch(query, pagination)
  }

  /**
   * Autocomplete suggestions
   * GET /search/autocomplete?q=...&limit=10
   */
  @Get('autocomplete')
  @UseGuards(JwtAuthGuard)
  async getAutocompleteSuggestions(
    @Query('q') query: string = '',
    @Query('limit') limit: string = '10',
  ) {
    if (query.trim().length < 1) {
      return { suggestions: [] }
    }

    const limitNum = Math.min(parseInt(limit, 10) || 10, 50)
    const suggestions = await this.searchService.getAutocompleteSuggestions(query, limitNum)

    return { suggestions }
  }

  /**
   * Get available sectors for filter dropdown
   * GET /search/filters/sectors
   */
  @Get('filters/sectors')
  @UseGuards(JwtAuthGuard)
  async getSectors() {
    const sectors = await this.searchService.getAvailableSectors()
    return { sectors }
  }

  /**
   * Get available cities for filter dropdown
   * GET /search/filters/cities
   */
  @Get('filters/cities')
  @UseGuards(JwtAuthGuard)
  async getCities() {
    const cities = await this.searchService.getAvailableCities()
    return { cities }
  }

  /**
   * Save search filters
   * POST /search/saved
   */
  @Post('saved')
  @UseGuards(JwtAuthGuard)
  async saveSearch(
    @Request() req: AuthRequest,
    @Body()
    body: {
      name: string
      filters: SearchFilters
      sort: SortOptions
    },
  ) {
    if (!body.name || body.name.trim().length === 0) {
      throw new BadRequestException('Search name is required')
    }

    const userId = req.user.userId
    return this.searchService.saveSearch(userId, body.name, body.filters, body.sort)
  }

  /**
   * Get user's saved searches
   * GET /search/saved
   */
  @Get('saved')
  @UseGuards(JwtAuthGuard)
  async getSavedSearches(@Request() req: AuthRequest) {
    const userId = req.user.userId
    const searches = await this.searchService.getSavedSearches(userId)
    return { searches }
  }

  /**
   * Delete a saved search
   * DELETE /search/saved/:searchId
   */
  @Delete('saved/:searchId')
  @UseGuards(JwtAuthGuard)
  async deleteSavedSearch(
    @Request() req: AuthRequest,
    @Query('id') searchId: string,
  ) {
    const userId = req.user.userId
    await this.searchService.deleteSavedSearch(userId, searchId)
    return { success: true }
  }
}
