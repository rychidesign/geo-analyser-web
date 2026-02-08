# Follow-up Queries Testing Guide

## ✅ Implementace Dokončena

Follow-up queries byly přidány do queue workeru (`/api/cron/process-queue/route.ts`).

### Co bylo změněno:

1. **`lib/ai/index.ts`**
   - `callGEOQuery()` nyní podporuje conversation history
   - Signatura: `callGEOQuery(model, query, language?, conversationHistory?)`

2. **`app/api/cron/process-queue/route.ts`**
   - `processScan()` nyní podporuje follow-up queries
   - Přepočítává `totalOperations` včetně follow-ups
   - Pro každý query spustí initial + follow-up queries
   - Ukládá results s `follow_up_level`, `parent_result_id`, `follow_up_query_used`

---

## 🧪 Testovací Scénáře

### 1. **Test: Scan BEZ Follow-ups**

**Nastavení:**
- Vytvořte projekt
- Nastavte `follow_up_enabled = false` (nebo nechte vypnuté)
- Přidejte 2 queries
- Vyberte 2 modely

**Očekávaný výsledek:**
- Total operations: `2 × 2 = 4`
- Všechny results mají `follow_up_level = 0`
- Progress: 1/4, 2/4, 3/4, 4/4
- Scan dokončen za ~30-60 sekund

---

### 2. **Test: Scan S Follow-ups (Depth=1)**

**Nastavení:**
- Vytvořte projekt
- Nastavte `follow_up_enabled = true` a `follow_up_depth = 1`
- Přidejte 2 queries (různé query_type: informational, transactional)
- Vyberte 2 modely

**Očekávaný výsledek:**
- Total operations: `2 × 2 × 2 = 8` (initial + 1 follow-up)
- Pro každou query:
  - 1x result s `follow_up_level = 0` (initial)
  - 1x result s `follow_up_level = 1` (follow-up)
- Progress: 1/8, 2/8, ..., 8/8
- Follow-up results mají:
  - `parent_result_id` odkazuje na initial result
  - `follow_up_query_used` obsahuje follow-up otázku
- Scan dokončen za ~1-2 minuty

**Ověření follow-up otázek:**
- Pro `informational`: "Can you elaborate more on your top recommendations?"
- Pro `transactional`: "Which option would you specifically recommend to buy and why?"
- Pro `comparison`: "Can you rank these options and explain your reasoning?"

---

### 3. **Test: Scan S Follow-ups (Depth=2)**

**Nastavení:**
- `follow_up_enabled = true` a `follow_up_depth = 2`
- 1 query, 1 model (pro rychlý test)

**Očekávaný výsledek:**
- Total operations: `1 × 1 × 3 = 3` (initial + 2 follow-ups)
- Results:
  - Level 0: Initial response
  - Level 1: První follow-up
  - Level 2: Druhý follow-up
- Progress: 1/3, 2/3, 3/3
- Conversation history se buduje (každý follow-up vidí předchozí konverzaci)

---

### 4. **Test: Cancellation Během Follow-ups**

**Nastavení:**
- `follow_up_depth = 3`
- 3 queries, 2 modely (= 24 operations)

**Akce:**
- Spusťte scan
- Po 30 sekundách (když běží follow-ups) klikněte "Cancel"

**Očekávaný výsledek:**
- Scan se zastaví okamžitě nebo po dokončení aktuální operace
- Status: `cancelled`
- Částečné results jsou uložené
- Queue item má status `cancelled`

---

### 5. **Test: Conversational Persistence**

**Nastavení:**
- `follow_up_depth = 2`
- 1 query typu `informational` o vaší značce
- 1 model (např. `gpt-5-mini`)

**Co sledovat:**
- **Level 0**: AI zmíní vaši značku?
- **Level 1**: Po otázce "Can you elaborate more..." - stále zmíní značku?
- **Level 2**: Po otázce "What specific features..." - ještě pořád značku zmíní?

