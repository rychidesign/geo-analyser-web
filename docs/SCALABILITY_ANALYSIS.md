# Scalability Analysis - 100 Users Scenario

## 📊 Scenario Details

**Given:**
- **Users:** 100
- **Projects per user:** 10
- **Total projects:** 1,000
- **Queries per project:** 10
- **Models per project:** 5
- **Follow-up depth:** 2 (initial + 2 follow-ups = 3 operations per query-model pair)

---

## 🔢 Calculations

### Per Single Scan:
```
Operations per scan = Queries × Models × (1 + Follow-up Depth)
                    = 10 × 5 × 3
                    = 150 operations
```

### Per Operation:
```
Time per operation: ~2-4 seconds (LLM call + evaluation)
Average: ~3 seconds
```

### Per Scan:
```
Time per scan = 150 operations × 3 seconds
              = 450 seconds
              = 7.5 minutes
```

### If All Users Scan Once:
```
Total scans = 1,000 projects
Total operations = 1,000 × 150 = 150,000 operations
Total time (sequential) = 1,000 × 7.5 min = 7,500 minutes = 125 hours = 5.2 DAYS
```

---

## ❌ Current System Limitations

### 1. **Worker Timeout** ⚠️ CRITICAL
```typescript
export const maxDuration = 300 // 5 minutes
```

**Problem:**
- Each scan needs **7.5 minutes**
- But worker timeout is **5 minutes**
- **Scans will TIMEOUT and FAIL!**

**Solution:**
- Increase `maxDuration` to at least 600 (10 minutes)
- Vercel limits:
  - Hobby plan: 300s max ❌
  - Pro plan: 900s max (15 min) ✅
  - Enterprise: custom

### 2. **Sequential Processing** ⚠️ CRITICAL
```typescript
// Current: One worker processes one scan at a time
const result = await processQueueItem(supabase, claimed, workerId)
```

**Problem:**
- If 1,000 scans are queued:
  - Sequential time: **5.2 DAYS**
  - Users wait hours/days for results

**Current Behavior:**
- Worker triggered by:
  - Manual scan start (triggers 1 worker)
  - Vercel Cron (triggers 1 worker per minute)
- Only 1 scan processed at a time

### 3. **Rate Limits** ⚠️ HIGH RISK

**Vercel AI Gateway:**
- Depends on your plan
- Typically: 100-1000 requests per minute
- 150,000 operations might hit limits

**LLM Provider Limits:**
- OpenAI: 10,000 TPM (tokens per minute) on free tier
- Anthropic: Similar limits
- **150,000 operations = potential throttling**

### 4. **Database Connections** ⚠️ MEDIUM RISK

**Supabase:**
- Free tier: 60 concurrent connections
- Pro tier: 200 concurrent connections
- Each worker = 1 connection
- 150,000 inserts in short time = potential issues

### 5. **Cost** 💰 HIGH

**Rough Estimate:**
```
Cost per operation (with evaluation):
- Query: $0.0001 - $0.001 (depends on model)
- Evaluation: $0.00005
- Average: ~$0.0005

Total cost if all users scan:
150,000 × $0.0005 = $75

Monthly (if each project scans once):
$75 × 1 scan = $75/month minimum
```

**But realistically:**
- Some users scan multiple times per month
- Testing/debugging scans
- **Could easily be $200-500/month**

---

## ✅ Solutions & Recommendations

### 1. **Parallel Workers** (CRITICAL)

**Implement:** Spawn multiple workers in parallel

```typescript
// In scan/queue/route.ts after queueing:
async function triggerWorker(request: NextRequest) {
  const PARALLEL_WORKERS = 5 // Adjust based on plan
  
  for (let i = 0; i < PARALLEL_WORKERS; i++) {
    fetch(`${baseUrl}/api/cron/process-queue`, {
      method: 'POST',
      headers: { 'Authorization': authHeader }
    }).catch(err => console.warn('Worker trigger failed:', err))
  }
}
```

**Effect:**
- 5 workers = 5 scans in parallel
- Time reduced: 5.2 days → **1 day**
- 10 workers = **12.5 hours**
- 20 workers = **6.25 hours**

**Limitation:**
- Vercel concurrent function invocations
- Database connection limits
- Rate limits

### 2. **Increase maxDuration** (CRITICAL)

```typescript
export const maxDuration = 900 // 15 minutes (Pro plan required)
```

**Benefit:**
- Handles scans with up to:
  - 900s / 3s per op = 300 operations
  - = 10 queries × 6 models × 5 follow-up depth
  - Current scenario (150 ops) fits comfortably

### 3. **Queue Priority System** (HIGH PRIORITY)

