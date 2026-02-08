# Worker Follow-up Queries - TODO

## ❌ Problém

Queue worker (`/api/cron/process-queue/route.ts`) **NEPODPORUJE follow-up queries**.

- Starý systém (`lib/scan/engine.ts`) podporuje follow-ups ✅
- Nový queue worker je nepodporuje ❌

### Důsledky:
- Follow-up queries v projektu jsou nastavené, ale neběží
- Progress calculation je špatný (nepočítá follow-ups)
- Výsledky scanů jsou neúplné

---

## 🔧 Řešení

### Varianta A: Upgradovat Worker (DOPORUČENO)

Upravit `processScan()` funkci v `/api/cron/process-queue/route.ts`:

1. **Načíst follow-up nastavení z projektu:**
```typescript
const followUpEnabled = project.follow_up_enabled
const followUpDepth = project.follow_up_depth || 1
```

2. **Přepočítat total operations:**
```typescript
const operationsPerQuery = followUpEnabled ? (1 + followUpDepth) : 1
const totalOperations = queries.length * models.length * operationsPerQuery
```

3. **Pro každý result spustit follow-ups:**
```typescript
if (followUpEnabled && followUpDepth > 0) {
  const conversationHistory = [
    { role: 'user', content: query.query_text },
    { role: 'assistant', content: response.content }
  ]
  
  for (let level = 1; level <= followUpDepth; level++) {
    const followUpQuestion = getFollowUpQuestion(
      query.query_type,
      level,
      project.language
    )
    
    const followUpResponse = await callGEOQuery(
      modelId,
      followUpQuestion,
      project.language,
      conversationHistory
    )
    
    // Save follow-up result with follow_up_level
    // Update conversation history
    // Update progress
  }
}
```

4. **Importovat potřebné funkce:**
```typescript
import { getFollowUpQuestion } from '@/lib/scan/follow-up-templates'
```

### Varianta B: Použít Starý Systém

Nahradit `processScan()` voláním `runScan()` z `lib/scan/engine.ts`:

**Výhody:**
- Okamžitě funguje
- Podporuje všechny featury (follow-ups, weighted scoring)

**Nevýhody:**
- Starý systém může mít jiné chování
- Možné konflikty s queue systémem

---

## 📋 Implementační Kroky

### 1. Přidat Follow-up Support

```typescript
// V processScan() funkci v process-queue/route.ts

// Po uložení initial result:
if (followUpEnabled && followUpDepth > 0 && initialResult) {
  const conversationHistory = [
    { role: 'user', content: query.query_text },
    { role: 'assistant', content: response.content }
  ]
  
  let parentResultId = initialResult.id
  
  for (let level = 1; level <= followUpDepth; level++) {
    // Check for cancellation
    const { data: queueStatus } = await supabase
      .from('scan_queue')
      .select('status')
      .eq('id', queueId)
      .single()
    
    if (queueStatus?.status === 'cancelled') break
    
    // Get follow-up question
    const followUpQuestion = getFollowUpQuestion(
      query.query_type as QueryType,
      level as 1 | 2 | 3,
      project.language || 'en'
    )
    
    // Call LLM with conversation history
    const followUpResponse = await callGEOQuery(
      modelId,
      followUpQuestion,
      project.language || 'en',
      conversationHistory
    )
    
    // Evaluate follow-up
    const evalResult = await callEvaluation(
      evaluationModel,
      followUpResponse.content,
      project.brand_variations || [],
      project.domain
    )
    
    // Calculate costs
    const queryCostCents = await calculateDynamicCost(modelId, followUpResponse.inputTokens, followUpResponse.outputTokens)
    const evalCostCents = await calculateDynamicCost(evaluationModel, evalResult.inputTokens, evalResult.outputTokens)
    
    // Save follow-up result
    const { data: followUpResult } = await supabase
      .from(TABLES.SCAN_RESULTS)
      .insert({
        scan_id: scanId,
        provider: modelInfo.provider,
        model: modelId,
        query_text: query.query_text, // Original query for grouping
        ai_response_raw: followUpResponse.content,
        metrics_json: evalResult.metrics,
        input_tokens: followUpResponse.inputTokens + evalResult.inputTokens,
        output_tokens: followUpResponse.outputTokens + evalResult.outputTokens,
        cost_usd: (queryCostCents + evalCostCents) / 100,
        follow_up_level: level,
        parent_result_id: parentResultId,
        follow_up_query_used: followUpQuestion,
      })
      .select()
      .single()
    
    if (followUpResult) {
      parentResultId = followUpResult.id
      totalResults++
    }
    
    // Add to conversation history
    conversationHistory.push(
      { role: 'user', content: followUpQuestion },
      { role: 'assistant', content: followUpResponse.content }
    )
    
    // Update totals
    totalCostUsd += (queryCostCents + evalCostCents) / 100
    totalCostCents += queryCostCents + evalCostCents
    totalInputTokens += followUpResponse.inputTokens + evalResult.inputTokens
    totalOutputTokens += followUpResponse.outputTokens + evalResult.outputTokens
    
    completedOperations++
    
    // Update progress
    await supabase
      .from('scan_queue')
      .update({
        progress_current: completedOperations,
        progress_total: totalOperations,
        progress_message: `Follow-up ${level}/${followUpDepth}: ${query.query_text.substring(0, 30)}... with ${modelId}`
      })
      .eq('id', queueId)
  }
}
```

### 2. Přidat Import

```typescript
import { getFollowUpQuestion } from '@/lib/scan/follow-up-templates'
import type { QueryType } from '@/lib/scan/follow-up-templates'
```

### 3. Aktualizovat callGEOQuery

Ujistit se, že `callGEOQuery` v `lib/ai/index.ts` podporuje conversation history:

```typescript
export async function callGEOQuery(
  modelId: string,
  query: string,
  language: string = 'en',
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
)
```

---

## 🧪 Testing

Po implementaci otestovat:
1. Scan bez follow-ups (existující funkčnost)
2. Scan s follow-ups depth=1
3. Scan s follow-ups depth=2
4. Scan s follow-ups depth=3
5. Cancellation během follow-ups
6. Progress tracking s follow-ups

---

## 📊 Odhadovaný Čas

- **Implementace**: 2-3 hodiny
- **Testing**: 1 hodina
- **Celkem**: 3-4 hodiny

---

## ⚠️ Poznámky

- Follow-up queries VÝRAZNĚ prodlužují scan (3x-4x delší)
- Zvýší se náklady na scan (více API calls)
- Progress bar bude přesnější s follow-ups
- Weighted scoring funguje pouze s follow-ups (viz `lib/scan/engine.ts`)
