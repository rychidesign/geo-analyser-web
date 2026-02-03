# 🚀 Rychlý start - Bezpečnostní testy

## Krok 1: Instalace závislostí

```bash
npm install
```

Tím se nainstalují:
- `lru-cache` - Pro rate limiting
- `ts-node` - Pro spuštění TypeScript testů
- `@supabase/supabase-js` - Už nainstalováno

## Krok 2: Ujistěte se, že máte .env.local

```bash
# Zkontrolujte, že máte tyto proměnné
cat .env.local | grep SUPABASE
```

Měli byste vidět:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

## Krok 3: Spusťte aplikaci (v novém terminálu)

```bash
npm run dev
```

Počkejte, až aplikace běží na `http://localhost:3000`

## Krok 4: Spusťte bezpečnostní testy

V druhém terminálu:

```bash
npm run test:security
```

## Co čekat?

Test může trvat 2-5 minut a provede:

1. ✅ **Hromadné zakládání účtů** - Pokusí se vytvořit 10 účtů rychle za sebou
2. ✅ **Brute force útoky** - Pokusí se 10x neúspěšně přihlásit
3. ✅ **Neautorizovaný přístup** - Testuje 5 API endpointů bez tokenu
4. ✅ **SQL Injection** - Zkouší 6 SQL injection payloadů
5. ✅ **XSS** - Kontroluje ochranu proti XSS
6. ✅ **IDOR** - Pokouší se přistoupit k cizím projektům
7. ✅ **Admin ochrana** - Testuje admin endpointy jako normální uživatel
8. ✅ **Session management** - Testuje JWT validaci
9. ✅ **CSRF** - Kontroluje CSRF ochranu
10. ✅ **Rate limiting** - Posílá 50 requestů rychle za sebou

## Výstup testu

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      BEZPEČNOSTNÍ TESTY GEO ANALYSER                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

================================================================================
TEST 1: Hromadné zakládání účtů
================================================================================
  Attempt 1: Account created (email: test-security-1738...)
  Attempt 2: Account created (email: test-security-1738...)
  ...

✓ PASS [MEDIUM] Hromadné zakládání účtů
  Vytvořeno 3/10 účtů za 5234ms (0.57 účtů/s). 7 pokusů selhalo.

================================================================================
TEST 2: Brute Force útok na přihlášení
================================================================================
  Attempt 1: Invalid credentials
  Attempt 2: Invalid credentials
  ...
  Attempt 4: Blocked by rate limit (GOOD)

✓ PASS [LOW] Brute Force ochrana
  4 pokusů o přihlášení, zablokováno rate limitem

...
```

## Interpretace výsledků

### ✓ PASS (Zelená) = Dobrá zpráva
- Test prošel
- Aplikace je chráněna proti tomuto typu útoku

### ✗ FAIL (Červená) = Vyžaduje pozornost
- Test selhal
- Našla se potenciální zranitelnost
- Zkontrolujte závažnost (CRITICAL, HIGH, MEDIUM, LOW)

### Závažnost:
- 🔴 **CRITICAL** - Okamžitě opravit!
- 🟣 **HIGH** - Opravit co nejdříve
- 🟡 **MEDIUM** - Naplánovat opravu
- 🔵 **LOW** - Doporučené vylepšení

## Závěrečný report

Na konci uvidíte:

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              VÝSLEDNÝ REPORT                                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Celkem testů: 10
✓ Prošlo: 8
✗ Selhalo: 2

Selhané testy podle závažnosti:
  HIGH: 2

================================================================================
DOPORUČENÍ:
================================================================================
  1. Implementovat rate limiting na API endpointy...
  2. Pravidelně aktualizovat Supabase a všechny závislosti
  ...
```

## Cleanup (volitelné)

Testy vytvoří několik testovacích účtů v Supabase. Můžete je smazat ručně přes Supabase Dashboard:

1. Přejděte na https://app.supabase.com
2. Vyberte svůj projekt
3. Authentication → Users
4. Vyhledejte `test-security-` nebo `user1-idor-` atd.
5. Smažte testovací účty

Nebo použijte SQL:

```sql
-- V Supabase SQL Editor
DELETE FROM auth.users 
WHERE email LIKE 'test-security-%@example.com' 
   OR email LIKE '%idor-%@example.com'
   OR email LIKE '%ratelimit-%@example.com'
   OR email LIKE '%csrf-%@example.com';
```

## Řešení problémů

### "Cannot find module 'lru-cache'"
```bash
npm install lru-cache
```

### "Cannot find module 'ts-node'"
```bash
npm install --save-dev ts-node
```

### "Connection refused" nebo "ECONNREFUSED"
```bash
# Ujistěte se, že aplikace běží
npm run dev

# V novém terminálu spusťte testy
npm run test:security
```

### Testy vytvářejí příliš mnoho testovacích účtů
To je normální - testy testují registraci. Supabase má rate limiting, takže většina pokusů selže. Testovací účty můžete smazat ručně nebo ignorovat.

### "Rate limit exceeded" hned na začátku
Už jste spustili testy nedávno. Počkejte 15 minut nebo použijte jiné prostředí (staging).

## Pokročilé použití

### Test pouze specifických testů

Upravte soubor `tests/security/security-tests.ts` a zakomentujte testy, které nechcete spustit:

```typescript
async function runAllTests() {
  // await testMassAccountCreation()  // Zakomentováno
  await testBruteForceLogin()
  await testUnauthorizedAPIAccess()
  // ...
}
```

### Test na jiné URL

```bash
BASE_URL=https://staging.example.com npm run test:security
```

### Automatizace v CI/CD

```yaml
# .github/workflows/security-tests.yml
name: Security Tests
on:
  schedule:
    - cron: '0 0 * * 0'  # Každou neděli

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run test:security
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

## Kontakt

Pokud najdete kritické bezpečnostní problémy, kontaktujte:
- Email: security@yourcompany.com
- GitHub Security: https://github.com/yourorg/yourrepo/security
