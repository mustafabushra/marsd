/**
 * Seed Utilities
 * ==============
 * Helper functions and utilities for seeding
 */

import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { Decimal } from '@prisma/client'

export class SeedUtils {
  /**
   * Hash password for storage
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
  }

  /**
   * Generate realistic CR number (Saudi Commercial Registration)
   */
  static generateCRNumber(): string {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString()
  }

  /**
   * Generate valid Saudi phone number
   */
  static generateSaudiPhone(): string {
    const numbers = ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59']
    const prefix = numbers[Math.floor(Math.random() * numbers.length)]
    return `+966${prefix}${Math.floor(1000000 + Math.random() * 9000000)}`
  }

  /**
   * Generate random Saudi city
   */
  static getRandomCity(): string {
    const cities = [
      'الرياض',
      'جدة',
      'الدمام',
      'الخبر',
      'الكويت',
      'المدينة المنورة',
      'القصيم',
      'الأحساء',
      'ينبع',
      'تبوك',
    ]
    return cities[Math.floor(Math.random() * cities.length)]
  }

  /**
   * Generate random business sector
   */
  static getRandomSector(): string {
    const sectors = [
      'مقاولات',
      'تجارة عامة',
      'استشارات',
      'لوجستيات',
      'صناعة',
      'تطوير عقاري',
      'تكنولوجيا',
      'خدمات مالية',
      'الرعاية الصحية',
      'التعليم',
    ]
    return sectors[Math.floor(Math.random() * sectors.length)]
  }

  /**
   * Generate random Arabic name
   */
  static getRandomArabicName(): { first: string; last: string } {
    const firstNames = [
      'محمد',
      'فاطمة',
      'علي',
      'سارة',
      'أحمد',
      'ليلى',
      'خالد',
      'نور',
      'عمر',
      'هند',
      'يوسف',
      'ريم',
      'محمود',
      'نادية',
      'إبراهيم',
    ]

    const lastNames = [
      'الفايز',
      'السعيد',
      'محمود',
      'الأحمد',
      'النعيم',
      'الدعيس',
      'العتيبي',
      'الخريف',
      'المقرن',
      'السويلم',
      'الحميدي',
      'الدوسري',
      'العمري',
      'الزهراني',
      'الشمري',
    ]

    return {
      first: firstNames[Math.floor(Math.random() * firstNames.length)],
      last: lastNames[Math.floor(Math.random() * lastNames.length)],
    }
  }

  /**
   * Generate random email
   */
  static generateEmail(domain: string = 'company.sa'): string {
    const adjectives = [
      'smart',
      'creative',
      'tech',
      'innovative',
      'pro',
      'expert',
    ]
    const prefix =
      adjectives[Math.floor(Math.random() * adjectives.length)] +
      Math.floor(Math.random() * 9999)
    return `${prefix}@${domain}`
  }

  /**
   * Generate trust score based on report count
   */
  static calculateTrustScore(approvedReports: number): {
    score: number
    riskBand: string
    tier: string
  } {
    let score: number
    let riskBand: string
    let tier: string

    if (approvedReports >= 10) {
      score = Math.min(100, 50 + approvedReports * 5)
      riskBand = 'low'
      tier = 'full'
    } else if (approvedReports >= 5) {
      score = Math.min(100, 40 + approvedReports * 4)
      riskBand = 'medium'
      tier = 'preliminary'
    } else if (approvedReports >= 1) {
      score = Math.min(100, 30 + approvedReports * 5)
      riskBand = 'medium'
      tier = 'preliminary'
    } else {
      score = 20
      riskBand = 'high'
      tier = 'none'
    }

    return { score, riskBand, tier }
  }

  /**
   * Generate random date within range
   */
  static getRandomDateInRange(
    startDate: Date = new Date('2020-01-01'),
    endDate: Date = new Date(),
  ): Date {
    const time = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
    return new Date(time)
  }