**Očekávaný výsledek:**
- `visibility_score` by měl být > 0 ve všech levelech (pokud je značka relevantní)
- Můžete vidět persistence score v UI (pokud implementováno)

---

### 6. **Test: Multi-Language Follow-ups**

**Nastavení:**
- Vytvořte projekt s `language = 'cs'` (Czech)
- `follow_up_depth = 1`
- Query: "Jaké jsou nejlepší nástroje pro projektový management?"

**Očekávaný výsledek:**
- Initial response v češtině
- Follow-up question v češtině: "Můžeš více rozvést svá hlavní doporučení?"
- Follow-up response v češtině

---

## 📊 Co Kontrolovat

### V Databázi (scan_results):

```sql
SELECT 
  query_text,
  model,
  follow_up_level,
  follow_up_query_used,
  parent_result_id,
  SUBSTRING(ai_response_raw, 1, 100) as response_preview,
  metrics_json->'visibility_score' as visibility,
  metrics_json->'recommendation_score' as recommendation
FROM scan_results
WHERE scan_id = 'YOUR_SCAN_ID'
ORDER BY query_text, model, follow_up_level;
```

### V Diagnostice:

1. **Progress Tracking**
   - Kontrola, že `progress_current` a `progress_total` správně reflektují follow-ups
   - Message by měla ukazovat "Follow-up 1/2..." apod.

2. **Cost**
   - S follow-ups je cost výrazně vyšší (2x-4x podle depth)
   - Zkontrolujte `total_cost_usd` v scans table

3. **Results Count**
   - `total_results` = queries × models × (1 + follow_up_depth)

---

## 🐛 Možné Problémy

### Problem: Follow-ups se nespustí

**Kontrola:**
1. Je `follow_up_enabled = true` v projektu?
2. Je `follow_up_depth > 0`?
3. Podívejte se do worker logů (Vercel logs)

### Problem: Follow-up v jiném jazyce než očekávám

**Kontrola:**
1. Je správně nastavený `language` v projektu?
2. Zkontrolujte `lib/scan/follow-up-templates.ts` - existuje překlad?

### Problem: Conversation history nefunguje

**Kontrola:**
1. Podívejte se na `ai_response_raw` v follow-up results
2. Zmínuje AI předchozí konverzaci?
3. Zkontrolujte, že `callGEOQuery` dostává `conversationHistory` parametr

### Problem: Worker timeout

**Řešení:**
- Follow-ups výrazně prodlužují scan
- Možná potřebujete zvýšit `maxDuration` v `route.ts`
- Nebo snížit `follow_up_depth`

---

## 📈 Performance

### Typické časy:

| Konfigurace | Operations | Čas (odhad) |
|-------------|-----------|-------------|
| 4 queries × 2 models, no follow-ups | 8 | ~1 min |
| 4 queries × 2 models, depth=1 | 16 | ~2-3 min |
| 4 queries × 2 models, depth=2 | 24 | ~3-4 min |
| 4 queries × 2 models, depth=3 | 32 | ~4-6 min |

**Závislosti:**
- Rychlost modelu (GPT-5-nano je rychlejší než Claude)
- Délka responses
- Network latency

---

## ✅ Checklist

- [ ] Test 1: Scan bez follow-ups funguje
- [ ] Test 2: Scan s depth=1 funguje
- [ ] Test 3: Scan s depth=2 funguje
- [ ] Test 4: Cancellation funguje
- [ ] Test 5: Conversation persistence funguje
- [ ] Test 6: Multi-language funguje
- [ ] Progress tracking je přesný
- [ ] Cost calculation je správný
- [ ] Results mají správné `follow_up_level`
- [ ] Parent-child relationships jsou správné

---

## 🚀 Po Testech

Pokud vše funguje:
1. Nasaďte na produkci
2. Monitorujte první scany s follow-ups
3. Zkontrolujte Vercel logs pro chyby
4. Sledujte cost (může být překvapivě vysoký)

**Důležité:** Follow-ups VÝRAZNĚ zvyšují náklady a čas scanů. Ujistěte se, že uživatelé to chápou!