```typescript
// Priority based on user tier
const priority = profile.tier === 'paid' ? 10 : 
                 profile.tier === 'admin' ? 20 : 0

await supabase
  .from('scan_queue')
  .insert({
    user_id: user.id,
    project_id: projectId,
    status: 'pending',
    priority: priority, // ✅ Already exists in schema!
    // ...
  })
```

**Effect:**
- Paid users get scanned first
- Free users wait longer (acceptable)
- Admin scans process immediately

### 4. **Batch Processing** (MEDIUM PRIORITY)

**Optimize LLM calls:**
```typescript
// Instead of:
for (const query of queries) {
  for (const model of models) {
    await callGEOQuery(...)
  }
}

// Consider:
const promises = queries.flatMap(query => 
  models.map(model => callGEOQuery(...))
)
await Promise.all(promises) // Parallel API calls
```

**Limitation:**
- Can hit rate limits faster
- Higher memory usage
- Complex error handling

### 5. **Scheduled Scans Spreading** (HIGH PRIORITY)

```typescript
// Instead of: All scans at 6:00 AM
// Spread throughout the day:

function calculateNextScanTime(projectId, day, hour) {
  // Hash project ID to get consistent hour offset
  const hourOffset = hashToNumber(projectId) % 24
  
  // Spread scans across 24 hours
  return setSchedule(day, hourOffset)
}
```

**Effect:**
- 1,000 scans spread over 24 hours
- = ~42 scans per hour
- = Much more manageable

### 6. **Rate Limiting & Throttling** (MEDIUM PRIORITY)

```typescript
// Limit concurrent scans per user
const MAX_CONCURRENT_SCANS_PER_USER = 3

// In queue endpoint:
const { count: userActiveScans } = await supabase
  .from('scan_queue')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .in('status', ['pending', 'running'])

if (userActiveScans >= MAX_CONCURRENT_SCANS_PER_USER) {
  return NextResponse.json({ 
    error: 'Maximum concurrent scans reached. Please wait.' 
  }, { status: 429 })
}
```

### 7. **Monitoring & Alerting** (HIGH PRIORITY)

```typescript
// Add metrics:
- Queue depth (how many scans waiting)
- Average wait time
- Worker utilization
- Cost tracking
- Rate limit hits

// Alert when:
- Queue > 100 scans
- Average wait > 30 minutes
- Daily cost > $50
```

---

## 🎯 Recommended Architecture for Scale

### Immediate Changes (Before hitting 100 users):

1. **Upgrade to Vercel Pro** ($20/month)
   - Higher `maxDuration` (900s)
   - More concurrent functions
   - Better support

2. **Implement Parallel Workers**
   - Start with 5-10 workers
   - Adjust based on monitoring

3. **Add Priority Queue**
   - Paid users first
   - Free users can wait

4. **Spread Scheduled Scans**
   - Over 24 hours
   - Not all at once

### For 100+ Users:

1. **Consider Background Job Queue**
   - Redis + Bull Queue
   - Better control over concurrency
   - Retry logic
   - Job monitoring

2. **Horizontal Scaling**
   - Multiple Vercel projects
   - Load balancer
   - Distributed queue

3. **Caching**
   - Cache evaluation results for identical responses
   - Reduce redundant API calls

4. **Batch APIs**
   - OpenAI Batch API (50% cheaper, slower)
   - For non-urgent scans

---

## 📈 Capacity Planning

### Current Setup (1 worker, sequential):
```
Scans per hour: 60 min / 7.5 min = 8 scans/hour
Scans per day: 8 × 24 = 192 scans/day
Max projects: ~5,000 projects (scanning once/month)
Max users: ~500 users (10 projects each)
```

### With 5 Parallel Workers:
```
Scans per hour: 8 × 5 = 40 scans/hour
Scans per day: 960 scans/day
Max projects: ~28,000 projects
Max users: ~2,800 users
```

### With 10 Parallel Workers:
```
Scans per hour: 80 scans/hour
Scans per day: 1,920 scans/day
Max projects: ~57,000 projects
Max users: ~5,700 users
```

### With Optimized Setup (20 workers + batching):
```
Scans per hour: 200+ scans/hour
Scans per day: 4,800+ scans/day
Max users: 10,000+ users
```

---

## 💰 Cost Analysis

### Infrastructure:
- Vercel Pro: $20/month
- Supabase Pro: $25/month
- Total: **$45/month base**

### API Costs (100 users, monthly scans):
- 150,000 operations/month
- Average $0.0005 per operation
- Total: **$75/month**

### Total Monthly Cost:
- **$120/month** for 100 users
- **$1.20 per user per month**

### Revenue Needed:
- If charging $10/user/month
- Profit: $10 - $1.20 = **$8.80 per user**
- Healthy margin: **88%**

---

## 🚨 Critical Action Items

### Before Hitting 100 Users:

