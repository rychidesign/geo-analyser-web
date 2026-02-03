/**
 * Rate Limiting Implementation
 * Ochrana proti nadměrnému používání API a brute force útokům
 */

import { LRUCache } from 'lru-cache'

type Options = {
  uniqueTokenPerInterval?: number
  interval?: number
}

/**
 * Rate limiter používající LRU cache
 * Pro produkční použití zvažte Redis (Upstash Redis, Vercel KV)
 */
export default function rateLimit(options?: Options) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval || 500,
    ttl: options?.interval || 60000, // 60 sekund default
  })

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = tokenCache.get(token) || [0]
        if (tokenCount[0] === 0) {
          tokenCache.set(token, [1])
          resolve()
        } else if (tokenCount[0] < limit) {
          tokenCount[0]++
          tokenCache.set(token, tokenCount)
          resolve()
        } else {
          reject(new Error('Rate limit exceeded'))
        }
      }),
  }
}

/**
 * Wrapper pro snadné použití v API routes
 */
export async function withRateLimit(
  request: Request,
  options: {
    limit?: number
    interval?: number
    identifier?: string
  } = {}
) {
  const limiter = rateLimit({
    interval: options.interval || 60000, // 1 minuta
    uniqueTokenPerInterval: 500,
  })

  // Získáme identifikátor - preferujeme IP adresu, fallback na user agent
  const identifier =
    options.identifier ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('user-agent') ||
    'anonymous'

  try {
    await limiter.check(options.limit || 10, identifier)
    return { success: true }
  } catch {
    return { 
      success: false, 
      error: 'Too many requests. Please try again later.',
      status: 429 
    }
  }
}

/**
 * Rate limiter pro Supabase Auth endpointy
 * Ochrana proti brute force útokům na přihlášení
 */
export const authRateLimiter = rateLimit({
  interval: 15 * 60 * 1000, // 15 minut
  uniqueTokenPerInterval: 1000,
})

/**
 * Rate limiter pro API endpointy
 */
export const apiRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minuta
  uniqueTokenPerInterval: 500,
})

/**
 * Rate limiter pro registraci
 * Přísnější limit pro prevenci hromadného zakládání účtů
 */
export const registrationRateLimiter = rateLimit({
  interval: 60 * 60 * 1000, // 1 hodina
  uniqueTokenPerInterval: 100,
})
