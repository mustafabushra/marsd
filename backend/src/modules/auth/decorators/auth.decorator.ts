import { SetMetadata } from '@nestjs/common'

/**
 * Decorator to specify required roles and permissions for a route
 * @example
 * @Auth(UserRole.COMPANY_ADMIN, [Permissions.MANAGE_USERS])
 * @Post('users')
 * async createUser(@Body() dto: CreateUserDto) { ... }
 */
export const Auth = (...args: any[]) => SetMetadata('auth', args)

/**
 * Decorator to require specific roles
 * @example
 * @RequireRole(UserRole.COMPANY_ADMIN, UserRole.PLATFORM_ADMIN)
 * @Post('reports')
 */
export const RequireRole = (...roles: string[]) => SetMetadata('roles', roles)

/**
 * Decorator to require specific permissions
 * @example
 * @RequirePermission(Permissions.MANAGE_REPORTS)
 * @Delete('reports/:id')
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata('permissions', permissions)

/**
 * Decorator to skip auth guard
 * @example
 * @Public()
 * @Post('auth/login')
 */
export const Public = () => SetMetadata('isPublic', true)

/**
 * Decorator to allow multiple roles
 * @example
 * @AllowRoles('company_admin', 'platform_admin')
 * @Get('dashboard')
 */
export const AllowRoles = (...roles: string[]) => SetMetadata('allowRoles', roles)
