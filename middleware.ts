import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { authRateLimiter, apiRateLimiter } from '@/lib/rate-limit'

/**
 * Získá IP adresu z requestu
 */
function getClientIp(request: NextRequest): string {
  // Vercel/Cloudflare předávají skutečnou IP přes tyto headery
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for může obsahovat více IP, první je klient
    return forwardedFor.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  // Fallback
  return 'unknown'
}

/**
 * Vrátí 429 Too Many Requests response
 */
function rateLimitResponse(message: string): NextResponse {
  return new NextResponse(
    JSON.stringify({ 
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    }),
    { 
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60'
      }
    }
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ip = getClientIp(request)
  
  // Auth rate limiting - přísnější limity pro login/register endpointy
  const authPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/reset-password']
  if (authPaths.some(path => pathname.startsWith(path))) {
    try {
      // Max 5 pokusů za 15 minut pro auth endpointy
      await authRateLimiter.check(5, `auth:${ip}`)
    } catch {
      console.warn(`[Rate Limit] Auth rate limit exceeded for IP: ${ip}`)
      return rateLimitResponse('Too many authentication attempts. Please try again in 15 minutes.')
    }
  }
  
  // API rate limiting - obecný limit pro všechny API endpointy
  if (pathname.startsWith('/api/')) {
    try {
      // Max 100 requestů za minutu pro API
      await apiRateLimiter.check(100, `api:${ip}`)
    } catch {
      console.warn(`[Rate Limit] API rate limit exceeded for IP: ${ip}`)
      return rateLimitResponse('Too many requests. Please slow down.')
    }
  }

  // Pokračuj s Supabase session refresh
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
