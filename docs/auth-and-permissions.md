# 인증 및 권한 시스템

## 인증

### NextAuth.js 설정
- **Provider:** Credentials (이메일 + 비밀번호), 선택적 OIDC SSO, 선택적 SAML SSO
- **세션 전략:** JWT
- **비밀번호 해싱:** bcryptjs
- **설정 파일:** `src/lib/auth/options.ts`

### 인증 흐름
1. 회원가입: `POST /api/auth/register` → bcrypt 해시 → DB 저장
2. 로그인: NextAuth Credentials Provider → bcrypt 비교 → JWT 발급 → `lastLoginAt` 갱신 → 도메인 기반 조직 auto-join
3. OIDC SSO: IdP 인증 성공 → PKCE + state 검증 → `oidcIssuer + oidcSubject` 기준으로 사용자 연결 또는 JIT 생성 → 조직 auto-join
4. SAML SSO: ACS 검증 (`validateInResponseTo=always`, Redis-backed request cache) → `samlIssuer + samlSubject` 기준으로 사용자 연결/JIT 생성 → 일회성 `SsoLoginToken`으로 NextAuth 세션 확정 → 조직 auto-join
5. 세션: JWT에 `userId` 포함, `getServerSession()`으로 서버 사이드 인증
6. 미인증 사용자: 자동으로 `/login` 리다이렉트

### OIDC / SAML 정책
- `OIDC_ENABLED=1`일 때만 활성화
- 기본 정책은 `OIDC_REQUIRE_VERIFIED_EMAIL=1`, `OIDC_ALLOW_EMAIL_LINKING=0`
- 기존 로컬 계정과 SSO 계정을 이메일로 자동 연결하려면 운영자가 일시적으로 `OIDC_ALLOW_EMAIL_LINKING=1`을 설정해야 함
- `SAML_ENABLED=1`일 때 `GET /api/auth/saml/login`, `POST /api/auth/saml/acs`, `GET /api/auth/saml/metadata`가 활성화됨
- 기본 정책은 `SAML_REQUIRE_EMAIL=1`, `SAML_ALLOW_EMAIL_LINKING=0`
- SAML 응답 검증은 `validateInResponseTo=always`와 Redis-backed request cache를 사용하고, Redis가 없으면 프로세스 메모리 fallback으로 동작함
- SAML 로그인 완료는 브라우저가 `/saml/complete`에서 일회성 `SsoLoginToken`을 소비하는 방식으로 마무리됨
- `AUTH_ALLOW_CREDENTIALS_LOGIN=0`이면 이메일/비밀번호 로그인 비활성화
- `AUTH_ALLOW_SELF_SIGNUP=0`이면 `/register` 및 회원가입 API 비활성화
- 검증된 조직 도메인(`OrganizationDomain.autoJoin=true`)과 이메일 도메인이 일치하면 로그인 시 조직 멤버십이 자동 생성됨
- 비활성(`active=false`) SCIM identity가 있는 조직은 auto-join에서 제외되어, IdP에서 deprovision된 사용자가 다시 로그인만으로 복구되지 않음

### 로그인 Rate Limit
- IP당 10회/분 Redis 기반 rate limit (`extractClientIp` + `rateLimitRedis`)
- SCIM 엔드포인트: 토큰당 600회/분

### SCIM 프로비저닝
- 조직 `owner/admin`은 조직별 SCIM bearer token을 발급/폐기할 수 있음
- SCIM endpoint base URL: `/api/scim/v2`
- 현재 지원 범위:
  - `GET /ServiceProviderConfig`
  - `GET /ResourceTypes`
  - `GET /Schemas`
  - `GET/POST /Users`
  - `GET/PATCH/DELETE /Users/{id}`
  - `GET/POST /Groups`
  - `GET/PATCH/DELETE /Groups/{id}`
- SCIM `User.active=false` 또는 `DELETE /Users/{id}`는 해당 조직 멤버십을 제거해서 접근을 끊음
- 이미 `owner/admin`으로 승격된 조직 멤버는 SCIM deprovision으로 자동 제거되지 않고 `409`로 막음
- 조직 `owner/admin`은 SCIM group을 조직 소속 워크스페이스 role에 매핑할 수 있음
- SCIM-managed 워크스페이스 멤버는 수동 role 변경/제거 API로 수정할 수 없고, IdP group 또는 mapping 변경으로만 갱신됨
- 기존 수동 워크스페이스 멤버십이 이미 있으면 SCIM mapping이 그 role을 강제로 덮어쓰지는 않음. 완전한 IdP 제어가 필요하면 먼저 수동 멤버십을 정리한 뒤 mapping을 적용해야 함

### 헬퍼 함수 (`src/lib/auth/helpers.ts`)
- `getCurrentUser()`: 현재 세션의 `userId` 우선, 없으면 email fallback으로 사용자 조회
- `requireAuth()`: 인증 가드. 미인증 시 `Unauthorized` 에러
- `requirePlatformAdmin()`: 전역 운영 관리자 가드. `PLATFORM_ADMIN_EMAILS` 환경변수에 등록된 이메일만 허용
- `checkWorkspaceAccess(userId, workspaceId, requiredRole?)`: 워크스페이스 멤버십 확인. 멤버가 아닌 경우 public workspace이면 `viewer` + `isPublicViewer: true`로 반환

---

## 5단계 역할 시스템

