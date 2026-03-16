# API 레퍼런스

모든 API는 `/api` 경로 하에 위치합니다. 인증이 필요한 엔드포인트는 NextAuth JWT 세션 쿠키를 통해 인증합니다.

## 헬스체크 API

### `GET /api/health`
서버 및 데이터베이스 상태 확인. 인증 불필요.

**응답 (200):**
```json
{ "status": "ok", "version": "1.0.0", "uptime": 12345.678 }
```

**응답 (503):**
```json
{ "status": "error", "error": "Database connection failed" }
```

---

## 인증 API

### `POST /api/auth/register`
사용자 회원가입.

**Body:**
```json
{ "email": "user@example.com", "name": "홍길동", "password": "password123" }
```

### `POST /api/auth/[...nextauth]`
NextAuth.js 핸들러 (로그인, 세션 등). Credentials Provider + OIDC + SAML 지원.

### `GET /api/auth/saml/login`
SAML SSO 인증 요청 시작 (AuthnRequest → IdP 리다이렉트).

### `POST /api/auth/saml/acs`
SAML ACS (Assertion Consumer Service). IdP로부터 SAML Response 수신 및 검증.

### `GET /api/auth/saml/metadata`
SAML SP 메타데이터 XML 반환.

### `GET /api/auth/profile`
현재 인증된 사용자의 프로필 정보 조회.

**응답:**
```json
{ "id": "uuid", "name": "홍길동", "email": "user@example.com", "createdAt": "..." }
```

### `PATCH /api/auth/profile`
사용자 이름 수정.

**Body:**
```json
{ "name": "새 이름" }
```

### `PATCH /api/auth/password`
비밀번호 변경. 현재 비밀번호 확인 후 새 비밀번호로 변경. Rate limit 적용 (5회/분).

**Body:**
```json
{ "currentPassword": "현재 비밀번호", "newPassword": "새 비밀번호 (8자 이상)" }
```

---

## 워크스페이스 API

### `GET /api/workspaces`
현재 사용자의 워크스페이스 목록 조회.

**응답:** 멤버 수, 페이지 수 포함.

### `POST /api/workspaces`
새 워크스페이스 생성. 생성자는 자동으로 `owner` 역할.

**Body:**
```json
{ "name": "내 워크스페이스", "description": "설명", "visibility": "private" }
```

### `GET /api/workspaces/[workspaceId]`
워크스페이스 상세 조회. 현재 사용자의 역할(`currentRole`) 포함.

### `PATCH /api/workspaces/[workspaceId]`
워크스페이스 정보 수정 (owner/admin만 가능).

**Body:**
```json
{ "name": "새 이름", "description": "새 설명", "visibility": "public" }
```
- `visibility`를 `public`으로 변경 시 `publicWikiEnabled` 자동 활성화

### `DELETE /api/workspaces/[workspaceId]`
워크스페이스 삭제 (owner만 가능).

---

## 워크스페이스 멤버 API

### `POST /api/workspaces/[workspaceId]/members`
멤버 초대. owner/admin/maintainer만 가능.

**Body:**
```json
{ "email": "user@example.com", "role": "editor" }
```

**역할 제한:**
- Owner: 모든 역할 초대 가능
- Admin: admin 이하 초대 가능
- Maintainer: editor/viewer만 초대 가능

### `DELETE /api/workspaces/[workspaceId]/members`
멤버 제거.

**Body:**
```json
{ "memberId": "uuid" }
```

### `PATCH /api/workspaces/[workspaceId]/members/[memberId]`
멤버 역할 변경.

**Body:**
```json
{ "role": "maintainer" }
```

**제한사항:**
- Owner 역할은 변경 불가
- Admin은 다른 Admin의 역할 변경 불가
- 자기 자신의 역할 변경 불가

---

## 워크스페이스 설정 API

### `GET /api/workspaces/[workspaceId]/settings`
설정 조회. Owner가 아닌 경우 API 키 마스킹 처리.

