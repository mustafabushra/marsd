/**
 * Role-based access control utilities
 * Source: BUSINESS_RULES_MATRIX.md
 */

export type UserRole = 'owner' | 'admin' | 'manager' | 'viewer'

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
  canViewFull: boolean // Full access to all data
}

const rolePermissions: Record<UserRole, RolePermission> = {
  owner: {
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
  admin: {
    canAddReport: true,
    canManageUsers: true,
    canEditCompany: false, // Can't edit company name
    canViewSubscription: true,
    canCancelSubscription: false,
    canChangeSubscription: false,
    canViewAnalytics: true,
    canViewUsers: true,
    canInviteUsers: true,
    canDeleteUsers: false,
    canChangeRoles: false,
    canViewFull: true,
  },
  manager: {
    canAddReport: true,
    canManageUsers: false,
    canEditCompany: true,
    canViewSubscription: true,
    canCancelSubscription: false,
    canChangeSubscription: false,
    canViewAnalytics: true,
    canViewUsers: false,
    canInviteUsers: false,
    canDeleteUsers: false,
    canChangeRoles: false,
    canViewFull: true,
  },
  viewer: {
    canAddReport: false,
    canManageUsers: false,
    canEditCompany: false,
    canViewSubscription: false,
    canCancelSubscription: false,
    canChangeSubscription: false,
    canViewAnalytics: true,
    canViewUsers: false,
    canInviteUsers: false,
    canDeleteUsers: false,
    canChangeRoles: false,
    canViewFull: false,
  },
}

export function getPermissions(role: UserRole | null | undefined): RolePermission {
  if (!role) return rolePermissions.viewer
  return rolePermissions[role] || rolePermissions.viewer
}

export function canPerform(
  role: UserRole | null | undefined,
  action: keyof RolePermission
): boolean {
  const permissions = getPermissions(role)
  return permissions[action] || false
}

export function hasRole(
  role: UserRole | null | undefined,
  ...allowedRoles: UserRole[]
): boolean {
  if (!role) return false
  return allowedRoles.includes(role)
}