- [ ] **URGENT:** Increase `maxDuration` to 900s (requires Pro plan)
- [ ] **URGENT:** Implement parallel workers (5-10 workers)
- [ ] **HIGH:** Add priority queue system
- [ ] **HIGH:** Spread scheduled scans over 24 hours
- [ ] **MEDIUM:** Add monitoring & alerting
- [ ] **MEDIUM:** Implement rate limiting per user
- [ ] **LOW:** Consider batch processing

### Monitoring to Add:

- [ ] Queue depth dashboard
- [ ] Average scan time
- [ ] Worker utilization
- [ ] Daily API cost
- [ ] Rate limit hits
- [ ] Failed scan rate

---

## ✅ Answer: Can Current Setup Handle It?

**Short Answer:** ❌ **NO**, but with modifications: ✅ **YES**

**Why No (current setup):**
1. Worker timeout too short (5 min < 7.5 min needed)
2. Sequential processing too slow (5 days for all scans)
3. No priority system
4. No monitoring

**Why Yes (with changes):**
1. Increase timeout to 900s ✅
2. Add 5-10 parallel workers ✅
3. Spread scheduled scans ✅
4. Add monitoring ✅

**Estimated implementation time:** 4-6 hours

---

## 🎯 Next Steps

1. **Test Current Limits**
   - Create 5 test projects
   - Run scans simultaneously
   - Measure actual time & cost

2. **Implement Critical Fixes**
   - Parallel workers
   - Increase timeout
   - Priority queue

3. **Monitor & Adjust**
   - Watch queue depth
   - Adjust worker count
   - Optimize as needed

4. **Plan for Growth**
   - Document capacity limits
   - Set alerts at 80% capacity
   - Have scaling plan ready

---

## 🏗️ New Architecture (February 2026)

### Overview

The scan system has been refactored into two distinct branches:

1. **Manual Scans** — Browser-based chunked execution
2. **Scheduled Scans** — Server-side cron jobs (Pro/Enterprise only)

### Manual Scans: Browser-Based Chunked Architecture

**How it works:**
```
User clicks "Run Scan"
  ↓
Browser creates scan record via /api/projects/[id]/scan/start
  ↓
Browser splits queries into chunks (1-3 queries per chunk)
  ↓
For each chunk:
  - Browser calls /api/projects/[id]/scan/chunk
  - Chunk processes N queries × M models
  - Each operation completes within <25s edge timeout
  - Results saved incrementally
  - Progress tracked by queries (not operations)
  ↓
Browser calls /api/projects/[id]/scan/[scanId]/complete
```

