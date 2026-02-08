# Changelog

All notable changes to GEO Analyser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.3.2] - 2026-02-09

### Added
- **Finalized Scan Architecture Migration**: Successfully migrated all scan logic to the new worker-based system.
- **Bug Fix Support for Follow-up Queries**: Added documentation and fixes for conversational resilience in automated scans.
- **Improved Database Schema**: Minor updates to the core schema for better data integrity.

### Removed
- **Legacy Scan Engine**: Removed deprecated scan engine and old API endpoints.

---

## [1.3.1] - 2026-02-08

### Added
- **Enhanced Query Management**: Improved UI and API for managing project queries.
- **Improved Scan Chunking**: Optimized scan processing for better performance and reliability.

---

## [1.3.0] - 2026-02-08

### Added
- **Enhanced Scan Architecture**: Major overhaul of the scan processing logic for better reliability and performance.
- **Admin Scan Diagnostics**: New dashboard for administrators to monitor and debug scan health.
- **Follow-up Query Support**: Improved handling of multi-turn conversational resilience.
- **Centralized Encryption**: Secure API key handling moved to a dedicated `lib/crypto.ts` module.
- **Unified Error Handling**: Standardized API responses with `ApiError` class.
- **Advanced Scheduling**: Flexible scan frequency settings (Migration 023).

### Changed
- Reorganized scripts into `dev-scripts/` for better project structure.
- Updated Vercel configuration for enhanced reliability.

---

## [1.2.0] - 2026-02-04

### Added
- **Scan Queue System**: Parallel processing of scans with manual start/pause/cancel.
- **Minute-by-minute Workers**: Automated queue processing via Vercel Cron.
- **Database Claim Logic**: Atomic locking for parallel scan workers (Migration 022).
- **Cleanup API**: Automatic cleanup of abandoned or failed scans.

### Changed
- **Vercel Pro Requirement**: Application now requires Vercel Pro for minute-by-minute cron jobs and longer timeouts (300s).

---

## [1.1.0] - 2026-02-03

### Added
- Vitest testing framework with React Testing Library
- 44 unit tests for credit system and LLM types
- `.cursor/rules/` documentation for AI agents
- Git workflow documentation for dev/production deployments
- CHANGELOG.md for version tracking

### Changed
- Updated critical-rules.mdc with AI model recommendations

---

## [1.0.0] - 2026-02-02

### Added
- Initial release
- Multi-LLM testing (OpenAI, Anthropic, Google, Groq, Perplexity)
- AI-powered query generation
- 5 key metrics: Visibility, Sentiment, Citation, Ranking, Recommendation
- Follow-up queries for conversational resilience
- Scheduled weekly scans
- Credit system with tier limits
- Cost tracking per scan and model
- Dark theme UI with Tailwind CSS

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.3.2 | 2026-02-09 | Finalized scan architecture migration and follow-up support |
| 1.3.1 | 2026-02-08 | Enhanced query management and improved scan chunking |
| 1.3.0 | 2026-02-08 | Enhanced scan architecture, diagnostics, and unified error handling |
| 1.2.0 | 2026-02-04 | Scan Queue system, Minute Cron, and Vercel Pro support |
| 1.1.0 | 2026-02-03 | Added testing framework, MDC docs, and git workflow |
| 1.0.0 | 2026-02-02 | Initial release |

---

## How to Update

When deploying to production:

1. Move items from `[Unreleased]` to new version section
2. Add version number and date: `## [1.1.0] - YYYY-MM-DD`
3. Update version table at bottom
4. Commit CHANGELOG.md with deployment
