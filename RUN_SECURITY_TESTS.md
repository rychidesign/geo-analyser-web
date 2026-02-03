# 🛡️ Spuštění bezpečnostních testů

## Rychlý start (3 kroky):

### 1. Nainstalujte nové závislosti
```bash
npm install
```

### 2. Spusťte aplikaci (v tomto terminálu)
```bash
npm run dev
```
Počkejte, až uvidíte "Ready" nebo otevřete http://localhost:3000 v prohlížeči.

### 3. V NOVÉM terminálu spusťte testy
```bash
npm run test:security
```

## Co testy dělají?

Testy automaticky:
- ✅ Vytvoří několik testovacích účtů
- ✅ Zkusí různé typy útoků
- ✅ Otestují všechny API endpointy
- ✅ Vygenerují bezpečnostní report

**Poznámka:** Testy jsou navrženy tak, aby NEŠKOILY aplikaci - pouze testují, zda je správně chráněná.

## Výsledky

Na konci uvidíte report jako:
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              VÝSLEDNÝ REPORT                                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Celkem testů: 10
✓ Prošlo: X
✗ Selhalo: Y
```

- **✓ PASS (zelená)** = Aplikace je chráněna ✅
- **✗ FAIL (červená)** = Nalezena zranitelnost ⚠️

## Co dělat s výsledky?

1. **Všechny testy prošly** 🎉
   - Skvělé! Aplikace má dobré základní zabezpečení
   - Přečtěte si doporučení pro další vylepšení

2. **Některé testy selhaly** ⚠️
   - Zkontrolujte závažnost (CRITICAL, HIGH, MEDIUM, LOW)
   - Implementujte doporučené opravy z reportu
   - Spusťte testy znovu

## Detailní dokumentace

- `tests/security/README.md` - Kompletní dokumentace
- `tests/security/QUICKSTART.md` - Podrobný průvodce
- `tests/security/SECURITY_REPORT.md` - Bezpečnostní audit

## Implementace doporučených vylepšení

### Priority HIGH: Rate Limiting

Přidejte do `middleware.ts`:

```typescript
import { apiRateLimiter } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  // Rate limiting pro API
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    
    try {
      await apiRateLimiter.check(100, ip)
    } catch {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests' }),
        { status: 429 }
      )
    }
  }
  
  return await updateSession(request)
}
```

### Priority MEDIUM: Security Headers

Přidejte do `next.config.js`:

```javascript
const { securityHeaders } = require('./lib/security-headers')

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

---

**Připraveno k testování!** 🚀
