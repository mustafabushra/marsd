/**
 * What each role may do, in the vocabulary the database actually uses.
 *
 * Source: docs/product/BUSINESS_RULES_MATRIX.md (rules 5, 26, 59-60, 82-83).
 *
 * This file described a ladder of owner / admin / manager / viewer. No such roles
 * exist: users.role is constrained to platform_admin, company_admin,
 * company_member and reviewer, and useUserRole reads that column. So every
 * lookup missed, every miss fell through to the viewer row, and every permission
 * in the application resolved to false — the dashboard told a company admin
 * "لا توجد صلاحية" on the button for the one action the whole platform is built
 * around, and the report page disabled it the same way.
 *
 * It failed closed, which is why it was survivable and why nobody traced it: a
 * disabled button with a plausible reason looks like policy, not like a typo in
 * a lookup key.
 *
 * These checks decide what the interface offers. They are not what protects the
 * data — RLS is — and both must agree; this file is the half a user can see.
 */

export type UserRole = 'platform_admin' | 'company_admin' | 'company_member' | 'reviewer'

export interface RolePermission {
  canAddReport: boolean
  canManageUsers: boolean
  canEditCompany: boolean
  canViewSubscription: boolean
  canCancelSubscription: boolean
  canChangeSubscription: boolean
  canViewAnalytics: boolean
  canViewUsers: boolean
  canInviteUsers: boolean
  canDeleteUsers: boolean
  canChangeRoles: boolean
  canViewFull: boolean
}

const NONE: RolePermission = {
  canAddReport: false,
  canManageUsers: false,
  canEditCompany: false,
  canViewSubscription: false,
  canCancelSubscription: false,
  canChangeSubscription: false,
  canViewAnalytics: false,
  canViewUsers: false,
  canInviteUsers: false,
  canDeleteUsers: false,
  canChangeRoles: false,
  canViewFull: false,
}

const rolePermissions: Record<UserRole, RolePermission> = {
  // Runs Marsad. Company administration is a subset of this, not a separate
  // ladder — which is what lets one account hold both jobs.
  platform_admin: {
    canAddReport: true,
    canManageUsers: true,
    canEditCompany: true,
    canViewSubscription: true,
    canCancelSubscription: true,
    canChangeSubscription: true,
    canViewAnalytics: true,
    canViewUsers: true,
    canInviteUsers: true,
    canDeleteUsers: true,
    canChangeRoles: true,
    canViewFull: true,
  },

  // Owns the company account: the person who signed up, invited the others, and
  // is answerable for what the company publishes about the market.
  company_admin: {
    canAddReport: true,
    canManageUsers: true,
    canEditCompany: true,
    canViewSubscription: true,
    canCancelSubscription: true,
    canChangeSubscription: true,
    canViewAnalytics: true,
    canViewUsers: true,
    canInviteUsers: true,
    canDeleteUsers: true,
    canChangeRoles: true,
    canViewFull: true,
  },

  // Staff invited by the admin. Contributing is the point of the seat — Give to
  // Get credits the company, not the individual, so a member who cannot file a
  // report is a seat that costs the company its own economy. Everything that
  // binds the company — its public profile, its billing, who else gets in —
  // stays with the admin.
  company_member: {
    ...NONE,
    canAddReport: true,
    canViewAnalytics: true,
    canViewSubscription: true,
    canViewUsers: true,
    canViewFull: true,
  },

  // Reviews submissions on Marsad's behalf. Reads everything, owns no company.
  reviewer: {
    ...NONE,
    canViewAnalytics: true,
    canViewFull: true,
  },
}

/** An unknown role grants nothing. Failing closed is the only safe default. */
export function getPermissions(role: UserRole | string | null | undefined): RolePermission {
  if (!role) return NONE
  return rolePermissions[role as UserRole] || NONE
}

export function canPerform(
  role: UserRole | string | null | undefined,
  action: keyof RolePermission
): boolean {
  return getPermissions(role)[action] === true
}

export function hasRole(
  role: UserRole | string | null | undefined,
  ...allowedRoles: UserRole[]
): boolean {
  if (!role) return false
  return allowedRoles.includes(role as UserRole)
}
