# Bezpečnostní testy GEO Analyser

Tento adresář obsahuje komplexní bezpečnostní testy aplikace zaměřené na identifikaci běžných bezpečnostních zranitelností.

## 📋 Testované útoky

### 1. **Hromadné zakládání účtů (Mass Account Creation)**
- Testuje, zda je možné rychle vytvořit velké množství účtů
- Ověřuje existenci rate limitingu na registraci
- **Závažnost**: CRITICAL

### 2. **Brute Force útoky na přihlášení**
- Pokouší se prolomit heslo opakovanými pokusy
- Testuje ochranu proti slovníkovým útokům
- **Závažnost**: CRITICAL

### 3. **Neautorizovaný přístup k API**
- Pokouší se přistoupit k chráněným endpointům bez autentizace
- Ověřuje, že všechny API endpointy vyžadují platný JWT token
- **Závažnost**: CRITICAL

### 4. **SQL Injection**
- Testuje odolnost databázových dotazů proti SQL injection útokům
- Používá běžné SQL injection payloady
- **Závažnost**: CRITICAL

### 5. **XSS (Cross-Site Scripting)**
- Ověřuje, že aplikace správně escapuje uživatelský vstup
- Testuje ochranu React/Next.js proti XSS
- **Závažnost**: HIGH

### 6. **IDOR (Insecure Direct Object References)**
- Testuje, zda uživatelé mohou přistupovat k cizím projektům
- Ověřuje kontrolu vlastnictví u všech operací
- **Závažnost**: CRITICAL

### 7. **Admin Endpoint ochrana**
- Ověřuje, že admin endpointy jsou přístupné pouze administrátorům
- Testuje správnou implementaci role-based access control
- **Závažnost**: CRITICAL

### 8. **Session Management & JWT**
- Testuje správu sessions a validaci JWT tokenů
- Ověřuje, že neplatné nebo vypršelé tokeny jsou odmítnuty
- **Závažnost**: CRITICAL

### 9. **CSRF Protection**
- Ověřuje ochranu proti Cross-Site Request Forgery útokům
- Testuje použití správných HTTP headerů
- **Závažnost**: MEDIUM

### 10. **API Rate Limiting**
- Testuje, zda jsou API endpointy chráněny proti nadměrnému používání
- Ověřuje implementaci rate limitingu
- **Závažnost**: HIGH

## 🚀 Spuštění testů

### Předpoklady
```bash
# Nainstalujte závislosti
npm install

# Ujistěte se, že máte správně nastavené environment variables
cp .env.example .env.local
```

### Spuštění

**Lokální prostředí:**
```bash
npm run test:security
```

**Nebo přímo:**
```bash
npx ts-node tests/security/security-tests.ts
```

**S vlastním BASE_URL:**
```bash
BASE_URL=http://localhost:3000 npx ts-node tests/security/security-tests.ts
```

**Production test (POZOR!):**
```bash
BASE_URL=https://your-production-url.com npx ts-node tests/security/security-tests.ts
```

## ⚠️ Důležité upozornění

- **NIKDY** nespouštějte tyto testy na produkčním prostředí bez souhlasu!
- Testy vytváří testovací účty a projekty - může to způsobit spam
- Některé testy mohou spustit rate limiting nebo bezpečnostní alarmy
- Používejte pouze na vývojovém nebo staging prostředí

## 📊 Interpretace výsledků

### Úrovně závažnosti:
- **CRITICAL** 🔴: Okamžitě opravit! Kritická bezpečnostní chyba
- **HIGH** 🟣: Vysoké riziko, opravit co nejdříve
- **MEDIUM** 🟡: Střední riziko, naplánovat opravu
- **LOW** 🔵: Nízké riziko, doporučeno vylepšit

### Výstup testu:
```
✓ PASS [LOW] Test name - Test prošel
✗ FAIL [CRITICAL] Test name - Test selhal (kritický problém!)
```

## 🛡️ Doporučení

### Minimální bezpečnostní opatření:
1. ✅ Supabase Auth (JWT tokeny)
2. ✅ Row Level Security (RLS) v Supabase
3. ✅ API route ochrana (user auth check)
4. ✅ Ownership verification (projekty)
5. ⚠️ Rate limiting (doporučeno implementovat)
6. ⚠️ CAPTCHA pro registraci (doporučeno)
7. ⚠️ Advanced security headers (doporučeno)

### Implementace rate limitingu:
```typescript
// middleware.ts
import { ratelimit } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  
  if (!success) {
    return new Response('Too Many Requests', { status: 429 })
  }
  
  return await updateSession(request)
}
```

### Implementace CAPTCHA:
```typescript
// Pro registraci a kritické operace
import { verifyCaptcha } from '@/lib/captcha'

const captchaValid = await verifyCaptcha(captchaToken)
if (!captchaValid) {
  return { error: 'Invalid captcha' }
}
```

### Security Headers (next.config.js):
```javascript
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
  ]
}
```

## 🔍 Monitorování

### Co monitorovat:
1. Opakované neúspěšné pokusy o přihlášení
2. Neobvyklá API aktivita (vysoký počet requestů)
3. Pokusy o přístup k admin endpointům
4. SQL injection pokusy v logách
5. Abnormální vytváření účtů

### Nástroje:
- Supabase Dashboard (Auth logs)
- Vercel Analytics (pokud je nasazeno na Vercelu)
- Sentry pro error tracking
- Custom logging middleware

## 📝 Changelog

- **v1.0.0** -初始版本测试套件
  - 10 bezpečnostních testů
  - Automatická detekce zranitelností
  - Barevný výstup a reporting

## 🤝 Přispívání

Pokud najdete další bezpečnostní problémy nebo máte nápady na nové testy:
1. Vytvořte issue s detailním popisem
2. Navrhněte nový test
3. Otestujte na lokálním prostředí

## 📚 Další zdroje

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/security)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
