# GEO Analyser - SaaS Implementation Guide

## Overview

This document describes the SaaS transformation of GEO Analyser with Pay As You Go model.

## Phase 1: User Tiers & Credit System ✅

### Database Schema

Run migration: `supabase/migrations/011_user_tiers_credits.sql`

#### New Tables

1. **user_profiles** - Extended user info
   - `tier`: 'free' | 'paid' | 'test' | 'admin'
   - `credit_balance_cents`: Combined balance (displayed to user)
   - `paid_credits_cents` / `bonus_credits_cents`: Internal tracking
   - `free_scans_used_this_month`: Free tier limit tracking

2. **credit_transactions** - All credit movements
   - Types: 'top_up', 'bonus', 'usage', 'refund', 'admin_adjustment'
   - Complete audit trail

3. **credit_reservations** - Temporary holds during scans
   - Prevents overspending
   - Auto-releases after 1 hour

4. **pricing_config** - Dynamic model pricing
   - Base costs from providers
   - 200% markup (configurable)
   - `available_free_tier` flag

5. **tier_limits** - Tier restrictions
   - Free: 1 project, 5 queries, 2 scans/month
   - Paid/Test/Admin: unlimited

### Tier System

| Tier | Projects | Queries | Scans/Month | All Models | Scheduled |
|------|----------|---------|-------------|------------|-----------|
| Free | 1 | 5 | 2 | ❌ (only cheap) | ❌ |
| Paid | ∞ | ∞ | ∞ (credits) | ✅ | ✅ |
| Test | ∞ | ∞ | ∞ | ✅ | ✅ |
| Admin | ∞ | ∞ | ∞ | ✅ | ✅ |

### Credit Flow

1. **Scan Start**:
   - Check tier limits / credit balance
   - Estimate cost
   - Create reservation (20% buffer)
   
2. **Scan Complete**:
   - Calculate actual cost
   - Consume reservation
   - Refund excess

3. **Scan Failed/Cancelled**:
   - Release entire reservation
   - No charge to user

### API Endpoints

- `GET /api/credits` - Get credit info
- `GET /api/credits/transactions` - Transaction history
- `GET /api/credits/pricing` - Model pricing
- `GET /api/admin/stats` - Platform stats (admin)
- `PATCH /api/admin/users` - Manage users (admin)

### Files Created

```
lib/credits/
  ├── types.ts      # TypeScript types
  ├── index.ts      # Main operations
  └── middleware.ts # Access control

app/api/credits/
  ├── route.ts
  ├── transactions/route.ts
  └── pricing/route.ts

app/api/admin/
  ├── users/route.ts
  └── stats/route.ts

app/(dashboard)/dashboard/admin/
  ├── page.tsx
  └── admin-dashboard.tsx

components/ui/
  ├── credit-display.tsx
  └── upgrade-prompt.tsx
```

### UI Changes

- Sidebar shows tier badge and balance
- Free tier shows scan counter
- Admin gets Admin Panel link
- Upgrade prompts when limits reached

---

## Phase 2: Vercel AI Gateway ✅

### Setup

1. ✅ Enable AI Gateway in Vercel Dashboard
2. ✅ Configure provider keys in Vercel (VERCEL_AI_GATEWAY_SECRET_KEY or AI_GATEWAY_API_KEY)
3. ✅ Update LLM calls to use Gateway

### Implementation

- `lib/ai/providers.ts` - Gateway client configuration
- `lib/ai/index.ts` - Unified AI calling interface
- Supports: OpenAI, Anthropic, Google, Groq, Perplexity

---

## Phase 3: Dynamic Pricing ✅

### Implementation

- ✅ Prices stored in `pricing_config` table (centralized)
- ✅ Admin Dashboard for price management
- ✅ 200% markup applied automatically (configurable per model)
- ✅ Non-admin users see final prices only

### Admin Features

- View/update base costs and markup percentages
- See real provider costs vs. charged prices
- Toggle free tier availability per model

Run migration: `supabase/migrations/014_centralized_pricing_2026.sql`

---

## Phase 4: Scheduled Scans ✅

### Implementation

Run migration: `supabase/migrations/015_scheduled_scans.sql`

#### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel Cron Job (daily at 6:00 AM UTC)                     │
│  Schedule: "0 6 * * *"                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  /api/cron/scheduled-scans                                  │
│  1. Find projects where next_scheduled_scan_at <= NOW()     │
│  2. Process max 10 projects per run                         │
│  3. Update next_scheduled_scan_at to next week              │
└─────────────────────────────────────────────────────────────┘
```

#### Database Changes

- `projects` table new columns:
  - `scheduled_scan_enabled` - Toggle weekly scans
  - `scheduled_scan_day` - Day of week (0=Sunday, 6=Saturday)
  - `next_scheduled_scan_at` - Auto-calculated by trigger
  - `last_scheduled_scan_at` - Last execution time

- `scheduled_scan_history` table:
  - Tracks all scheduled scan executions
  - Status: pending, running, completed, failed, skipped

#### API Endpoints

- `GET /api/cron/scheduled-scans` - Cron endpoint (daily 6 AM UTC)
- `GET /api/projects/[id]/scheduled-scans` - Scan history

#### Vercel Configuration

Add to `.env`:
```env
CRON_SECRET=your-secret-here
```

The cron runs daily via `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/scheduled-scans",
    "schedule": "0 6 * * *"
  }]
}
```

#### UI

- Project Settings page includes scheduling toggle
- Users select day of week for weekly scans
- Next scan date displayed after saving

### Vercel Plan Compatibility

| Plan | Cron Jobs | Min Interval | Scheduled Scans |
|------|-----------|--------------|-----------------|
| Hobby | 2 | Daily | ✅ (1x daily) |
| Pro | 40 | Per minute | ✅ (can upgrade to hourly) |

### Notes

- Scans run at 6:00 AM UTC on the selected day
- Each cron run processes max 10 projects
- Credits checked before each scheduled scan
- Skipped scans logged with reason (insufficient credits, no queries, etc.)

---

## Phase 5: Paddle Integration (TODO)

### Features

- Top-up options: $20, $50, $100, $200, $500
- Bonus credits: 10% for $100+, 15% for $500+
- Webhook handling for payments

### Paddle Setup

1. Create products in Paddle
2. Configure webhooks
3. Implement `/api/paddle/webhook`

---

## Local Development

### Database Setup

1. Run Supabase locally or use cloud instance
2. Execute migration: `011_user_tiers_credits.sql`
3. Create test admin user:

```sql
-- After creating account via UI, update profile
UPDATE user_profiles 
SET tier = 'admin' 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'your@email.com'
);
```

### Test Account

Create test account and set tier to 'test' for development.

Toggle credit simulation in Admin Panel to test edge cases.

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Vercel AI Gateway
VERCEL_AI_GATEWAY_SECRET_KEY=  # Required for AI calls (Vercel default name)
AI_GATEWAY_API_KEY=           # Optional alias for AI calls

# Cron Jobs
CRON_SECRET=               # Secret for Vercel cron authentication

# Future (Paddle)
PADDLE_VENDOR_ID=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
```