### `PATCH /api/workspaces/[workspaceId]/settings`
설정 수정 (owner/admin만 가능). API 키 변경은 owner만 가능.

**Body:**
```json
{
  "aiEnabled": true,
  "aiModel": "claude-sonnet-4-20250514",
  "aiApiKey": "sk-...",
  "aiMaxTokens": 4096,
  "allowPublicPages": true,
  "allowMemberInvite": true,
  "defaultPageAccess": "workspace",
  "maxFileUploadMb": 20,
  "uploadDlpScanMode": "best_effort",
  "googleCalendarClientId": "...",
  "googleCalendarClientSecret": "..."
}
```

---

## 페이지 API

### `GET /api/pages?workspaceId={id}`
워크스페이스의 페이지 목록 조회 (삭제되지 않은 페이지만).

### `POST /api/pages`
새 페이지 생성. Git 저장소에 빈 `.md` 파일 생성 및 커밋.

**Body:**
```json
{ "workspaceId": "uuid", "parentId": "uuid (optional)" }
```

### `GET /api/pages/[pageId]`
페이지 메타데이터 조회 (현재 사용자 역할 포함).

### `PATCH /api/pages/[pageId]`
페이지 메타데이터 수정 (title, icon, coverImage, position, parentId 등).

**Body:**
```json
{ "title": "새 제목", "icon": "📝", "coverImage": "url 또는 gradient" }
```

### `DELETE /api/pages/[pageId]`
페이지 소프트 삭제 (isDeleted=true, 휴지통으로 이동).

---

## 페이지 콘텐츠 API

### `GET /api/pages/[pageId]/content`
Git 저장소에서 페이지 Markdown 콘텐츠 읽기.

### `PUT /api/pages/[pageId]/content`
콘텐츠 저장. Git 커밋 생성 + 백링크 인덱싱.

**Body:**
```json
{ "content": "# 제목\n\n본문 내용" }
```

---

## 페이지 히스토리 API

### `GET /api/pages/[pageId]/history`
Git 커밋 히스토리 조회. 각 커밋의 SHA, 메시지, 타임스탬프, 작성자 정보 반환.

---

## 페이지 내보내기 API

### `GET /api/pages/[pageId]/export`
페이지를 Markdown 파일로 다운로드. `Content-Disposition: attachment` 헤더 포함.

---

## 페이지 검색 API

### `GET /api/pages/search?workspaceId={id}&q={query}`
페이지 제목 및 콘텐츠 전문 검색.

---

## 페이지 댓글 API

### `GET /api/pages/[pageId]/comments`
페이지 댓글 목록 (스레드 구조 포함).

### `POST /api/pages/[pageId]/comments`
댓글 작성.

**Body:**
```json
{ "content": "댓글 내용", "parentId": "uuid (답글 시)" }
```

### `PATCH /api/pages/[pageId]/comments/[commentId]`
댓글 수정 또는 해결 표시.

**Body:**
```json
{ "content": "수정된 내용" }
```
또는
```json
{ "resolved": true }
```

### `DELETE /api/pages/[pageId]/comments/[commentId]`
댓글 삭제 (작성자만).

---

## 페이지 첨부파일 API

### `GET /api/pages/[pageId]/attachments`
페이지 첨부파일 목록.

### `DELETE /api/pages/[pageId]/attachments`
첨부파일 삭제.

**Body:**
```json
{ "attachmentId": "uuid" }
```

### `POST /api/pages/[pageId]/attachments/[attachmentId]/rescan`
개별 첨부파일 보안 재검사 트리거.

---

## 페이지 권한 API

### `GET /api/pages/[pageId]/permissions`
페이지 접근 권한 조회 (accessMode, 허용 사용자 목록).

### `PUT /api/pages/[pageId]/permissions`
페이지 접근 모드 및 허용 사용자 설정.

