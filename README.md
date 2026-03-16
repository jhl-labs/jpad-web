<p align="center">
  <img src="public/icons/icon.svg" width="80" alt="jpad logo" />
</p>

<h1 align="center">jpad</h1>

<p align="center">
  AI-powered collaborative wiki platform — Notion meets Obsidian.
</p>

<p align="center">
  <a href="https://github.com/jhl-labs/jpad-web/actions/workflows/ci.yml"><img src="https://github.com/jhl-labs/jpad-web/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/jhl-labs/jpad-web/releases/latest"><img src="https://img.shields.io/github/v/release/jhl-labs/jpad-web?color=blue&label=release" alt="Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-jhl--labs-purple" alt="License" /></a>
  <a href="https://github.com/jhl-labs/jpad-web"><img src="https://img.shields.io/github/stars/jhl-labs/jpad-web?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" alt="Prisma 7" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Bun-1.x-F9F1E1?logo=bun&logoColor=black" alt="Bun" />
</p>

<p align="center">
  <a href="./docs/README.md">한국어 문서</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Features

### Editor & Collaboration
- **Block Editor** — Notion-style rich editor powered by [BlockNote](https://www.blocknotejs.org/)
- **Real-time Collaboration** — Live co-editing with [Yjs](https://yjs.dev/) CRDT + WebSocket
- **Git Versioning** — Every page backed by Git with history restore
- **Backlinks** — `[[Page Name]]` bidirectional linking with graph visualization
- **Slash Commands** — `/` menu with AI actions, blocks, and utilities
- **Right-click Context Menu** — Edit, convert, and AI actions
- **Markdown Import/Export** — Import `.md` files, export as Markdown or HTML

### AI Assistant
- **Inline AI** — Select text and get instant AI actions (summarize, expand, translate, fix grammar)
- **Slash Menu AI** — `/AI 이어쓰기`, `/AI 요약`, etc.
- **Cursor-aware Autocomplete** — `Ctrl+J` continues writing from cursor position
- **AI Chat** — Ask questions about your page with context-aware chat
- **Multi-provider** — Anthropic Claude, OpenAI, Google Gemini, Ollama

### Productivity
- **Calendar** — Monthly calendar with [Google Calendar](https://calendar.google.com/) bidirectional sync
- **TODO** — Task management with priorities, assignees, due dates, inline editing
- **Daily Notes** — Obsidian-style daily journal with mini calendar
- **Knowledge Graph** — Interactive Canvas-based graph of page connections
- **Templates** — 6 built-in templates (meeting notes, project plan, bug report, etc.)
- **Quick Switcher** — `Cmd+K` command palette with recent pages
- **Table of Contents** — Auto-generated from headings with scroll tracking
- **Notifications** — Bell icon with auto-polling for due dates and mentions

### Enterprise
- **SSO** — SAML 2.0 and OpenID Connect (Keycloak tested)
- **SCIM v2** — Automated user/group provisioning
- **Organizations** — Multi-org with verified domain management
- **Audit Logs** — Comprehensive action logging with webhook delivery
- **DLP** — Credit card, SSN, resident ID, AWS key, private key detection
- **Backup/Restore** — Automated backups with restore drill verification
- **Malware Scanning** — ClamAV integration for uploaded files

### Security
- CSP, HSTS, X-Frame-Options security headers
- AES-256-GCM secret encryption
- Path traversal defense, rate limiting (Redis)
- WebSocket viewer write blocking with HMAC token verification

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Docker](https://www.docker.com/) (for PostgreSQL, Redis)

### 1. Clone and Install

```bash
git clone https://github.com/jhl-labs/jpad-web.git
cd jpad-web
bun install
```

### 2. Start Infrastructure

```bash
docker-compose up -d   # PostgreSQL, Redis, MinIO, ClamAV, Qdrant
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
NEXTAUTH_SECRET=<random-string>
APP_ENCRYPTION_KEY=<random-string>
WS_SECRET=<random-string>
```

### 4. Initialize Database

```bash
bun run db:push
```

### 5. Start Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and create your first account.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh/) |
| Framework | [Next.js 15](https://nextjs.org/) (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | PostgreSQL + [Prisma](https://www.prisma.io/) ORM |
| Cache | [Redis](https://redis.io/) (ioredis) |
| Auth | [NextAuth.js](https://next-auth.js.org/) v4 |
| Editor | [BlockNote](https://www.blocknotejs.org/) v0.47 |
| Real-time | [Yjs](https://yjs.dev/) + y-websocket |
| Versioning | [isomorphic-git](https://isomorphic-git.org/) |
| AI | Anthropic, OpenAI, Gemini, Ollama |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v4, Lucide Icons |
| Storage | Local filesystem / S3-compatible |
| Search | JSON / pgvector / Qdrant |

---

## Project Structure

```
jpad-web/
├── deploy/              # Deployment configs (IdP, schedulers)
├── docs/                # Documentation (Korean)
├── prisma/              # Database schema
├── scripts/             # Operational CLI tools
├── src/
│   ├── app/             # Next.js routes & API
│   │   ├── (auth)/      # Login, register, SSO
│   │   ├── (main)/      # Workspace, pages, settings
│   │   └── api/         # REST API (133 endpoints)
│   ├── components/      # React components (40+)
│   │   ├── ai/          # AI panel, summary badge
│   │   ├── editor/      # Collaborative editor, TOC, panels
│   │   ├── calendar/    # Calendar view
│   │   ├── todos/       # Todo list
│   │   ├── graph/       # Knowledge graph
│   │   └── ui/          # Quick switcher, onboarding, etc.
│   ├── lib/             # Business logic, auth, AI, storage
│   └── server/          # WebSocket server (Yjs)
├── tests/
│   ├── e2e/             # Playwright E2E tests (11 specs)
│   ├── smoke/           # Integration smoke tests
│   └── unit/            # Unit tests (56 cases)
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

---

## Development

```bash
bun run dev          # Start Next.js + WebSocket server
bun run dev:next     # Next.js only
bun run dev:ws       # WebSocket server only
bun run db:push      # Push schema to database
bun run db:studio    # Open Prisma Studio
bun test             # Run all tests
bun run test:unit    # Unit tests only
bun run test:e2e     # Playwright E2E tests
bun run lint         # ESLint
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Quick Switcher |
| `Ctrl+J` | AI autocomplete at cursor |
| `Ctrl+Shift+J` | Open AI panel |
| `/` | Slash command menu |
| `Ctrl+/` | Keyboard shortcuts help |
| Right-click | Context menu (edit, convert, AI) |

---

## Deployment

See [docs/deployment.md](./docs/deployment.md) for production deployment with Docker, systemd, or Kubernetes.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/architecture.md) | System architecture and data flow |
| [API Reference](./docs/api-reference.md) | All 133 REST API endpoints |
| [Auth & Permissions](./docs/auth-and-permissions.md) | RBAC, SSO, SCIM |
| [Database](./docs/database.md) | Prisma schema and models |
| [AI Features](./docs/ai-features.md) | AI assistant capabilities |
| [Real-time Collaboration](./docs/realtime-collaboration.md) | Yjs, WebSocket, conflict resolution |
| [Deployment](./docs/deployment.md) | Production setup guide |
| [Enterprise](./docs/enterprise-readiness.md) | SSO, SCIM, DLP, audit logs |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, code style, and PR guidelines.

---

## License

jpad is licensed under the **jpad License** — free for personal and non-commercial use. Commercial use by legal entities requires written permission. See [LICENSE](./LICENSE) for details.

Copyright (c) 2025 [jhl-labs](https://github.com/jhl-labs)
