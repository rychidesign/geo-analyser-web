# 🚀 Deployment Checklist

Quick reference for deploying GEO Analyser to production.

---

## Pre-Deployment

- [ ] Code is tested and working locally
- [ ] All environment variables documented in `.env.example`
- [ ] Database migrations are in correct order
- [ ] README.md is up to date
- [ ] No sensitive data in code (API keys, passwords, etc.)
- [ ] Git repository is clean (`git status`)

---

## Supabase Setup

- [ ] Create new Supabase project
- [ ] Run all database migrations in order:
  - [ ] `schema.sql`
  - [ ] `002_scan_metrics.sql`
  - [ ] `003_ai_generation.sql`
  - [ ] `004_project_models.sql`
  - [ ] `005_evaluation_method.sql`
  - [ ] `006_usage_type.sql`
  - [ ] `007_scan_evaluation_method.sql`
  - [ ] `008_scan_queue.sql`
  - [ ] `009_user_timezone.sql`
- [ ] Enable Email authentication
- [ ] Copy Project URL
- [ ] Copy anon/public key
- [ ] Copy service_role key (keep secret!)

---

## Generate Secrets

- [ ] Generate encryption key:
  ```bash
  openssl rand -base64 32
  ```
- [ ] Generate cron secret:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

---

## GitHub

- [ ] Repository created on GitHub
- [ ] Code pushed to main branch
- [ ] Repository visibility set (public/private)
- [ ] `.gitignore` includes `.env.local`

---

## Vercel Deployment

- [ ] Import project from GitHub
- [ ] Framework preset: Next.js
- [ ] Add environment variables:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `ENCRYPTION_KEY`
  - [ ] `CRON_SECRET`
- [ ] Deploy project
- [ ] Verify deployment succeeded
- [ ] Test production URL

---

## Post-Deployment

- [ ] Visit production URL
- [ ] Create first user account
- [ ] Verify email confirmation works
- [ ] Sign in successfully
- [ ] Add API keys in Settings
- [ ] Create test project
- [ ] Generate queries with AI
- [ ] Run test scan
- [ ] Verify scan completes successfully
- [ ] Check scan results display correctly
- [ ] Test scheduled scan (optional)

---

## Cron Job

- [ ] Verify cron job appears in Vercel dashboard
- [ ] Test cron endpoint manually (if needed)
- [ ] Schedule appears correct (daily 6 AM UTC)

---

## Custom Domain (Optional)

- [ ] Domain added in Vercel
- [ ] DNS records updated
- [ ] SSL certificate active
- [ ] Update Supabase redirect URLs
- [ ] Test authentication with custom domain

---

## Monitoring

- [ ] Check Vercel function logs for errors
- [ ] Monitor Supabase usage dashboard
- [ ] Set up alerts (optional)
- [ ] Document any issues encountered

---

## Security Review

- [ ] No hardcoded secrets in code
- [ ] All environment variables set correctly
- [ ] RLS policies enabled on all tables
- [ ] API keys encrypted at rest
- [ ] HTTPS enforced
- [ ] Authentication working correctly

---

## Documentation

- [ ] README.md updated
- [ ] DEPLOYMENT.md reviewed
- [ ] Environment variables documented
- [ ] Known issues documented (if any)

---

## ✅ Deployment Complete!

**Production URL**: `https://_____________________.vercel.app`

**Date Deployed**: `____/____/____`

**Deployed By**: `____________________`

**Notes**:
```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

## Common Issues

### Build fails
- Clear `.next` and `node_modules`, rebuild locally
- Check for TypeScript errors
- Verify all dependencies in `package.json`

### Auth doesn't work
- Verify Supabase environment variables
- Check redirect URLs in Supabase settings
- Clear browser cache/cookies

### Cron job doesn't run
- Verify `CRON_SECRET` is set
- Check cron job in Vercel dashboard
- View function logs for errors

### Can't save API keys
- Verify `ENCRYPTION_KEY` is set correctly
- Must be valid base64 string
- Redeploy after adding variable

---

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.