**Body:**
```json
{ "accessMode": "restricted", "userIds": ["uuid1", "uuid2"] }
```

---

## 페이지 공유 API

### `GET /api/pages/[pageId]/share`
현재 공유 링크 조회.

### `POST /api/pages/[pageId]/share`
공유 링크 생성 (토큰 기반).

### `DELETE /api/pages/[pageId]/share`
공유 링크 폐기.

---

## 관련 페이지 API

### `GET /api/pages/[pageId]/related`
시맨틱 유사도 기반 관련 페이지 추천.

---

## 백링크 API

### `GET /api/backlinks?pageId={id}`
특정 페이지를 참조하는 백링크 목록.

---

## 즐겨찾기 API

### `GET /api/favorites?workspaceId={id}`
현재 사용자의 즐겨찾기 페이지 목록.

### `POST /api/favorites`
즐겨찾기 추가.

**Body:**
```json
{ "pageId": "uuid" }
```

### `DELETE /api/favorites`
즐겨찾기 제거.

**Body:**
```json
{ "pageId": "uuid" }
```

---

## 그래프 API

### `GET /api/graph?workspaceId={id}`
워크스페이스의 페이지-백링크 그래프 데이터. 노드(페이지)와 엣지(백링크) 반환.

### `GET /api/workspaces/[workspaceId]/graph`
워크스페이스 지식 그래프 데이터. 부모-자식 관계 + 백링크 엣지 모두 포함.

**응답:**
```json
{
  "nodes": [{ "id": "...", "title": "...", "slug": "...", "icon": "...", "parentId": null }],
  "edges": [{ "source": "...", "target": "...", "type": "parent|backlink" }]
}
```

---

## 캘린더 API

### `GET /api/workspaces/[workspaceId]/calendar?start={ISO}&end={ISO}`
워크스페이스 캘린더 이벤트 목록 조회. 날짜 범위 필터링 가능.

**응답:** 이벤트 배열 (작성자, 연결된 페이지 정보 포함).

### `POST /api/workspaces/[workspaceId]/calendar`
캘린더 이벤트 생성 (editor 이상).

**Body:**
```json
{
  "title": "회의",
  "description": "주간 회의",
  "startAt": "2026-03-16T10:00:00Z",
  "endAt": "2026-03-16T11:00:00Z",
  "allDay": false,
  "color": "#3b82f6",
  "location": "회의실 A",
  "recurrence": null,
  "pageId": "uuid (optional)"
}
```

### `GET /api/workspaces/[workspaceId]/calendar/[eventId]`
캘린더 이벤트 상세 조회.

### `PATCH /api/workspaces/[workspaceId]/calendar/[eventId]`
캘린더 이벤트 수정 (editor 이상).

### `DELETE /api/workspaces/[workspaceId]/calendar/[eventId]`
캘린더 이벤트 삭제 (editor 이상).

---

## TODO API

### `GET /api/workspaces/[workspaceId]/todos?completed={bool}&assignee={userId}&priority={level}&pageId={id}`
워크스페이스 TODO 목록 조회. 필터링 파라미터 지원.

**응답:**
```json
{
  "todos": [...],
  "total": 15,
  "completedCount": 5
}
```

### `POST /api/workspaces/[workspaceId]/todos`
TODO 생성 (editor 이상).

**Body:**
```json
{
  "title": "문서 작성",
  "description": "API 문서 업데이트",
  "priority": "high",
  "dueDate": "2026-03-20T00:00:00Z",
  "assigneeId": "uuid (optional)",
  "pageId": "uuid (optional)"
}
```

**priority 값:** `low`, `medium`, `high`, `urgent`

### `PATCH /api/workspaces/[workspaceId]/todos/[todoId]`
TODO 수정 (editor 이상).

**Body:**
```json
{
  "title": "수정된 제목",
  "completed": true,
  "priority": "urgent",
  "dueDate": null,
  "assigneeId": null,
  "sortOrder": 5
}
```

