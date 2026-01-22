# GEO Analyser 🌟

**Generative Engine Optimization Web Application**

Track how your brand appears in AI-generated responses from ChatGPT, Claude, Gemini, and other LLMs. Optimize your online presence for the age of AI-powered search.

---

## 🎯 Features

- ✅ **Multi-LLM Testing** - Test queries across OpenAI, Anthropic, and Google AI
- 🤖 **AI-Powered Query Generation** - Automatically generate test queries in multiple languages
- 📊 **Comprehensive Analytics** - Track 5 key metrics: Visibility, Sentiment, Citation, Ranking, and Overall Recommendation
- 📈 **Historical Tracking** - Monitor your brand's performance over time with interactive charts
- ⏰ **Scheduled Scans** - Automate regular monitoring with configurable schedules
- 🔄 **Scan Queue System** - Queue multiple projects with pause/resume/cancel controls
- 💰 **Cost Tracking** - Monitor API usage and costs across all providers
- 🌍 **Multi-Language Support** - Generate queries in Czech, English, German, and more
- 🎨 **Modern Dark UI** - Clean, responsive interface built with Next.js and Tailwind
- 🔐 **Secure** - Encrypted API key storage with Supabase authentication

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase account (free tier works)
- API keys from at least one LLM provider (OpenAI, Anthropic, or Google AI)

### Local Development

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/geo-analyser-web.git
cd geo-analyser-web

# Install dependencies
npm install

# Copy environment variables
cp env.example .env.local
# Edit .env.local with your Supabase credentials

# Run database migrations (in Supabase SQL Editor)
# Execute files from supabase/migrations/ in order

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

---

## 📖 Usage Guide

### 1. Configure API Keys
Navigate to Settings and add your LLM provider API keys:
- **OpenAI** - Get from platform.openai.com
- **Anthropic** - Get from console.anthropic.com
- **Google AI** - Get from ai.google.dev

### 2. Create a Project
- Add your website domain
- Define brand name variations
- Add target keywords
- Select which LLM models to test

### 3. Generate Queries
- Use AI to automatically generate relevant queries
- Or add custom queries manually
- Choose language and market

### 4. Run Scans
- Queue one or multiple projects
- Monitor real-time progress in the sidebar
- Pause, resume, or cancel scans as needed

### 5. Analyze Results
- View 5 key metrics for each query/model combination
- Track historical trends with interactive charts
- Monitor costs by provider and model
- Export results to PDF (coming soon)

---

## 🛠️ Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Supabase** - Authentication, database, and real-time subscriptions
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Interactive data visualization
- **Radix UI** - Accessible component primitives
- **OpenAI, Anthropic, Google AI** - LLM APIs

---

## 🌐 Deployment

This application is designed to deploy on **Vercel** with **Supabase** as the backend.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy:
1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

---

## 🤝 Contributing

Contributions welcome! Please open an issue or submit a pull request.

---

## 💬 Support

For questions or issues, please open a GitHub issue or contact support.

---

## 🔒 Security

- API keys are encrypted at rest using AES-256-GCM
- All authentication handled securely via Supabase Auth
- Row Level Security (RLS) enabled on all database tables
- HTTPS enforced in production

---

## 🎯 Roadmap

- [ ] PDF report generation
- [ ] Team collaboration features
- [ ] Webhook integrations
- [ ] Custom evaluation criteria
- [ ] A/B testing for content optimization
- [ ] Mobile app

---

Made with ❤️ for the future of SEO
