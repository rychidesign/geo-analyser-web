/**
 * Safe error handling for API responses.
 * 
 * In production, returns generic fallback messages to avoid leaking
 * internal details (DB schema, stack traces, etc.) to clients.
 * In development, returns the actual error message for debugging.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Returns a safe error message for API responses.
 * In production: returns the fallback message.
 * In development: returns the actual error message (or fallback if none).
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (!IS_PRODUCTION) {
    // In development, show actual error for debugging
    if (error instanceof Error) {
      return error.message || fallback
    }
    if (typeof error === 'string') {
      return error || fallback
    }
  }
  
  return fallback
}

/**
 * Logs the full error server-side and returns a sanitized message.
 * Use in catch blocks of API routes.
 */
export function handleApiError(
  error: unknown, 
  context: string, 
  fallback: string
): { message: string; status: number } {
  // Always log the full error server-side
  console.error(`[${context}]`, error)
  
  return {
    message: safeErrorMessage(error, fallback),
    status: 500,
  }
}