### `DELETE /api/workspaces/[workspaceId]/todos/[todoId]`
TODO 삭제 (editor 이상).

---

## 데일리 노트 API

### `GET /api/workspaces/[workspaceId]/daily?date={YYYY-MM-DD}`
데일리 노트 조회 또는 자동 생성. 날짜를 지정하지 않으면 오늘 날짜 사용.
- 해당 날짜의 데일리 노트가 없으면 자동 생성 (viewer 제외)
- 기본 템플릿: 할 일, 메모, 회고 섹션
- slug 형식: `daily/{YYYY-MM-DD}`

**응답:** Page 객체.

### `GET /api/workspaces/[workspaceId]/daily/list?month={YYYY-MM}`
특정 월의 데일리 노트가 존재하는 날짜 목록 조회.

**응답:**
```json
{ "dates": ["2026-03-01", "2026-03-05", "2026-03-16"] }
```

---

## 템플릿 API

### `GET /api/workspaces/[workspaceId]/templates?category={category}`
워크스페이스 템플릿 목록 조회 (내장 + 커스텀).

**카테고리:** `meeting`, `project`, `journal`, `custom`

**응답:**
```json
{
  "builtIn": [{ "id": "...", "name": "...", "category": "...", "content": "...", "isBuiltIn": true }],
  "custom": [{ "id": "...", "name": "...", "category": "...", "content": "...", "createdBy": {...} }]
}
```

### `POST /api/workspaces/[workspaceId]/templates`
커스텀 템플릿 생성 (editor 이상).

**Body:**
```json
{
  "name": "주간 회의록",
  "description": "매주 사용하는 회의 템플릿",
  "icon": "📋",
  "content": "# 주간 회의록\n\n## 참석자\n\n## 안건\n\n## 결정사항\n",
  "category": "meeting"
}
```

### `PATCH /api/workspaces/[workspaceId]/templates/[templateId]`
커스텀 템플릿 수정 (editor 이상). 내장 템플릿은 수정 불가.

### `DELETE /api/workspaces/[workspaceId]/templates/[templateId]`
커스텀 템플릿 삭제 (maintainer 이상). 내장 템플릿은 삭제 불가.

---

## Google Calendar 연동 API

### `GET /api/workspaces/[workspaceId]/google-calendar`
현재 사용자의 Google Calendar 연결 상태 조회.

**응답:**
```json
{
  "connected": true,
  "connection": {
    "id": "...",
    "calendarId": "primary",
    "syncEnabled": true,
    "lastSyncAt": "2026-03-16T00:00:00Z",
    "tokenExpiry": "...",
    "createdAt": "..."
  }
}
```

### `GET /api/workspaces/[workspaceId]/google-calendar/connect`
Google Calendar OAuth 인증 시작. Google 인증 페이지로 리다이렉트.
- 워크스페이스 설정에 `googleCalendarClientId`, `googleCalendarClientSecret`이 필요.

### `POST /api/workspaces/[workspaceId]/google-calendar/sync`
수동 양방향 동기화 트리거 (jpad <-> Google Calendar).

### `DELETE /api/workspaces/[workspaceId]/google-calendar`
Google Calendar 연결 해제.

### `GET /api/google-calendar/callback`
Google OAuth 콜백 처리. access token/refresh token 저장.

---

## 알림 API

### `GET /api/notifications?unreadOnly={bool}&workspaceId={id}&limit={n}&cursor={id}`
알림 목록 조회. 커서 기반 페이지네이션 지원.

**응답:**
```json
{
  "data": [{ "id": "...", "type": "...", "title": "...", "message": "...", "read": false, "link": "...", "createdAt": "..." }],
  "nextCursor": "uuid | null",
  "unreadCount": 5
}
```

### `PATCH /api/notifications/[notificationId]`
개별 알림 읽음 처리.

### `POST /api/notifications/read-all`
전체 알림 읽음 처리.

