# 아키텍처

## 시스템 개요

JPAD는 Next.js App Router 기반의 풀스택 애플리케이션으로, 별도의 Bun WebSocket 서버와 함께 동작합니다.

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│   Browser    │────▶│  Next.js 15 Server   │────▶│ PostgreSQL  │
│  (React 19)  │     │  (App Router)        │     │  (Prisma)   │
│              │     │                      │     └─────────────┘
│  BlockNote   │     │  REST API Routes     │
│  + Yjs       │     │  NextAuth            │     ┌─────────────┐
│              │     │  SSR/SSG             │────▶│   Redis     │
└──────┬───────┘     └──────────────────────┘     │  (ioredis)  │
       │                                          └─────────────┘
       │ WebSocket                                       ▲
       │                                                 │
       ▼                                                 │
┌──────────────┐     ┌──────────────────────┐            │
│  Bun WS      │────▶│  isomorphic-git      │            │
│  Server      │     │  (파일시스템)         │            │
│  (Yjs CRDT)  │─────┘                      │────────────┘
│              │     │  data/repos/          │  (Redis PubSub)
└──────────────┘     └──────────────────────┘
```

## 데이터 저장 전략

### 메타데이터 (PostgreSQL)
- 사용자, 워크스페이스, 페이지 트리 구조
- 권한, 멤버십, 백링크 인덱스
- 댓글, 첨부파일 메타데이터, 즐겨찾기
- 캘린더 이벤트, TODO 항목, 알림
- 페이지 템플릿 (내장 + 커스텀)
- Google Calendar 연결 정보
- AI 채팅 히스토리, 시맨틱 임베딩 청크
- 감사 로그, 백업/복구 실행 이력

### 문서 콘텐츠 (Git 파일시스템)
- 워크스페이스별 독립 Git 저장소 (`data/repos/{workspaceId}/`)
- 페이지 콘텐츠는 `{pageId}.md` 파일로 저장
- 데일리 노트는 `daily/{YYYY-MM-DD}` slug로 관리
- 모든 변경사항 자동 커밋 (변경 이력 추적)
- `isomorphic-git`으로 순수 JS Git 구현 (네이티브 git 불필요)

### 실시간 상태 (Redis)
- Yjs 문서 스냅샷 캐시
- 서버 간 문서 업데이트 동기화 (PubSub)
- 분산 잠금 (Git 동시 쓰기 방지)
- Rate limiting
- SAML request ID 캐시

### 파일 첨부 (Local / S3)
- 기본: 로컬 파일시스템 (`data/uploads/`)
- 옵션: AWS S3 (`STORAGE_TYPE=s3`)

## 인증 흐름

```
Browser → NextAuth.js (JWT) → API Routes → Prisma → PostgreSQL
                                    ↓
                              권한 검사 (pageAccess.ts)
                                    ↓
                            Git 저장소 / 리소스
```

1. 사용자가 이메일/비밀번호로 로그인 (`Credentials Provider`) 또는 OIDC/SAML SSO
2. JWT 토큰 발급 (세션에 userId 포함)
3. API 요청마다 `getServerSession()`으로 인증 확인
4. `pageAccess.ts`로 워크스페이스 멤버십 및 역할 검증

## WebSocket 인증

```
Browser → POST /api/ws-token (JWT 쿠키) → HMAC-SHA256 토큰 발급
   ↓
Browser → WebSocket 연결 (token 파라미터) → WS 서버에서 HMAC 검증
```

- REST API에서 단기 토큰 발급 (5분 유효)
- WebSocket 서버는 `WS_SECRET` 환경 변수로 토큰 검증
- 토큰에 userId, workspaceId, pageId 포함

## 실시간 협업 흐름

```
Editor A ──▶ Yjs Update ──▶ WebSocket ──▶ Redis PubSub ──▶ WebSocket ──▶ Editor B
                               │
                               ▼
                          Yjs Snapshot
                          (Redis 캐시)
                               │
                               ▼ (300ms 디바운스)
                          Git Commit
                          (isomorphic-git)