  /**
   * Generate random deal amount
   */
  static getRandomDealAmount(): string {
    const amounts = ['0-50k', '50k-100k', '100k-500k', '500k+']
    return amounts[Math.floor(Math.random() * amounts.length)]
  }

  /**
   * Generate random payment status
   */
  static getRandomPaymentStatus(): string {
    const statuses = ['full', 'partial', 'late', 'default']
    return statuses[Math.floor(Math.random() * statuses.length)]
  }

  /**
   * Get realistic delay days based on payment status
   */
  static getDelayDaysForStatus(status: string): number {
    switch (status) {
      case 'full':
        return 0
      case 'partial':
        return Math.floor(Math.random() * 30)
      case 'late':
        return Math.floor(Math.random() * 120) + 30
      case 'default':
        return Math.floor(Math.random() * 365) + 120
      default:
        return 0
    }
  }

  /**
   * Create batch insert data
   */
  static createBatch<T>(
    template: T,
    count: number,
    mutator?: (item: T, index: number) => T,
  ): T[] {
    const batch: T[] = []
    for (let i = 0; i < count; i++) {
      let item = { ...template }
      if (mutator) {
        item = mutator(item, i)
      }
      batch.push(item)
    }
    return batch
  }

  /**
   * Chunk array for batch processing
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Random selection from array
   */
  static randomSelect<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]
  }

  /**
   * Random selections without replacement
   */
  static randomSelectMultiple<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(count, array.length))
  }

  /**
   * Generate UUIDs
   */
  static generateUUIDs(count: number): string[] {
    return Array.from({ length: count }, () => uuid())
  }

  /**
   * Create ID with prefix
   */
  static createId(prefix: string, suffix?: string): string {
    return `${prefix}-${suffix || uuid().substring(0, 8)}`
  }

  /**
   * Parse decimal amount
   */
  static toDecimal(amount: number): Decimal {
    return new Decimal(amount.toString())
  }

  /**
   * Verify data integrity
   */
  static validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  /**
   * Generate audit trail entry
   */
  static generateAuditEntry(actorId: string, action: string, entity: string, entityId: string) {
    return {
      id: uuid(),
      actorId,
      action,
      entity,
      entityId,
      meta: {
        timestamp: new Date(),
        ip: this.generateIP(),
        userAgent: 'Seed Script',
      },
    }
  }

  /**
   * Generate random IP address
   */
  static generateIP(): string {
    return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
  }

  /**
   * Log seed progress
   */
  static logProgress(step: number, total: number, message: string): void {
    const percent = Math.round((step / total) * 100)
    const filled = Math.floor(percent / 5)
    const empty = 20 - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    console.log(`  [${bar}] ${percent}% - ${message}`)
  }

  /**
   * Log completion summary
   */
  static logSummary(counts: Record<string, number>): void {
    console.log('\n📊 Seed Summary:')
    for (const [key, count] of Object.entries(counts)) {
      console.log(`  ✓ ${key}: ${count}`)
    }
  }

  /**
   * Format phone number for display
   */
  static formatPhoneNumber(phone: string): string {
    return phone.replace(/(\+\d{3})(\d{2})(\d{7})/, '$1 $2 $3')
  }

  /**
   * Get random date within last N days
   */
  static getRecentDate(daysAgo: number): Date {
    return new Date(Date.now() - Math.random() * daysAgo * 24 * 60 * 60 * 1000)
  }

  /**
   * Generate realistic company sizes
   */
  static getCompanySize(): string {
    const sizes = ['small', 'medium', 'large', 'enterprise']
    return sizes[Math.floor(Math.random() * sizes.length)]
  }

  /**
   * Generate subscription period dates
   */
  static getSubscriptionPeriod(
    monthsDuration: number = 1,
  ): { start: Date; end: Date } {
    const start = new Date()
    const end = new Date(start.getTime() + monthsDuration * 30 * 24 * 60 * 60 * 1000)
    return { start, end }
  }
}

export default SeedUtils