**Body:**
```json
{ "workspaceId": "uuid (optional)" }
```

---

## 휴지통 API

### `GET /api/trash?workspaceId={id}`
삭제된 페이지 목록.

### `PATCH /api/trash/[pageId]`
페이지 복원 (isDeleted=false).

### `DELETE /api/trash/[pageId]`
페이지 영구 삭제 (Git 파일도 삭제).

---

## 파일 업로드 API

### `POST /api/upload`
파일 업로드 (multipart/form-data).

**Form Fields:**
- `file`: 업로드 파일
- `pageId`: 연결할 페이지 ID
- `workspaceId`: 워크스페이스 ID

### `GET /api/upload/[attachmentId]`
업로드된 파일 조회/다운로드.
- `securityStatus=blocked`이고 `securityDisposition != "released"`이면 `423 Attachment quarantined` 반환.

---

## AI API

### `POST /api/ai/write`
AI 텍스트 처리. SSE 스트리밍 또는 JSON 응답.

**Body:**
```json
{
  "text": "원본 텍스트",
  "action": "summarize",
  "workspaceId": "uuid",
  "pageId": "uuid",
  "options": { "targetLang": "영어", "tone": "격식체" }
}
```

**지원 액션:** `summarize`, `expand`, `translate`, `fixGrammar`, `changeTone`, `explain`, `actionItems`

### `POST /api/ai/stream`
AI 스트리밍 응답.

### `POST /api/ai/summary`
페이지 AI 요약 생성.

**Body:**
```json
{ "pageId": "uuid", "content": "페이지 내용" }
```

### `POST /api/ai/chat`
AI 채팅 (컨텍스트 기반 대화). SSE 스트리밍 지원.

**Body:**
```json
{
  "question": "사용자 메시지",
  "workspaceId": "uuid",
  "pageId": "uuid",
  "usePageContext": true,
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }]
}
```

### `POST /api/ai/autocomplete`
AI 이어쓰기 (커서 위치 기반 문서 계속 작성).

**Body:**
```json
{
  "workspaceId": "uuid",
  "pageId": "uuid",
  "text": "커서까지의 문서 내용 (비우면 페이지 전체 사용)"
}
```

**응답:**
```json
{ "result": "이어서 작성된 텍스트" }
```

---

## 워크스페이스 AI 설정 API

### `GET /api/workspaces/[workspaceId]/ai/models`
선택된 프로필의 LLM provider에서 사용 가능한 모델 목록 조회.

### `POST /api/workspaces/[workspaceId]/ai/test-connection`
LLM provider 연결 테스트.

### `POST /api/workspaces/[workspaceId]/ai/test-generation`
LLM 실제 생성 테스트.

### `POST /api/workspaces/[workspaceId]/ai/reindex`
워크스페이스 시맨틱 검색 재색인 트리거.

### `GET /api/workspaces/[workspaceId]/ai/index-jobs`
시맨틱 인덱싱 작업 큐 조회.

### `POST /api/workspaces/[workspaceId]/ai/process-index-jobs`
인덱싱 작업 수동 처리.

### `GET /api/workspaces/[workspaceId]/ai/index-worker-runs`
인덱싱 워커 실행 이력 조회.

### `GET /api/workspaces/[workspaceId]/ai/vector-store-status`
벡터 스토어 상태 조회 (configured backend, read backend, chunk count 등).

---

## 감사 로그 API

### `GET /api/workspaces/[workspaceId]/audit-logs`
워크스페이스 감사 로그 조회.

### `GET /api/workspaces/[workspaceId]/audit-logs/export`
감사 로그 NDJSON export.

---

## 보존 정책 API

### `GET /api/workspaces/[workspaceId]/retention-runs`
Retention 실행 이력 조회.

---

## WebSocket 토큰 API

### `POST /api/ws-token`
WebSocket 연결용 HMAC-SHA256 토큰 발급.

