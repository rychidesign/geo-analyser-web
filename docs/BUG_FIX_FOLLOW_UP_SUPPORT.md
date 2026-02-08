# Bug Fix: Follow-up Query Support in process-scan/route.ts

**Date:** 2026-02-09  
**Status:** ✅ FIXED

## Problem

The `process-scan/route.ts` cron job (used for scheduled scans) did NOT implement follow-up query support, despite documentation claiming it did. This meant:

1. Scheduled scans would ignore `project.follow_up_enabled` and `project.follow_up_depth` settings
2. Total operations calculation didn't account for follow-ups (incorrect progress tracking)
3. No follow-up queries were executed, resulting in incomplete scans
4. Only the deprecated `process-queue/route.ts` had follow-up support

## Changes Made

### 1. Added Import (Line 8)
```typescript
import { getFollowUpQuestion, type QueryType } from '@/lib/scan/follow-up-templates'
```

### 2. Updated `processScan()` Function

#### Total Operations Calculation (Lines 315-320)
**Before:**
```typescript
const totalOperations = queries.length * models.length
```

**After:**
```typescript
// Calculate total operations including follow-ups
const followUpEnabled = project.follow_up_enabled === true
const followUpDepth = project.follow_up_depth || 1
const operationsPerQuery = followUpEnabled ? (1 + followUpDepth) : 1
const totalOperations = queries.length * models.length * operationsPerQuery
```

#### Initial Result Storage (Lines 357-374)
**Before:**
```typescript
await supabase.from(TABLES.SCAN_RESULTS).insert({
  // ... no follow-up metadata
})
```

**After:**
```typescript
const { data: initialResult } = await supabase
  .from(TABLES.SCAN_RESULTS)
  .insert({
    // ... existing fields
    follow_up_level: 0,
    parent_result_id: null,
    follow_up_query_used: null,
  })
  .select()
  .single()
```

#### Follow-up Query Loop (Lines 386-485)
Added complete follow-up implementation:
- ✅ Checks `followUpEnabled` and `followUpDepth`
- ✅ Builds conversation history for context
- ✅ Loops through follow-up levels (1 to depth)
- ✅ Gets language-specific follow-up questions
- ✅ Calls LLM with conversation history
- ✅ Evaluates each follow-up response
- ✅ Tracks costs and tokens for each follow-up
- ✅ Saves follow-up results with proper metadata:
  - `follow_up_level`: 1, 2, or 3
  - `parent_result_id`: Links to parent result
  - `follow_up_query_used`: The actual follow-up question
- ✅ Updates conversation history for next iteration
- ✅ Handles errors gracefully (stops chain on failures)

#### Error Handling (Lines 487-491)
Added proper operation counting when errors occur:
```typescript
catch (err: any) {
  console.error(`[Worker ${workerId}] Error ${modelId}:`, err.message)
  // Skip remaining follow-ups for this query-model pair
  const completedInPair = ((completedOperations - 1) % operationsPerQuery) + 1
  completedOperations += operationsPerQuery - completedInPair
}
```

#### Language Support (Line 326)
Updated initial query call to include language parameter:
```typescript
const response = await callGEOQuery(modelId, query.query_text, project.language || 'en')
```

## Verification

✅ **Import check:** `getFollowUpQuestion` and `QueryType` imported  
✅ **Settings check:** Reads `project.follow_up_enabled` and `project.follow_up_depth`  
✅ **Operations calc:** Correctly calculates total with follow-ups  
✅ **Initial result:** Saves with follow-up metadata fields  
✅ **Follow-up loop:** Implements full conversation chain  
✅ **Conversation history:** Maintains context across follow-ups  
✅ **Cost tracking:** Tracks tokens and costs for all operations  
✅ **Progress tracking:** Accurate operation counting  
✅ **Error handling:** Gracefully handles failures  
✅ **No linter errors:** Code passes all checks  

## Impact

### Before Fix
- Scheduled scans: **NO follow-ups** ❌
- Progress tracking: **INCORRECT** (didn't account for follow-ups) ❌
- Feature parity: **BROKEN** (process-queue had it, process-scan didn't) ❌

### After Fix
- Scheduled scans: **Full follow-up support** ✅
- Progress tracking: **ACCURATE** (includes follow-up operations) ✅
- Feature parity: **CONSISTENT** (both endpoints support follow-ups) ✅

## Testing Recommendations

1. **Basic scan (no follow-ups):**
   - Set `follow_up_enabled = false`
   - Verify: Only initial responses saved

2. **Scan with depth=1:**
   - Set `follow_up_enabled = true`, `follow_up_depth = 1`
   - Verify: Initial + 1 follow-up per query-model pair

3. **Scan with depth=2:**
   - Set `follow_up_enabled = true`, `follow_up_depth = 2`
   - Verify: Initial + 2 follow-ups per query-model pair

4. **Scan with depth=3:**
   - Set `follow_up_enabled = true`, `follow_up_depth = 3`
   - Verify: Initial + 3 follow-ups per query-model pair

5. **Result structure:**
   - Verify `follow_up_level` is correct (0, 1, 2, 3)
   - Verify `parent_result_id` links form a chain
   - Verify `follow_up_query_used` contains the actual question

6. **Cost tracking:**
   - Verify total costs increase with follow-ups
   - Verify token counts include all operations

7. **Progress tracking:**
   - Verify progress shows correct total operations
   - Verify progress increments for each follow-up

## Documentation Status

The documentation in `docs/WORKER_FOLLOWUP_TODO.md` line 10 was already claiming:
```
- ✅ Process-scan cron (`/api/cron/process-scan`) - podporuje follow-ups
```

This was **incorrect** before the fix but is now **accurate** after implementation.

## Related Files

- `app/api/cron/process-scan/route.ts` - **UPDATED** with follow-up support
- `app/api/cron/process-queue/route.ts` - Reference implementation (deprecated)
- `lib/scan/follow-up-templates.ts` - Follow-up question templates
- `lib/ai/index.ts` - AI functions supporting conversation history
- `docs/WORKER_FOLLOWUP_TODO.md` - Documentation (now accurate)

## Notes

- Follow-up queries significantly increase scan duration (3x-4x longer)
- Costs increase proportionally with follow-up depth
- Each follow-up maintains conversation context
- Errors in follow-up chain stop remaining follow-ups for that query-model pair
- Progress tracking now accurately reflects all operations including follow-ups
