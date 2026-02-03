# Changelog

All notable changes to GEO Analyser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
| 1.1.0 | 2026-02-03 | Added testing framework, MDC docs, and git workflow |
| 1.0.0 | 2026-02-02 | Initial release |

---

## How to Update

When deploying to production:

1. Move items from `[Unreleased]` to new version section
2. Add version number and date: `## [1.1.0] - YYYY-MM-DD`
3. Update version table at bottom
4. Commit CHANGELOG.md with deployment
