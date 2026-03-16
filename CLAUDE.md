# jpad — AI-powered Collaborative Wiki

## 프로젝트 개요
Next.js 15 + TypeScript + Prisma + PostgreSQL 기반의 협업 위키 플랫폼.
Yjs 실시간 협업, AI 어시스턴트, 캘린더, TODO, 지식 그래프 포함.

## 빌드 & 테스트
- 설치: `bun install`
- 개발: `bun run dev` (Next.js + WebSocket)
- 빌드: `bun run build`
- 타입 체크: `bunx tsc --noEmit`
- 린트: `bun run lint`
- 전체 테스트: `bun test`
- 유닛 테스트: `bun test tests/unit`
- E2E: `bun run test:e2e`
- Smoke 테스트: `tests/smoke/` 디렉토리 참조
- DB 반영: `bun run db:push`

## 코딩 규칙

### TypeScript
- strict mode 사용. `any` 금지, `as unknown as` 최소화.
- API PATCH 핸들러에서 `Record<string, unknown>` 대신 Prisma 타입 사용 권장.
- `catch` 블록에서 에러 무시 금지. `logError()` 사용.

### React
- CSS 변수 사용 필수: `var(--background)`, `var(--border)`, `var(--primary)`, `var(--muted)`, `var(--sidebar-bg)`, `var(--sidebar-hover)`, `var(--foreground)`.
- 하드코딩 색상(`#fff`, `#fef2f2` 등) 금지. 상태 색상(`#ef4444`, `#22c55e`)은 허용.
- 모든 모달에 `role="dialog"`, `aria-modal="true"` 필수.
- 클릭 가능 div에 `role="button"`, `tabIndex={0}`, 키보드 핸들러 필수.

### API
- 모든 라우트에 `requireAuth()` 필수 (공개 접근은 의도적으로 문서화).
- 쓰기 API에 `rateLimitRedis()` 적용.
- 보안 관련 작업에 `recordAuditLog()` 기록.
- 에러 응답: `{ error: string }` 형식, 영어. 한국어는 UI에서만.
- `"Unauthorized"`만 401, 나머지 서버 에러는 500.

### Git
- 커밋 메시지: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:` 접두사.
- 한국어 커밋 메시지 허용.
- force push 금지 (v1.0.0 이후).

## 디렉토리 구조
- `src/app/api/` — REST API (133 엔드포인트)
- `src/components/` — React 컴포넌트 (40+)
- `src/lib/` — 비즈니스 로직
- `src/server/` — WebSocket 서버
- `prisma/schema.prisma` — DB 스키마
- `tests/unit/` — 유닛 테스트 (bun:test)
- `tests/e2e/` — Playwright E2E
- `docs/` — 한국어 문서 11개

## 주요 패턴
- 인증: `requireAuth()` → `checkWorkspaceAccess(user.id, workspaceId, roles)`
- 감사: `recordAuditLog({ action, actor: createAuditActor(user, role), ... })`
- Rate limit: `rateLimitRedis(\`key:${userId}\`, count, windowMs)`
- 암호화: `encryptSecret(value)` / `decryptSecret(value)` (AES-256-GCM)
- 에디터: BlockNote + Yjs. `InnerEditor` 분리 패턴 (collaboration 준비 후 마운트).

## 스킬 사용
- `/release patch|minor|major` — 릴리스
- `/security-audit` — 보안 감사
- `/code-review` — 코드 리뷰
- `/lint-fix` — 린트 자동 수정
- `/test-coverage` — 테스트 커버리지
- `/hotfix #이슈번호` — 핫픽스
- `/docs-sync` — 문서 동기화
