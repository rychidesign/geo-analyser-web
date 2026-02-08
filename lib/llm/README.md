# ⚠️ DEPRECATED: lib/llm

**Status:** Deprecated (2026-02-02)  
**Replacement:** Use `lib/ai` instead

## Why Deprecated?

This module (`lib/llm`) is the **old implementation** that:
- Uses direct provider-specific API calls
- Supports user-stored API keys from database
- Has **outdated model pricing** (e.g., sonar-reasoning-pro: $1/$4 instead of $2/$8)
- Duplicates model definitions with `lib/ai/providers.ts`

## What to Use Instead

**New implementation:** `lib/ai`
- Uses Vercel AI SDK with Gateway support
- Centralized model definitions in `lib/ai/providers.ts`
- **Up-to-date pricing** from database migrations
- Better error handling and monitoring
- Supports model aliases for backward compatibility

## Migration Guide

### Before (lib/llm)
```typescript
import { callLLM, type LLMModel } from '@/lib/llm'
import { AVAILABLE_MODELS } from '@/lib/llm/types'

const result = await callLLM(
  { provider: 'openai', apiKey: key, model: 'gpt-5-mini' },
  systemPrompt,
  userPrompt
)
```

### After (lib/ai)
```typescript
import { callAI, type LLMModel } from '@/lib/ai'
import { AVAILABLE_MODELS } from '@/lib/ai'

const result = await callAI({
  model: 'gpt-5-mini',
  systemPrompt,
  userPrompt,
})
```

## Files in This Module

- `index.ts` - Main entry (uses provider-specific calls)
- `openai.ts`, `anthropic.ts`, etc. - Direct API implementations
- ~~`types.ts`~~ - **DELETED** (use `lib/ai` instead)

## When to Use lib/llm

**Legacy code using user-stored API keys has been removed.**

All scan functionality now uses:
- `lib/ai` - Unified AI module with Vercel AI Gateway
- Chunked scan API (`/api/projects/[id]/scan/chunk`)
- Resilience scoring with persistence metrics

## Removal Plan

1. ✅ Migrate all type imports to `lib/ai`
2. ✅ Update `lib/ai` with backward compatibility exports
3. ⚠️ Mark old scan endpoints as deprecated
4. 🔜 Remove user API keys feature (enforce Gateway)
5. 🔜 Delete `lib/llm` entirely
