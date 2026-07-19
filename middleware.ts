import { NextRequest, NextResponse } from 'next/server'

// Protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/companies',
  '/reports',
  '/watchlist',
  '/subscriptions',
  '/search',
  '/profile',
  '/admin',
]

// Public routes that don't require authentication
const publicRoutes = [
  '/',
  '/about',
  '/pricing',
  '/faq',
  '/auth/login',
  '/auth/register',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Get auth token from cookie or localStorage (via headers)
  const token = request.cookies.get('auth_token')?.value

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // Check if route is public
  const isPublicRoute = publicRoutes.some((route) =>
    pathname === route || pathname.startsWith(route)
  )

  // If accessing protected route without token, redirect to login
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // If accessing auth routes with token, redirect to dashboard
  if (
    (pathname === '/auth/login' || pathname === '/auth/register') &&
    token
  ) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If accessing API routes, verify token
  if (pathname.startsWith('/api/protected')) {
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all routes except static files and api routes that don't need auth
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