```

1. 에디터 변경 → Yjs 문서 업데이트
2. WebSocket으로 다른 클라이언트에 전파
3. Redis PubSub으로 다중 서버 인스턴스 간 동기화
4. 주기적으로 Markdown으로 직렬화 → Git 커밋
5. 타이틀 변경 → Yjs `pageMeta` 맵으로 실시간 동기화

## 라우트 그룹

| 그룹 | 경로 | 설명 |
|------|------|------|
| `(auth)` | `/login`, `/register`, `/saml/*` | 인증 페이지 |
| `(main)` | `/workspace/*` | 메인 앱 (사이드바 레이아웃) |
| `(main)` | `/workspace/[wId]/calendar` | 캘린더 뷰 |
| `(main)` | `/workspace/[wId]/todos` | TODO 관리 |
| `(main)` | `/workspace/[wId]/daily` | 데일리 노트 |
| `(main)` | `/workspace/[wId]/graph` | 지식 그래프 뷰 |
| `(main)` | `/admin/ops` | 플랫폼 운영 대시보드 |
| `(main)` | `/organizations` | 조직 관리 |
| `api` | `/api/*` | REST API |
| `share` | `/share/[token]` | 공유 링크 뷰어 |
| `wiki` | `/wiki/[workspaceId]/*` | 위키 공개 뷰어 |

## 주요 프론트엔드 컴포넌트

| 컴포넌트 | 경로 | 설명 |
|---------|------|------|
| CollaborativeEditor | `src/components/editor/CollaborativeEditor.tsx` | 실시간 협업 에디터 (InnerEditor 분리 패턴) |
| CalendarView | `src/components/calendar/CalendarView.tsx` | 워크스페이스 캘린더 뷰 |
| TodoList | `src/components/todos/TodoList.tsx` | TODO 관리 뷰 |
| NotificationBell | `src/components/notifications/NotificationBell.tsx` | 인앱 알림 벨 |
| KnowledgeGraph | `src/components/graph/KnowledgeGraph.tsx` | 지식 그래프 시각화 |
| QuickSwitcher | `src/components/ui/QuickSwitcher.tsx` | `Cmd+K` 빠른 페이지 전환 |
| TableOfContents | `src/components/editor/TableOfContents.tsx` | 문서 목차 |
| TemplatePickerModal | `src/components/templates/TemplatePickerModal.tsx` | 템플릿 선택 모달 |
| OnboardingChecklist | `src/components/ui/OnboardingChecklist.tsx` | 신규 사용자 온보딩 |
| OpsDashboard | `src/components/admin/OpsDashboard.tsx` | 플랫폼 운영 대시보드 |

## 주요 비즈니스 로직 모듈

| 모듈 | 경로 | 설명 |
|------|------|------|
| ai.ts | `src/lib/ai.ts` | AI 클라이언트 (다중 provider 지원) |
| aiConfig.ts | `src/lib/aiConfig.ts` | AI 프로필/태스크 라우팅 설정 |
| aiSettings.ts | `src/lib/aiSettings.ts` | 워크스페이스 AI 설정 관리 |
| llmProviders.ts | `src/lib/llmProviders.ts` | LLM provider 추상화 (Anthropic, OpenAI, Gemini, Ollama) |
| notifications.ts | `src/lib/notifications.ts` | 알림 생성/읽음 처리 |
| googleCalendar.ts | `src/lib/googleCalendar.ts` | Google Calendar OAuth 흐름 |
| googleCalendarSync.ts | `src/lib/googleCalendarSync.ts` | Google Calendar 양방향 동기화 |
| builtInTemplates.ts | `src/lib/builtInTemplates.ts` | 내장 페이지 템플릿 |
| semanticSearch.ts | `src/lib/semanticSearch.ts` | 시맨틱 검색 (임베딩 기반) |
| vectorStore.ts | `src/lib/vectorStore.ts` | 벡터 스토어 추상화 (JSON, pgvector, Qdrant) |
| audit.ts | `src/lib/audit.ts` | 감사 로그 기록 |
| retention.ts | `src/lib/retention.ts` | 데이터 보존 정책 실행 |
| backup.ts | `src/lib/backup.ts` | 백업 생성 |
| uploadSecurity.ts | `src/lib/uploadSecurity.ts` | 업로드 보안 스캔 (ClamAV) |
| uploadDlp.ts | `src/lib/uploadDlp.ts` | 업로드 DLP 검사 |
| scim.ts | `src/lib/scim.ts` | SCIM 프로비저닝 |
