# 🚀 Deployment Guide

Complete guide for deploying GEO Analyser to production on Vercel + Supabase.

---

## Prerequisites

Before you start, make sure you have:

- ✅ GitHub account
- ✅ Vercel account (free tier works) - [vercel.com](https://vercel.com)
- ✅ Supabase account (free tier works) - [supabase.com](https://supabase.com)
- ✅ API keys from LLM providers (at least one):
  - OpenAI: [platform.openai.com](https://platform.openai.com)
  - Anthropic: [console.anthropic.com](https://console.anthropic.com)
  - Google AI: [ai.google.dev](https://ai.google.dev)

---

## Part 1: Supabase Setup

### 1.1 Create New Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose your organization
4. Fill in project details:
   - **Name**: `geo-analyser` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine for getting started

5. Wait for project to be created (~2 minutes)

### 1.2 Run Database Migrations

1. In Supabase dashboard, go to **SQL Editor**
2. Execute each migration file in order (copy & paste):
   - `supabase/schema.sql` - Main schema
   - `supabase/migrations/002_scan_metrics.sql`
   - `supabase/migrations/003_ai_generation.sql`
   - `supabase/migrations/004_project_models.sql`
   - `supabase/migrations/005_evaluation_method.sql`
   - `supabase/migrations/006_usage_type.sql`
   - `supabase/migrations/007_scan_evaluation_method.sql`
   - `supabase/migrations/008_scan_queue.sql`
   - `supabase/migrations/009_user_timezone.sql`

3. Click **"Run"** after pasting each file

### 1.3 Configure Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure email templates (optional):
   - Customize confirmation email
   - Customize password reset email

### 1.4 Get API Credentials

1. Go to **Project Settings** → **API**
2. Copy these values (you'll need them for Vercel):
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJhbGci...`)
   - **service_role key** (starts with `eyJhbGci...`) ⚠️ Keep this secret!

---

## Part 2: Generate Encryption Key

You need a secure encryption key for storing user API keys.

### Option A: Using OpenSSL (macOS/Linux)

```bash
openssl rand -base64 32
```

### Option B: Using Node.js (Windows/All)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Option C: Using PowerShell (Windows)

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Save this key!** You'll need it for Vercel environment variables.

---

## Part 3: Generate Cron Secret

Generate a random string for securing the cron job endpoint:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use any password generator to create a long random string.

---

## Part 4: Vercel Deployment

### 4.1 Push Code to GitHub

If you haven't already:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/geo-analyser-web.git
git push -u origin main
```

### 4.2 Import Project to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js (should auto-detect)
   - **Root Directory**: `./` (leave as is)
   - **Build Command**: `npm run build` (leave as is)
   - **Output Directory**: `.next` (leave as is)

### 4.3 Add Environment Variables

Before deploying, add these environment variables in Vercel:

```env
# Supabase (from Part 1.4)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key

# Encryption (from Part 2)
ENCRYPTION_KEY=your_generated_base64_key

# Cron Secret (from Part 3)
CRON_SECRET=your_random_cron_secret
```

**Important:**
- Make sure all keys are on a single line (no line breaks)
- Don't share your `SUPABASE_SERVICE_ROLE_KEY` publicly
- Don't commit these values to Git

### 4.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Your app will be live at `https://your-project.vercel.app`

---

## Part 5: Configure Cron Job (Scheduled Scans)

### 5.1 Enable Vercel Cron

The `vercel.json` file already configures a daily cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/scheduled-scans",
      "schedule": "0 6 * * *"
    }
  ]
}
```

This runs daily at 6:00 AM UTC. To change the schedule, edit the cron expression.

### 5.2 Verify Cron is Active

1. In Vercel dashboard, go to your project
2. Click **"Settings"** → **"Cron Jobs"**
3. You should see your scheduled-scans job listed
4. The cron endpoint is automatically protected by Vercel's authentication

---

## Part 6: Post-Deployment Steps

### 6.1 Create Your First User

1. Visit your deployed app: `https://your-project.vercel.app`
2. Click **"Sign Up"**
3. Enter your email and password
4. Check your email for confirmation link
5. Click confirmation link to activate account

### 6.2 Configure API Keys

1. Sign in to your account
2. Go to **Settings**
3. Add API keys for at least one provider:
   - OpenAI
   - Anthropic
   - Google AI

### 6.3 Create First Project

1. Go to **Projects** → **"New Project"**
2. Fill in project details:
   - Domain (e.g., `example.com`)
   - Brand variations (e.g., `Example`, `Example.com`, `Example Inc`)
   - Target keywords (e.g., `project management`, `task tracking`)
   - Select models to test

3. Generate queries with AI or add manually
4. Run your first scan!

---

## Part 7: Custom Domain (Optional)

### 7.1 Add Domain in Vercel

1. In Vercel dashboard, go to your project
2. Click **"Settings"** → **"Domains"**
3. Add your custom domain (e.g., `geo-analyser.com`)
4. Follow Vercel's instructions to update DNS records

### 7.2 Update Supabase Redirect URLs

1. In Supabase dashboard, go to **Authentication** → **URL Configuration**
2. Add your custom domain to:
   - **Site URL**: `https://your-domain.com`
   - **Redirect URLs**: `https://your-domain.com/auth/callback`

---

## Part 8: Monitoring & Maintenance

### 8.1 Monitor Vercel Logs

- Go to **Deployments** → Select deployment → **View Function Logs**
- Monitor for errors or performance issues

### 8.2 Monitor Supabase Usage

- Go to **Settings** → **Usage**
- Keep an eye on:
  - Database size (500 MB on free tier)
  - Auth users (50,000 monthly active users on free tier)
  - API requests

### 8.3 Backup Database

Regular backups are important! Supabase Pro plan includes automatic daily backups.

For free tier, you can:
1. Go to **Database** → **Backups**
2. Click **"Create backup"** manually
3. Or export data via SQL:
   ```sql
   COPY (SELECT * FROM projects) TO STDOUT WITH CSV HEADER;
   ```

---

## 🔧 Troubleshooting

### Build Fails on Vercel

**Error**: `Module not found` or type errors

**Solution**: 
```bash
# Locally, clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

If it builds locally, push to GitHub and redeploy.

### Authentication Not Working

**Error**: `Invalid API key` or redirect issues

**Solution**:
1. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
2. Check Supabase **Authentication** → **URL Configuration**
3. Add your Vercel domain to allowed redirect URLs

### Cron Job Not Running

**Error**: Scheduled scans don't execute

**Solution**:
1. Check **Settings** → **Cron Jobs** in Vercel dashboard
2. Verify `CRON_SECRET` environment variable is set
3. Test manually: `GET https://your-domain.com/api/cron/scheduled-scans`
4. Check function logs for errors

### "Encryption Failed" Error

**Error**: Can't save API keys in Settings

**Solution**:
1. Verify `ENCRYPTION_KEY` environment variable is set in Vercel
2. Make sure it's a valid base64 string (32 bytes)
3. Redeploy after adding/updating the variable

---

## 🎉 Success!

Your GEO Analyser is now live! 

**Next steps:**
- Invite team members (create accounts for them)
- Set up scheduled scans for regular monitoring
- Track your brand's AI visibility over time
- Optimize your content based on insights

For issues or questions, open a GitHub issue or contact support.

---

## 📊 Scaling Tips

As your usage grows:

1. **Upgrade Supabase** (from free to Pro):
   - More database storage
   - Better performance
   - Automatic backups
   - Point-in-time recovery

2. **Upgrade Vercel** (from Hobby to Pro):
   - More bandwidth
   - Better performance
   - Team collaboration
   - Analytics

3. **Optimize Costs**:
   - Use cheaper models for query generation (e.g., GPT-5 Nano)
   - Use cheaper models for AI evaluation
   - Batch scans instead of real-time
   - Set reasonable scan schedules (daily, not hourly)

---

**Happy monitoring!** 🚀
