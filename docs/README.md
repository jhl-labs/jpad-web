# JPAD - AI 기반 협업 위키 플랫폼

Notion과 Obsidian을 결합한 AI 기반 실시간 협업 위키 플랫폼입니다.

---

## 주요 기능

### 에디터 & 협업
- **블록 에디터** - [BlockNote](https://www.blocknotejs.org/) 기반 Notion 스타일 리치 에디터
- **실시간 협업** - [Yjs](https://yjs.dev/) CRDT + WebSocket 기반 동시 편집
- **Git 버전 관리** - isomorphic-git 기반 페이지별 Git 히스토리, 복원
- **백링크** - `[[페이지명]]` 양방향 링크 + 그래프 시각화
- **슬래시 명령어** - `/` 메뉴에서 AI 액션, 블록, 유틸리티 실행
- **우클릭 컨텍스트 메뉴** - 편집, 변환, AI 작업
- **Markdown 가져오기/내보내기** - `.md` 파일 가져오기, Markdown/HTML 내보내기

### AI 어시스턴트
- **인라인 AI** - 텍스트 선택 시 플로팅 툴바 (요약, 확장, 번역, 문법 교정)
- **슬래시 메뉴 AI** - `/AI 이어쓰기`, `/AI 요약`, `/AI 확장`, `/AI 문법 교정`, `/AI 번역`, `/AI 톤 변경`, `/AI 액션 아이템`
- **커서 기반 이어쓰기** - `Ctrl+J`로 커서 위치에서 자연스럽게 이어 쓰기
- **AI 채팅** - 페이지 컨텍스트 기반 Q&A, 시맨틱 검색 지원
- **AI 패널** - 글쓰기 도우미 (7가지 액션) + 채팅 탭, sessionStorage 히스토리
- **멀티 프로바이더** - Anthropic, OpenAI, Google Gemini, Ollama, OpenAI-compatible
- **워크스페이스별 AI 프로필/태스크 라우팅** - 태스크별(general, write, chat, summary, autocomplete, embedding) 프로필 분리

### 생산성
- **캘린더** - 월간 캘린더, [Google Calendar](https://calendar.google.com/) 양방향 동기화
- **TODO** - 우선순위(low/medium/high/urgent), 담당자, 마감일, 인라인 편집
- **데일리 노트** - Obsidian 스타일 날짜별 자동 생성, 미니 캘린더
- **지식 그래프** - Canvas 기반 페이지 관계 시각화
- **템플릿** - 내장 템플릿 6종 (회의록, 프로젝트 계획, 버그 리포트 등) + 커스텀 템플릿
- **Quick Switcher** - `Cmd+K` 전역 검색 + 최근 페이지
- **목차 (Table of Contents)** - 제목 기반 자동 생성, 스크롤 추적
- **알림** - 벨 아이콘, 마감일/멘션 자동 폴링
- **온보딩 체크리스트** - 신규 사용자 가이드

### 엔터프라이즈
- **SSO** - SAML 2.0 및 OpenID Connect (Keycloak 테스트 완료)
- **SCIM v2** - 자동 사용자/그룹 프로비저닝
- **조직 관리** - 다중 조직, 도메인 검증
- **감사 로그** - 상세 액션 로깅, 웹훅 전달
- **DLP** - 신용카드, SSN, 주민번호, AWS 키, 개인키 탐지
- **백업/복원** - 자동 백업, 복원 드릴 검증
- **악성코드 스캔** - ClamAV 연동

### 보안
- CSP, HSTS, X-Frame-Options 보안 헤더
- AES-256-GCM 시크릿 암호화
- 경로 탐색 방어, Redis 기반 요청 제한
- WebSocket viewer 쓰기 차단 (HMAC 토큰 검증)

---

## 빠른 시작

### 사전 요구사항

- [Bun](https://bun.sh/) v1.0+
- [Docker](https://www.docker.com/) (PostgreSQL, Redis 등)

### 1. 클론 및 설치

```bash
git clone https://github.com/jhl-labs/jpad-web.git
cd jpad-web
bun install
```

### 2. 인프라 시작

```bash
docker-compose up -d   # PostgreSQL, Redis, MinIO, ClamAV, Qdrant
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일에서 최소한 다음을 설정합니다:

```env
NEXTAUTH_SECRET=<랜덤 문자열>
APP_ENCRYPTION_KEY=<랜덤 문자열>
WS_SECRET=<랜덤 문자열>
```

### 4. 데이터베이스 초기화

```bash
bun run db:push
```

### 5. 개발 서버 시작

```bash
bun run dev
```

[http://localhost:3000](http://localhost:3000)을 열고 첫 계정을 생성합니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Runtime | [Bun](https://bun.sh/) |
| Framework | [Next.js 15](https://nextjs.org/) (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | PostgreSQL + [Prisma](https://www.prisma.io/) ORM |
| Cache/PubSub | [Redis](https://redis.io/) (ioredis) |
| Auth | [NextAuth.js](https://next-auth.js.org/) v4 (Credentials, OIDC, SAML, JWT) |
| Editor | [BlockNote](https://www.blocknotejs.org/) v0.47 (Notion 스타일 블록 에디터) |
| 실시간 협업 | [Yjs](https://yjs.dev/) CRDT + WebSocket (커스텀 y-websocket 서버) |
| 버전 관리 | [isomorphic-git](https://isomorphic-git.org/) (파일시스템 Git 저장소) |
| AI | Anthropic, OpenAI, Gemini, Ollama, OpenAI-compatible |
| UI | [Tailwind CSS](https://tailwindcss.com/) v4, Lucide Icons |
| Storage | Local filesystem / S3-compatible |
| Search | JSON / pgvector / Qdrant |
| Validation | Zod |

---

## 개발 명령어

```bash
bun run dev          # Next.js + WebSocket 서버 동시 시작
bun run dev:next     # Next.js만 시작
bun run dev:ws       # WebSocket 서버만 시작
bun run build        # 프로덕션 빌드
bun run start        # 프로덕션 서버 시작
bun run db:push      # 스키마를 데이터베이스에 반영
bun run db:studio    # Prisma Studio 열기
bun run db:migrate   # Prisma 마이그레이션 실행
bun test             # 전체 테스트 실행
bun run test:unit    # 단위 테스트
bun run test:e2e     # Playwright E2E 테스트
bun run lint         # ESLint 실행
```

---

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Cmd+K` / `Ctrl+K` | Quick Switcher |
| `Ctrl+J` | AI 커서 이어쓰기 |
| `Ctrl+Shift+J` | AI 패널 열기 |
| `/` | 슬래시 명령어 메뉴 |
| `Ctrl+/` | 키보드 단축키 도움말 |
| 우클릭 | 컨텍스트 메뉴 (편집, 변환, AI) |

---

## 디렉토리 구조

```
jpad/
├── deploy/              # 배포 설정 (IdP, 스케줄러)
│   ├── idp/             # Keycloak realm 설정
│   ├── scripts/         # 운영 배치 래퍼
│   └── schedulers/      # cron/systemd/k8s 템플릿
├── docs/                # 문서 (한국어)
├── prisma/              # 데이터베이스 스키마
│   └── schema.prisma
├── scripts/             # CLI 도구 (백업, 보안 스캔, 재색인 등)
├── src/
│   ├── app/             # Next.js 라우트 & API
│   │   ├── (auth)/      # 인증 (로그인, 회원가입, SSO)
│   │   ├── (main)/      # 메인 (워크스페이스, 페이지, 설정)
│   │   │   ├── admin/ops/     # 플랫폼 운영 대시보드
│   │   │   ├── organizations/ # 조직 관리
│   │   │   └── workspace/[workspaceId]/
│   │   │       ├── page/[pageId]/  # 페이지 에디터
│   │   │       ├── settings/       # 워크스페이스 설정
│   │   │       ├── graph/          # 지식 그래프 뷰
│   │   │       ├── calendar/       # 캘린더 뷰
│   │   │       ├── todos/          # TODO 관리
│   │   │       └── daily/          # 데일리 노트
│   │   ├── api/         # REST API 라우트
│   │   ├── share/       # 공유 링크 페이지
│   │   └── wiki/        # 위키 공개 뷰어
│   ├── components/      # React 컴포넌트
│   │   ├── ai/          # AI 패널, 요약 배지
│   │   ├── editor/      # 협업 에디터, TOC, 패널
│   │   ├── calendar/    # 캘린더 컴포넌트
│   │   ├── todos/       # TODO 컴포넌트
│   │   ├── graph/       # 그래프 뷰
│   │   ├── sidebar/     # 사이드바 (페이지 트리, 휴지통)
│   │   ├── templates/   # 템플릿 선택
│   │   ├── notifications/ # 알림
│   │   ├── organizations/ # 조직 관리
│   │   └── ui/          # Quick Switcher, 온보딩 등
│   ├── lib/             # 비즈니스 로직, 인증, AI, 스토리지
│   │   ├── auth/        # 인증 헬퍼 (OIDC, SAML, SSO 토큰)
│   │   ├── git/         # Git 저장소 관리
│   │   └── markdown/    # Markdown 직렬화
│   └── server/          # WebSocket 서버 (Yjs)
│       ├── ws.ts        # Yjs WebSocket 서버
│       └── yjsPersistence.ts  # Yjs 영속화 모듈
├── tests/
│   ├── e2e/             # Playwright E2E 테스트
│   ├── smoke/           # 통합 스모크 테스트
│   └── unit/            # 단위 테스트
├── data/                # 런타임 데이터 (gitignore)
│   ├── repos/           # Git 저장소 (워크스페이스별)
│   ├── uploads/         # 로컬 파일 첨부
│   └── yjs/             # Yjs 스냅샷
├── .claude/             # Claude Code 설정
│   ├── rules/           # 코딩 규칙
│   ├── settings.json    # Claude 설정
│   └── skills/          # Claude 스킬
├── .github/             # GitHub 설정
│   ├── ISSUE_TEMPLATE/  # 이슈 템플릿
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── workflows/       # CI/CD 워크플로우
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md          # 보안 정책
└── CHANGELOG.md
```

---

## 문서 목차

| 문서 | 설명 |
|------|------|
| [아키텍처](./architecture.md) | 시스템 구조 및 데이터 흐름 |
| [API 레퍼런스](./api-reference.md) | REST API 엔드포인트 |
| [인증 및 권한](./auth-and-permissions.md) | RBAC, SSO, SCIM |
| [데이터베이스](./database.md) | Prisma 스키마 및 모델 |
| [AI 기능](./ai-features.md) | AI 어시스턴트 기능 상세 |
| [실시간 협업](./realtime-collaboration.md) | Yjs, WebSocket, 충돌 해결 |
| [Git 버전 관리](./git-versioning.md) | isomorphic-git 기반 문서 버전 관리 |
| [컴포넌트 구조](./components.md) | 프론트엔드 컴포넌트 레퍼런스 |
| [배포 및 설정](./deployment.md) | 환경 변수, Docker, 실행 방법 |
| [엔터프라이즈 준비도](./enterprise-readiness.md) | 보안, 운영성, 엔터프라이즈 기능 |

운영 스케줄러 템플릿:
- [deploy/schedulers/README.md](../deploy/schedulers/README.md) - cron/systemd/k8s CronJob 예시
- 감사 로그 export/SIEM webhook는 [deployment.md](./deployment.md)의 `Audit Log Delivery` 섹션 참고

---

## 라이선스

jpad는 **jpad License**로 배포됩니다. 개인 및 비상업적 용도로 무료 사용이 가능하며, 법인의 상업적 사용에는 사전 서면 동의가 필요합니다. 자세한 내용은 [LICENSE](../LICENSE)를 참조하세요.

Copyright (c) 2025 [jhl-labs](https://github.com/jhl-labs)
