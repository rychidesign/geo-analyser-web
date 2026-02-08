# ✅ Model Centralization - Completed

**Date:** 2026-02-02  
**Issue:** Duplicitní definice modelů v `lib/llm/types.ts` a `lib/ai/providers.ts`

## 🔍 Co bylo zjištěno

### Problém
- **Duplicitní definice:** `AVAILABLE_MODELS` existoval na 2 místech
- **Zastaralé ceny:** `lib/llm/types.ts` měl nesprávné ceny:
  - `llama-4-maverick`: output **$0.30** (správně $0.60)
  - `sonar-reasoning-pro`: input **$1.00**, output **$4.00** (správně $2.00/$8.00)
- **Nekonzistence:** Přidání/odebrání modelu by vyžadovalo změny na více místech

### Správné ceny (z databáze)
Ceny jsou definovány v `supabase/migrations/014_centralized_pricing_2026.sql`:
- `llama-4-maverick`: $0.20/$0.60 per 1M tokens ✅
- `sonar-reasoning-pro`: $2.00/$8.00 per 1M tokens ✅

## ✅ Provedené změny

### 1. Centralizace modelů
- **Jediný zdroj pravdy:** `lib/ai/providers.ts` → `AVAILABLE_MODELS`
- **Rozšířené metadata:**
  - `contextWindow` - velikost kontextového okna
  - `availableFreeTier` - dostupnost pro free tier
  - `isActive` - aktivní/neaktivní model

### 2. Backward compatibility v `lib/ai/index.ts`
```typescript
// Legacy exporty pro kód migrující z lib/llm/types
export type { AIProvider as LLMProvider, ModelInfo }
export { AVAILABLE_MODELS, getModelInfo, getModelsByProvider }
export const MODEL_PRICING = /* derived from AVAILABLE_MODELS */
export type LLMModel = 'gpt-5-2' | 'gpt-5-mini' | ... // union type
export function calculateCost(...) // wrapper pro calculateBaseCost
export const DEFAULT_MODELS = { ... } // nejlevnější modely
export function getProviderForModel(...) // wrapper
```

### 3. Migrace importů
Všechny soubory nyní importují z `@/lib/ai`:
- ✅ `app/(dashboard)/dashboard/projects/[id]/queries/page.tsx`
- ✅ `app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`
- ✅ `app/(dashboard)/dashboard/projects/new/page.tsx`
- ❌ `app/api/projects/[id]/scan/route.ts` (REMOVED - deprecated)
- ✅ `app/api/scan/save-result/route.ts`
- ❌ `lib/scan/engine.ts` (REMOVED - replaced by chunked scan API)
- ✅ `tests/lib/llm-types.test.ts`
- ✅ `scripts/test-scans.ts`

### 4. Deprecated `lib/llm/`
- ❌ **Smazáno:** `lib/llm/types.ts` (plně nahrazeno `lib/ai`)
- ⚠️ **Deprecated:** Ostatní soubory v `lib/llm/` (openai.ts, anthropic.ts, atd.)
- 📝 **Přidáno:** `lib/llm/README.md` s migration guide
- 🔜 **Plán:** Odstranit celý `lib/llm/` po migraci starého scan flow

### 5. Dokumentace a testy
- ✅ **Nový test:** `tests/lib/model-centralization.test.ts` (12 testů)
  - Ověřuje identitu AVAILABLE_MODELS mezi providers a index
  - Kontroluje správnost cen proti databázové migraci
  - Detekuje přidání/odebrání modelů (fail-fast)
- ✅ **Existující testy:** Všech 21 testů v `llm-types.test.ts` prošlo

## 📋 Jak přidat/odebrat model

### Krok 1: Aktualizuj `lib/ai/providers.ts`
```typescript
export const AVAILABLE_MODELS: ModelInfo[] = [
  // ... existing models
  {
    id: 'new-model-id',
    name: 'New Model Name',
    provider: 'openai',
    description: 'Description',
    contextWindow: 128000,
    pricing: { input: 0.50, output: 2.00 },
    availableFreeTier: true,
    isActive: true,
  },
]
```

### Krok 2: Aktualizuj `lib/ai/index.ts`
```typescript
export type LLMModel = 
  | 'gpt-5-2'
  | 'gpt-5-mini'
  | 'new-model-id'  // ← Přidej sem
  // ...
```

### Krok 3: Aktualizuj databázi (pokud potřeba)
Vytvoř novou migraci v `supabase/migrations/`:
```sql
INSERT INTO pricing_config (provider, model, base_input_cost_cents, base_output_cost_cents, ...)
VALUES ('openai', 'new-model-id', 17, 67, true, 200, true);
```

### Krok 4: Aktualizuj test
V `tests/lib/model-centralization.test.ts`:
```typescript
const EXPECTED_MODEL_COUNT = 14  // ← Změň z 13 na 14
```

### Krok 5: Spusť testy
```bash
npx vitest run tests/lib/
```

## 🎯 Výsledek

### ✅ Centralizace
- **1 zdroj pravdy:** `lib/ai/providers.ts`
- **Automatická propagace:** Změna v AVAILABLE_MODELS se promítne všude
- **Správné ceny:** Synchronizováno s databází

### ✅ Testování
- **33 testů celkem:** 21 (llm-types) + 12 (centralization)
- **Detekce změn:** Test selže, pokud přidáš/odebereš model bez aktualizace
- **Ověření cen:** Kontrola proti databázové migraci

### ✅ Backward compatibility
- **Žádné breaking changes:** Starý kód funguje díky re-exportům
- **Postupná migrace:** `lib/llm` zůstává pro legacy flow

## 🔜 Další kroky (volitelné)

1. **Odstranit user API keys:** Vynutit použití Gateway
2. **Smazat `lib/llm/`:** Po migraci starého scan flow
3. **Automatizovat sync:** Script pro sync mezi AVAILABLE_MODELS a DB

---

**Status:** ✅ Hotovo a otestováno  
**Testy:** ✅ 33/33 passed  
**Breaking changes:** ❌ Žádné