**Key benefits:**
- ✅ No server-side queue needed for manual scans
- ✅ No worker timeout issues (chunks stay under 25s edge limit)
- ✅ User sees real-time progress
- ✅ Scans stop automatically if user closes browser
- ✅ Scales infinitely with user count (work runs in user's browser)

**Trade-offs:**
- ⚠️ User must keep browser window open
- ⚠️ Requires stable internet connection
- ⚠️ Cannot run in background

**UI/UX:**
- Warning banner: "Please don't close this window"
- Browser `beforeunload` confirmation dialog
- Progress displayed as "Processing query 5/20..." (not operations)
- Follow-up queries included in chunk processing

### Scheduled Scans: Server-Side Cron Architecture

**How it works:**
```
Hourly cron (/api/cron/scheduled-scans) runs at :00
  ↓
Query DB for projects where next_scheduled_scan_at <= NOW()
  ↓
Filter: Only process Pro/Enterprise tier users (skip free)
  ↓
For each project:
  - Create scheduled_scan_history record
  - Enqueue scan to scan_queue
  - Calculate next_scheduled_scan_at using timezone logic
  - Update project.next_scheduled_scan_at
  ↓
Worker cron (/api/cron/process-scan) runs every 5 minutes
  ↓
Process queued scans (same as manual scans, but server-side)
```

**Scheduling options:**
- **Daily**: Every day at specified hour (in user's timezone)
- **Weekly**: Specific day of week + hour (in user's timezone)
- **Monthly**: Specific day of month (1-28) + hour (in user's timezone)

**Timezone handling:**
- Uses pure TypeScript + `Intl.DateTimeFormat` (no external libraries)
- DST-safe with two-pass offset correction
- Supports all IANA timezones
- Hourly cron ensures scans trigger within 1 hour of scheduled time
- User sets timezone in `/dashboard/settings`

**Key benefits:**
- ✅ Runs in background (no user interaction needed)
- ✅ Flexible scheduling (daily/weekly/monthly)
- ✅ Timezone-aware
- ✅ Free tier gate (monetization)
- ✅ Scales with hourly check (not per-user cron)

**Vercel cron configuration:**
```json
{
  "crons": [
    {
      "path": "/api/cron/scheduled-scans",
      "schedule": "0 * * * *"  // Every hour at :00
    },
    {
      "path": "/api/cron/process-scan",
      "schedule": "*/5 * * * *"  // Every 5 minutes
    }
  ]
}
```

### Scalability Analysis: New Architecture

#### Manual Scans
**100 users, each runs 1 manual scan:**
- **Load on server**: ZERO queue processing
- **Edge function calls**: 100 users × ~40 chunks = ~4,000 chunk API calls
- **Duration**: Each user's scan completes in ~7.5 minutes (in their browser)
- **Cost**: Only LLM API costs (no server compute overhead)
- **Bottleneck**: None (work distributed to user browsers)

**Scaling to 1,000 users:**
- ✅ No server queue congestion
- ✅ Edge functions auto-scale
- ✅ Each user's scan is independent
- ⚠️ Monitor LLM API rate limits (OpenAI/Anthropic/etc.)

#### Scheduled Scans
**100 projects with scheduled scans:**
- **Assumption**: Scans distributed across 24 hours (not all at same time)
- **Average per hour**: ~4-5 projects
- **Worker processing**: Each scan takes ~7.5 minutes
- **Queue depth**: Low (5 scans max at peak)
- **Cron overhead**: Hourly check (~200ms)

**Scaling to 1,000 scheduled projects:**
- **Average per hour**: ~42 projects (assuming even distribution)
- **Worker processing**: 42 scans × 7.5 min = 315 minutes = 5.25 hours
- **5-minute worker cron**: 12 workers per hour
- **Workers needed**: 1 worker can handle ~8 scans/hour (60 min / 7.5 min)
- **Capacity**: 12 workers × 8 scans = 96 scans/hour ✅
- **Conclusion**: Current architecture can handle 1,000 scheduled projects

**If peak load is higher (e.g., many users choose Monday 9 AM):**
- Option 1: Stagger scheduled times by ±15 minutes
- Option 2: Add priority queue (Pro < Enterprise)
- Option 3: Increase worker frequency to every 2 minutes

### Cost Comparison

#### Old Architecture (Queue-Based)
- **Compute**: Vercel serverless functions (300s max)
- **Idle workers**: Cron runs every minute (even if no scans)
- **Cost**: ~$10-20/month for cron overhead

#### New Architecture (Hybrid)
- **Manual**: Edge functions (25s max) + user's browser
- **Scheduled**: Cron every 5 minutes + edge chunk processing
- **Cost**: ~$5-10/month for cron overhead
- **Savings**: ~50% reduction in compute costs

### Testing & Validation

**Unit tests:**
- ✅ 19 tests for scheduling logic (`tests/lib/scheduling.test.ts`)
- ✅ Covers daily/weekly/monthly scheduling
- ✅ Covers DST transitions (spring/fall)
- ✅ Covers edge cases (midnight, month/year rollover)
- ✅ Covers multiple timezones (Prague, New York, Tokyo, Auckland, India)

**Integration tests needed:**
- [ ] Manual scan with 20 queries × 5 models (100 operations)
- [ ] Scheduled scan triggers at correct time (multiple timezones)
- [ ] Free user sees locked UI for scheduled scans
- [ ] Browser `beforeunload` prevents accidental scan cancellation

### Monitoring Recommendations

**Key metrics to track:**
1. **Manual scans:**
   - Average scan duration (should be ~7-8 min)
   - Chunk failure rate (should be <1%)
   - Browser abandonment rate (user closes window mid-scan)

2. **Scheduled scans:**
   - Queue depth at peak hours
   - Scan start delay (time between scheduled_at and actual start)
   - Cron execution time (hourly check should be <500ms)

3. **Overall:**
   - LLM API rate limit errors
   - Cost per scan (should be ~$0.01-0.05)
   - User satisfaction (NPS for scan reliability)

### Future Optimizations

**When scaling beyond 10,000 projects:**
1. **Dedicated worker pool** (separate from edge functions)
2. **Redis queue** (replace Supabase scan_queue table)
3. **Horizontal scaling** (multiple worker instances)
4. **Smart scheduling** (ML-based stagger to avoid peak collisions)
5. **Regional crons** (deploy workers closer to users)

---

## 📋 Implementation Status

✅ **Completed (February 8, 2026):**
- Browser-based chunked scan engine
- Scheduled scan frequency options (daily/weekly/monthly)
- Timezone-aware scheduling logic
- Free user gate for scheduled scans
- UI updates (progress, warnings, settings)
- Vercel cron configuration
- Unit tests (19 tests, all passing)

📝 **Documentation:**
- IMPLEMENTATION_PLAN_SCAN_ARCHITECTURE.md (complete)
- SCALABILITY_ANALYSIS.md (this document, updated)

🎯 **Next milestones:**
- Deploy to production
- Monitor metrics for 1 week
- Gather user feedback
- Optimize based on real-world usage