# 🔧 Implementační průvodce - Bezpečnostní vylepšení

Tento dokument poskytuje konkrétní kroky pro implementaci doporučených bezpečnostních vylepšení.

---

## 1️⃣ Rate Limiting (HIGH Priority)

### Krok 1: Rate limiting v middleware

Upravte soubor `middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { apiRateLimiter } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  // Rate limiting pro API endpointy
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'anonymous'
    
    try {
      await apiRateLimiter.check(100, ip) // 100 requestů za minutu
    } catch {
      return new NextResponse(
        JSON.stringify({ 
          error: 'Too many requests. Please try again later.' 
        }),
        { 
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60' // Zkuste to znovu za 60 sekund
          }
        }
      )
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Krok 2: Rate limiting pro registraci

Upravte `app/(auth)/register/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
// ... ostatní importy
import { registrationRateLimiter } from '@/lib/rate-limit'

export default function RegisterPage() {
  // ... stávající state

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Validace hesel
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    // NOVÉ: Rate limiting kontrola
    try {
      // Získat IP adresu uživatele
      const ipResponse = await fetch('https://api.ipify.org?format=json')
      const { ip } = await ipResponse.json()
      
      // Kontrola rate limitu (max 3 registrace za hodinu z jedné IP)
      try {
        await registrationRateLimiter.check(3, ip)
      } catch {
        setError('Too many registration attempts from this IP. Please try again later.')
        setLoading(false)
        return
      }
    } catch (err) {
      console.warn('Could not check rate limit:', err)
      // Pokračujeme i při chybě (fallback na Supabase rate limiting)
    }

    // Pokračovat s registrací
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ... zbytek komponenty
}
```

**Poznámka:** Pro produkční použití zvažte získání IP na server-side pomocí API route.

---

## 2️⃣ Security Headers (MEDIUM Priority)

### Krok 1: Přidat headers do next.config.js

Vytvořte nebo upravte `next.config.js`:

```javascript
const { securityHeaders, contentSecurityPolicy } = require('./lib/security-headers')

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Aplikovat na všechny cesty
        source: '/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

### Krok 2: Testování

Po implementaci:
1. Restartujte dev server: `npm run dev`
2. Otevřete DevTools → Network
3. Zkontrolujte response headers

Měli byste vidět:
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; ...
```

---

## 3️⃣ XSS Sanitizace (MEDIUM Priority)

### Krok 1: Instalace DOMPurify

```bash
npm install dompurify isomorphic-dompurify
npm install --save-dev @types/dompurify
```

### Krok 2: Vytvořit sanitizer utility

Vytvořte `lib/sanitize.ts`:

```typescript
import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitizuje HTML obsah pro bezpečné zobrazení
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'code', 'pre',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * Sanitizuje markdown obsah (méně restriktivní)
 */
export function sanitizeMarkdown(markdown: string): string {
  return DOMPurify.sanitize(markdown, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'code', 'pre',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'div', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}
```

### Krok 3: Použít v markdown rendereru

Upravte `lib/scan/scan-report.tsx`:

```typescript
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { sanitizeMarkdown } from '@/lib/sanitize'

export function ScanReport({ aiResponse }: { aiResponse: string }) {
  // Sanitizovat před zobrazením
  const sanitizedResponse = sanitizeMarkdown(aiResponse)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      children={sanitizedResponse}
      components={{
        // Custom komponenty pro bezpečné zobrazení
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    />
  )
}
```

---

## 4️⃣ CAPTCHA (OPTIONAL - doporučeno pro produkci)

### Krok 1: Nastavení Google reCAPTCHA

1. Jděte na https://www.google.com/recaptcha/admin
2. Vytvořte nový site key (použijte reCAPTCHA v3)
3. Přidejte do `.env.local`:

```env
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key_here
RECAPTCHA_SECRET_KEY=your_secret_key_here
```

### Krok 2: Přidat reCAPTCHA do registrace

```bash
npm install react-google-recaptcha-v3
```

```typescript
// app/(auth)/register/page.tsx
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3'

function RegisterForm() {
  const { executeRecaptcha } = useGoogleReCaptcha()
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Získat reCAPTCHA token
    if (!executeRecaptcha) {
      setError('reCAPTCHA not loaded')
      return
    }
    
    const token = await executeRecaptcha('register')
    
    // Ověřit token na serveru
    const verifyResponse = await fetch('/api/verify-recaptcha', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    
    if (!verifyResponse.ok) {
      setError('reCAPTCHA verification failed')
      return
    }
    
    // Pokračovat s registrací...
  }
}

export default function RegisterPage() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}>
      <RegisterForm />
    </GoogleReCaptchaProvider>
  )
}
```

### Krok 3: Server-side verifikace

Vytvořte `app/api/verify-recaptcha/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { token } = await request.json()
  
  const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify'
  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
  })
  
  const data = await response.json()
  
  if (data.success && data.score > 0.5) {
    return NextResponse.json({ success: true })
  }
  
  return NextResponse.json({ success: false }, { status: 400 })
}
```

---

## 5️⃣ Monitoring & Logging (OPTIONAL)

### Sentry pro error tracking

```bash
npm install @sentry/nextjs
```

```javascript
// sentry.client.config.js
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})
```

### Custom security logger

Vytvořte `lib/security-logger.ts`:

```typescript
export function logSecurityEvent(event: {
  type: 'auth_failure' | 'rate_limit' | 'unauthorized_access' | 'sql_injection_attempt'
  userId?: string
  ip?: string
  details: string
}) {
  // V produkci: odeslat do monitoring služby
  console.warn('[SECURITY]', {
    timestamp: new Date().toISOString(),
    ...event,
  })
  
  // Můžete přidat odeslání do Sentry, CloudWatch, atd.
}
```

Použití:

```typescript
// V API route
if (!user) {
  logSecurityEvent({
    type: 'unauthorized_access',
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    details: `Attempted access to ${request.url}`,
  })
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

## ✅ Checklist implementace

### Minimální (HIGH Priority)
- [ ] Rate limiting v middleware
- [ ] Registrační rate limiting
- [ ] Security headers v next.config.js
- [ ] XSS sanitizace pro markdown

### Doporučené (MEDIUM Priority)
- [ ] CAPTCHA pro registraci
- [ ] Security logging
- [ ] Error monitoring (Sentry)

### Pokročilé (OPTIONAL)
- [ ] 2FA autentizace
- [ ] IP blacklisting
- [ ] Honeypot fields
- [ ] Security monitoring dashboard

---

## 🧪 Testování po implementaci

Po každé změně:

```bash
# 1. Restartujte aplikaci
npm run dev

# 2. Spusťte bezpečnostní testy
npm run test:security

# 3. Zkontrolujte výsledky
# Měli byste vidět zlepšení v testech rate limitingu
```

---

## 📚 Další zdroje

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/security)
- [Supabase Auth Best Practices](https://supabase.com/docs/guides/auth/auth-best-practices)
- [CSP Reference](https://content-security-policy.com/)

---

**Úspěšnou implementaci! 🚀**

Máte-li dotazy, konzultujte `tests/security/README.md` nebo `SECURITY_TESTING_SUMMARY.md`.
