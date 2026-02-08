# Scan Diagnostics Guide

## Quick Diagnosis

### Problem: Scan stuck in "pending" or "running" state

**Symptoms:**
- Scan shows "running" status but progress bar doesn't move
- Scan stays in "pending" for more than 1-2 minutes
- After refresh, scan appears stuck

**Diagnostic Page:**
Go to: `/dashboard/admin/scan-diagnostics`

---

## Common Issues & Solutions

### 1. ⚠️ Scan Pending for > 1 minute

**Diagnosis:**
- Queue item status: `pending`
- Progress: `0/X`
- Message: "Waiting in queue..."

**Cause:** Worker `/api/cron/process-queue` is not running

**Solutions:**

#### Option A: Manual Trigger (Immediate)
1. Go to `/dashboard/admin/scan-diagnostics`
2. Click **"Trigger Worker"** button at the top
3. Wait 5-10 seconds and click **"Refresh"**
4. Check if status changed to `running`

#### Option B: API Call
```bash
# Development
curl -X POST http://localhost:3000/api/cron/process-queue

# Production (requires CRON_SECRET)
curl -X POST https://your-domain.com/api/cron/process-queue \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Option C: Vercel Cron Setup
The worker should be triggered automatically via Vercel Cron:

1. Check `vercel.json` has cron configured:
```json
{
  "crons": [{
    "path": "/api/cron/process-queue",
    "schedule": "* * * * *"
  }]
}
```

2. Verify in Vercel Dashboard:
   - Go to your project → Settings → Cron Jobs
   - Check if cron is enabled
   - Check execution logs

3. Set `CRON_SECRET` environment variable in Vercel:
   - Generate a secure random string
   - Add to Environment Variables
   - Redeploy

---

### 2. ⚠️ Scan Running for > 5 minutes

**Diagnosis:**
- Scan status: `running`
- Progress hasn't updated in 5+ minutes
- Worker may have crashed

**Solutions:**

1. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Logs
   - Filter by `/api/cron/process-queue`
   - Look for errors or timeouts

2. **Check Worker Timeout:**
   - Default `maxDuration` is 300s (5 minutes)
   - Large scans may need longer duration
   - Edit `app/api/cron/process-queue/route.ts`:
   ```typescript
   export const maxDuration = 300 // Increase if needed
   ```

3. **Mark as Failed (if truly stuck):**
   - Go to diagnostics page
   - Find the stuck scan
   - Click "Mark as Failed" button

---

### 3. 🔄 Progress Not Updating in UI

**Diagnosis:**
- Scan is running in backend (check diagnostics)
- UI shows "running" but progress bar frozen
- Frontend polling may have stopped

**Solutions:**

1. **Hard Refresh Page:**
   - Press `Ctrl+Shift+R` (Windows/Linux)
   - Press `Cmd+Shift+R` (Mac)
   - Frontend will restore active scans from `/api/scan/active`

2. **Check Browser Console:**
   - Press `F12` → Console tab
   - Look for polling errors
   - Check network tab for failed requests to `/api/projects/.../scan/queue/...`

3. **Verify Scan Context:**
   - Scan context (`scan-context.tsx`) polls every 2 seconds
   - Check if `scan_queue` table has `updated_at` field

---

## How Scan System Works

### Architecture

1. **User initiates scan** → POST `/api/projects/{id}/scan/queue`
   - Creates entry in `scan_queue` table with status `pending`
   - Triggers worker via internal request

2. **Worker processes scan** → `/api/cron/process-queue`
   - Claims pending scan (status → `running`)
   - Creates scan in `scans` table
   - Processes each query × model
   - Updates progress in `scan_queue` table

3. **Frontend polls for updates** → GET `/api/projects/{id}/scan/queue/{queueId}`
   - Polls every 2 seconds while scan is active
   - Updates progress bar in UI
   - Shows completion when done

### Key Tables

**`scan_queue`** - Active scan tracking
- `id` - Queue ID
- `status` - pending | running | completed | failed | cancelled
- `progress_current` - Current operation number
- `progress_total` - Total operations
- `progress_message` - Current activity description
- `updated_at` - Last update timestamp (for polling)

**`scans`** - Scan results
- `id` - Scan ID
- `status` - running | completed | failed
- `total_results` - Number of results generated
- `overall_score` - Aggregated metrics

---

## Monitoring & Alerts

### Health Check Endpoints

1. **Active Scans**: `/api/scan/active`
   - Returns all active scans for current user
   - Auto-cleans stuck scans from old system

2. **Queue Status**: `/api/projects/{projectId}/scan/queue/{queueId}`
   - Returns current status of specific queue item
   - Used by frontend for polling

3. **Diagnostics**: `/api/admin/scan-diagnostics`
   - Comprehensive diagnostics
   - Recommendations
   - Stuck scan detection

### Manual Cleanup

If scans are stuck and can't be recovered:

```sql
-- Mark stuck scans as failed (in Supabase SQL editor)
UPDATE scans 
SET status = 'failed', completed_at = NOW() 
WHERE status = 'running' 
AND created_at < NOW() - INTERVAL '5 minutes';

UPDATE scan_queue 
SET status = 'failed', completed_at = NOW(), error_message = 'Timeout' 
WHERE status IN ('pending', 'running') 
AND created_at < NOW() - INTERVAL '5 minutes';
```

---

## Vercel Configuration

### Required Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Cron Security
CRON_SECRET=your-secure-random-string

# App URL (for worker triggers)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Vercel Cron Setup

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-queue",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs the worker every minute to process pending scans.

---

## FAQ

**Q: Why does the scan stay "pending"?**  
A: Worker is not running. Click "Trigger Worker" in diagnostics, or check Vercel cron setup.

**Q: Can I run multiple scans in parallel?**  
A: Currently, one scan per project at a time. Queue system processes them sequentially.

**Q: How long should a scan take?**  
A: Depends on: (queries × models). Typically 5-30 seconds per result. A scan with 4 queries × 2 models = 8 results = ~1-2 minutes.

**Q: What happens if I close the browser?**  
A: Scan continues running on server. Refresh page and it will restore progress.

**Q: How do I cancel a running scan?**  
A: Go to diagnostics page → Click "Cancel" button on the queue item.

---

## Need Help?

1. Check diagnostics page: `/dashboard/admin/scan-diagnostics`
2. Check Vercel logs: Vercel Dashboard → Logs
3. Check Supabase logs: Supabase Dashboard → Logs
4. Run manual trigger: Click "Trigger Worker" button