| 역할 | 레벨 | 설명 |
|------|------|------|
| **Owner** | 5 | 워크스페이스 소유자. 삭제, 모든 설정 변경, API 키 관리 |
| **Admin** | 4 | 관리자. 멤버 관리, 설정 변경 (API 키 제외) |
| **Maintainer** | 3 | 유지보수자. 페이지 관리, editor/viewer 초대 가능 |
| **Editor** | 2 | 편집자. 페이지 생성/편집 가능 |
| **Viewer** | 1 | 뷰어. 읽기 전용 |

### 역할별 권한 매트릭스

| 기능 | Owner | Admin | Maintainer | Editor | Viewer |
|------|:-----:|:-----:|:----------:|:------:|:------:|
| 페이지 읽기 | O | O | O | O | O |
| 페이지 생성/편집 | O | O | O | O | X |
| 페이지 삭제 | O | O | O | X | X |
| 휴지통 관리 | O | O | O | X | X |
| 멤버 초대 | O | O | O* | X | X |
| 멤버 제거 | O | O | X | X | X |
| 역할 변경 | O | O** | X | X | X |
| 워크스페이스 설정 | O | O | X | X | X |
| API 키 변경 | O | X | X | X | X |
| 워크스페이스 삭제 | O | X | X | X | X |

\* Maintainer는 editor/viewer만 초대 가능
\** Admin은 다른 admin의 역할 변경 불가

---

## 페이지 접근 제어 (`src/lib/pageAccess.ts`)

### 접근 모드
1. **workspace** (기본): 워크스페이스 멤버 전원 접근 가능
2. **restricted**: `PagePermission` 테이블에 등록된 사용자만 접근 가능

### 핵심 함수

```typescript
// 워크스페이스 역할 타입
type WorkspaceRole = "owner" | "admin" | "maintainer" | "editor" | "viewer";

// 페이지 접근 모드 타입
type PageAccessMode = "workspace" | "restricted";

// 페이지 접근 컨텍스트 조회
getPageAccessContext(userId, pageId): Promise<PageAccessContext | null>
// → canView, canEdit, canManage, hasExplicitPermission 포함

// 접근 가능한 페이지 목록
listAccessiblePages(userId, workspaceId): Promise<{ member, pages }>

// 접근 가능한 페이지 ID Set
listAccessiblePageIds(userId, workspaceId): Promise<Set<string>>
```

### 접근 검사 흐름
1. `WorkspaceMember` 테이블에서 멤버십 확인 (`checkWorkspaceAccess`)
2. 멤버가 아닌 경우: workspace visibility가 `public`이면 `viewer` + `isPublicViewer: true`로 접근 허용
3. 페이지 `accessMode`가 `restricted`인 경우: `PagePermission` 추가 확인
4. Owner/Admin/Maintainer는 restricted 페이지에도 항상 접근 가능
5. Editor/Viewer는 `restricted` 모드에서 명시적 permission이 있어야 접근 가능
6. `canEdit`은 `canView`가 true이고 역할이 owner/admin/maintainer/editor인 경우에만 true

---

## 공개 접근 (`src/lib/publicAccess.ts`)

### 공유 링크
- `PageShareLink` 모델로 토큰 기반 공유
- 만료 시간 설정 가능
- 폐기(revoke) 가능

### 공개 위키
- 워크스페이스 `publicWikiEnabled=true` 시 활성화
- `visibility="public"` 설정 시 자동 활성화
- 인증 없이 `/wiki/[workspaceId]` 경로로 접근

---

## WebSocket 인증

### 토큰 기반 인증 (HMAC-SHA256)
WebSocket은 쿠키 기반 인증이 어려우므로 별도 토큰 시스템 사용.

1. **토큰 발급**: `POST /api/ws-token`
   - JWT 세션에서 userId 추출 (`requireAuth()`)
   - `getPageAccessContext`로 페이지 접근 권한 확인 (canView 필수)
   - `{userId, workspaceId, pageId, canEdit, timestamp}` 데이터에 HMAC-SHA256 서명
   - canEdit 포함: WebSocket 연결에서 편집 권한 여부를 전달
   - 유효 기간: 5분

2. **토큰 검증**: WebSocket 서버 (`server/ws.ts`)
   - 연결 시 URL 파라미터에서 토큰 추출
   - HMAC 서명 검증
   - 타임스탬프 만료 확인
   - workspaceId/pageId 일치 확인

### 환경 변수
- `WS_SECRET`: HMAC 서명 비밀키 (Next.js 서버와 WS 서버 공유). 미설정 시 `NEXTAUTH_SECRET` fallback

---

## 미들웨어 (`src/middleware.ts`)

### CORS
- `NEXTAUTH_URL`의 origin + `CORS_ALLOWED_ORIGINS` 환경변수에서 허용 origin 목록 구성
- API 라우트(`/api/`)에 CORS 헤더 자동 추가
- OPTIONS preflight 204 응답, `Access-Control-Max-Age: 86400`

### 요청 추적
- 모든 요청에 `x-request-id` 헤더 자동 부여 (기존 헤더가 있으면 유지)

### 인증 보호 경로
```
/organizations/:path*
/workspace/:path*
/api/organizations/:path*
/api/workspaces/:path*
/api/pages/:path*
/api/backlinks/:path*
/api/ai/:path*
/api/ws-token/:path*
/api/upload/:path*
/api/trash/:path*
/api/auth/:path*
/api/admin/:path*
/api/scim/:path*
```