**Body:**
```json
{ "workspaceId": "uuid", "pageId": "uuid" }
```

**응답:**
```json
{ "token": "base64url_encoded_data.base64url_encoded_signature" }
```

---

## 위키 API

### `GET /api/wiki/[workspaceId]`
공개 워크스페이스의 페이지 목록 (publicWikiEnabled=true인 경우만).

---

## 조직 API

### `GET /api/organizations`
현재 사용자가 속한 조직 목록.

### `POST /api/organizations`
조직 생성.

### `GET /api/organizations/[organizationId]`
조직 상세 조회.

### `PATCH /api/organizations/[organizationId]`
조직 정보 수정.

### 도메인 관리
- `GET /api/organizations/[orgId]/domains` - 도메인 목록
- `POST /api/organizations/[orgId]/domains` - 도메인 추가
- `DELETE /api/organizations/[orgId]/domains/[domainId]` - 도메인 삭제
- `POST /api/organizations/[orgId]/domains/[domainId]/verify` - DNS TXT 검증

### SCIM 토큰 관리
- `GET /api/organizations/[orgId]/scim-tokens` - 토큰 목록
- `POST /api/organizations/[orgId]/scim-tokens` - 토큰 발급
- `DELETE /api/organizations/[orgId]/scim-tokens/[tokenId]` - 토큰 폐기

### SCIM 그룹 매핑
- `GET /api/organizations/[orgId]/scim-groups` - SCIM 그룹 목록
- `GET /api/organizations/[orgId]/scim-mappings` - 워크스페이스 역할 매핑 조회
- `POST /api/organizations/[orgId]/scim-mappings` - 매핑 생성
- `DELETE /api/organizations/[orgId]/scim-mappings/[mappingId]` - 매핑 삭제

---

## SCIM v2 API

Base URL: `/api/scim/v2`

### Discovery
- `GET /api/scim/v2/ServiceProviderConfig`
- `GET /api/scim/v2/ResourceTypes`
- `GET /api/scim/v2/Schemas`
- `GET /api/scim/v2/Schemas/[schemaId]`

### Users
- `GET /api/scim/v2/Users` - 사용자 목록 (필터링 지원)
- `POST /api/scim/v2/Users` - 사용자 프로비저닝
- `GET /api/scim/v2/Users/[userId]` - 사용자 조회
- `PATCH /api/scim/v2/Users/[userId]` - 사용자 수정
- `DELETE /api/scim/v2/Users/[userId]` - 사용자 비활성화

### Groups
- `GET /api/scim/v2/Groups` - 그룹 목록
- `POST /api/scim/v2/Groups` - 그룹 생성
- `GET /api/scim/v2/Groups/[groupId]` - 그룹 조회
- `PATCH /api/scim/v2/Groups/[groupId]` - 그룹 수정
- `DELETE /api/scim/v2/Groups/[groupId]` - 그룹 삭제

---

## 플랫폼 운영 API

### `GET /api/admin/ops/overview`
플랫폼 전체 운영 현황 (사용자, 워크스페이스, 페이지 수 등).

### `GET /api/admin/ops/attachments`
첨부 격리 검토 대기열 조회.

### 첨부 관리
- `POST /api/admin/ops/attachments/[attachmentId]/rescan` - 재검사
- `POST /api/admin/ops/attachments/[attachmentId]/release` - 수동 허용
- `POST /api/admin/ops/attachments/[attachmentId]/reblock` - 다시 격리

### `GET /api/admin/ops/backups`
백업 실행 이력 조회.

### `GET /api/admin/ops/restore-drills`
복구 검증 실행 이력 조회.

### `GET /api/admin/ops/audit-log-deliveries`
감사 로그 외부 전달 상태 조회.

### `GET /api/admin/ops/index-workers`
시맨틱 인덱싱 워커 실행 이력 조회.

### `GET /api/admin/ops/vector-store-status`
벡터 스토어 전체 상태 조회.
