/**
 * Security Headers Configuration
 * Ochrana proti běžným webovým útokům
 */

export const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN' // Nebo 'DENY' pokud nechcete umožnit iframe vůbec
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  }
]

/**
 * Content Security Policy
 * Ochrana proti XSS útokům
 */
export const contentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https: blob:;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com;
  frame-ancestors 'self';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim()

/**
 * Pro použití v next.config.js:
 * 
 * const { securityHeaders, contentSecurityPolicy } = require('./lib/security-headers')
 * 
 * module.exports = {
 *   async headers() {
 *     return [
 *       {
 *         source: '/:path*',
 *         headers: [
 *           ...securityHeaders,
 *           {
 *             key: 'Content-Security-Policy',
 *             value: contentSecurityPolicy
 *           }
 *         ],
 *       },
 *     ]
 *   },
 * }
 */
