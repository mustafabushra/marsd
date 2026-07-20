import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '../enums/user-role.enum'
import { Permission } from '../enums/permission.enum'

/**
 * Role-Based Access Control (RBAC) Guard
 * Checks user roles and permissions based on route metadata
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('مستخدم غير معرّف')
    }

    // Check if route is public
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler())
    if (isPublic) {
      return true
    }

    // Get required roles from metadata
    const requiredRoles = this.reflector.get<string[]>('allowRoles', context.getHandler())
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException(
          `هذا الإجراء يتطلب أحد الأدوار التالية: ${requiredRoles.join(', ')}`
        )
      }
    }

    // Get required permissions from metadata
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler()
    )
    if (requiredPermissions && requiredPermissions.length > 0) {
      if (!this.hasPermissions(user.role, requiredPermissions)) {
        throw new ForbiddenException('ليس لديك صلاحية للوصول إلى هذا المورد')
      }
    }

    return true
  }

  /**
   * Check if user has required permissions based on role
   */
  private hasPermissions(role: string, requiredPermissions: string[]): boolean {
    const rolePermissions = this.getRolePermissions(role)
    return requiredPermissions.every(permission => rolePermissions.includes(permission))
  }

  /**
   * Get all permissions for a given role
   */
  private getRolePermissions(role: string): string[] {
    const permissionMap: Record<string, string[]> = {
      [UserRole.COMPANY_MEMBER]: [
        Permission.VIEW_COMPANY_DATA,
        Permission.VIEW_REPORTS,
        Permission.CREATE_REPORTS,
      ],
      [UserRole.COMPANY_ADMIN]: [
        Permission.VIEW_COMPANY_DATA,
        Permission.VIEW_REPORTS,
        Permission.CREATE_REPORTS,
        Permission.MANAGE_USERS,
        Permission.MANAGE_TEAM,
        Permission.MANAGE_SETTINGS,
        Permission.MANAGE_SUBSCRIPTIONS,
      ],
      [UserRole.PLATFORM_ADMIN]: [
        Permission.VIEW_ALL_DATA,
        Permission.MANAGE_ALL_USERS,
        Permission.MANAGE_ALL_COMPANIES,
        Permission.MANAGE_REPORTS,
        Permission.MANAGE_SETTINGS,
        Permission.MANAGE_PLANS,
        Permission.VIEW_ANALYTICS,
        Permission.MANAGE_SUPPORT_TICKETS,
      ],
      [UserRole.REVIEWER]: [
        Permission.VIEW_REPORTS,
        Permission.REVIEW_REPORTS,
        Permission.REQUEST_REPORT_INFO,
      ],
    }

    return permissionMap[role] || []
  }
}
