/**
 * Centralized constants for company status values
 * Single source of truth to prevent spelling errors and mismatches
 */

export const COMPANY_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  ACTIVE: 'active',
} as const;

export type CompanyStatusType = typeof COMPANY_STATUS[keyof typeof COMPANY_STATUS];

export const COMPANY_STATUS_VALUES = Object.values(COMPANY_STATUS);
