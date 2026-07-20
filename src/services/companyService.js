/**
 * Company Service
 * Handles company-related operations: search, fetch details, reports, etc.
 * Will be integrated with NestJS backend API
 */

import { mockCompanies } from '../data/mockData'

export const companyService = {
  /**
   * Search companies by name or commercial number
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching companies
   */
  searchCompanies: async (query) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        const results = mockCompanies.filter(c =>
          c.name.includes(query) || c.commercialNumber.includes(query)
        )
        resolve(results)
      }, 300)
    })
  },

  /**
   * Get company by ID
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Company details
   */
  getCompanyById: async (companyId) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        const company = mockCompanies.find(c => c.id === companyId)
        resolve(company)
      }, 200)
    })
  },

  /**
   * Get company trust report
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Trust report data
   */
  getTrustReport: async (companyId) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        const company = mockCompanies.find(c => c.id === companyId)
        resolve({
          companyId,
          score: company.trustScore,
          riskLevel: company.riskLevel,
          timestamp: new Date()
        })
      }, 400)
    })
  },

  /**
   * Add company to watchlist
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Confirmation response
   */
  addToWatchlist: async (companyId) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true, companyId })
      }, 200)
    })
  },

  /**
   * Remove company from watchlist
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Confirmation response
   */
  removeFromWatchlist: async (companyId) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true, companyId })
      }, 200)
    })
  },

  /**
   * Create new company request
   * @param {Object} data - Company data
   * @returns {Promise<Object>} Request confirmation
   */
  createCompanyRequest: async (data) => {
    // TODO: Replace with actual API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          requestId: Date.now(),
          status: 'pending',
          company: data
        })
      }, 500)
    })
  }
}
