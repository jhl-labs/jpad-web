# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Health check endpoint (`GET /api/health`) with DB connectivity test
- User profile API (`GET/PATCH /api/auth/profile`)
- Password change API (`PATCH /api/auth/password`) with rate limiting and audit log
- User settings page with 6 tabs (profile, theme, data, notifications, info, advanced)
- FeedbackModal component with GitHub Issues integration
- CORS middleware with configurable allowed origins
- Request-id middleware for request tracing
- `scripts/setup.sh` one-click setup script
- Dockerfile with multi-stage build (deps/build/runner)
- docker-compose `jpad` app service with healthcheck dependencies
- Workspace stats API (`GET /api/workspaces/[workspaceId]/stats`)
- AI chat history API (`GET /api/ai/chat/history`)
- `WordCount` editor component (글자 수, 단어 수, 읽기 시간)
- `FormLayout` UI component (설정 페이지용 폼 레이아웃)
- Trash permanent delete (`DELETE /api/trash/[pageId]`)

### Changed
- PostgreSQL version updated from 15 to 16-alpine in docker-compose
- API endpoint count increased to 133
- All bare `catch {}` blocks replaced with `catch (error)` + Unauthorized branch + `logError()`

### Fixed
- Documentation sync: `@db.Text` annotations, SearchIndexJob fields, prisma.config.ts reference
- Removed 8 broken smoke test scripts from package.json (files moved to tests/smoke/)

## [1.0.0] - 2025-03-17

### Added
- BlockNote rich editor with Yjs real-time collaboration
- AI assistant (inline, slash menu, autocomplete, chat, summarize, translate)
- Calendar with Google Calendar bidirectional sync
- TODO task management with priorities and assignees
- Daily notes (Obsidian-style)
- Knowledge graph visualization (Canvas API)
- Page templates (6 built-in)
- Quick Switcher (Cmd+K)
- Table of Contents
- Markdown import/export
- Notifications with polling
- Onboarding checklist
- SAML/OIDC SSO, SCIM v2
- Organization and domain management
- Audit logs with webhook delivery
- DLP (credit card, SSN, resident ID detection)
- ClamAV malware scanning
- Backup/restore with drill verification
- Semantic search (JSON/pgvector/Qdrant)
- WebSocket viewer write blocking
- CSP/HSTS security headers
- Rate limiting (Redis + in-memory)
- AES-256-GCM secret encryption
- User settings page (6 tabs)
- GitHub CI workflow
- Dependabot configuration
- 56 unit tests, 11 E2E specs, 9 smoke tests
