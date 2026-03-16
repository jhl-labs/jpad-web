# 실시간 협업 시스템

## 개요

Yjs CRDT 기반의 실시간 협업 편집 시스템입니다. Node.js `ws` 라이브러리 기반 커스텀 WebSocket 서버로 문서 동기화를 처리합니다.

## 아키텍처

```
Client A                    Server                     Client B
┌──────────┐            ┌──────────────┐            ┌──────────┐
│ BlockNote│            │  ws          │            │ BlockNote│
│ + Yjs    │◀──────────▶│  WebSocket   │◀──────────▶│ + Yjs    │
│ Provider │  WebSocket │  Server      │  WebSocket │ Provider │
└──────────┘            │              │            └──────────┘
                        │  ┌────────┐  │
                        │  │Yjs Doc │  │
                        │  └───┬────┘  │
                        │      │       │
                        │  ┌───▼────┐  │
                        │  │ Redis  │  │
                        │  │ PubSub │  │
                        │  └───┬────┘  │
                        │      │       │
                        │  ┌───▼────┐  │
                        │  │ 파일   │  │
                        │  │스냅샷  │  │
                        │  └────────┘  │
                        └──────────────┘
```

---

## WebSocket 서버 (`src/server/ws.ts`)

### 기본 설정

| 항목 | 값 |
|------|-----|
| Runtime | Node.js `ws` (WebSocketServer) |
| 포트 | `WS_PORT` 환경 변수 (기본: 1234) |
| 프로토콜 | y-websocket 호환 (MSG_SYNC=0, MSG_AWARENESS=1) |
| 인증 | HMAC-SHA256 토큰 |
| 토큰 유효 기간 | 5분 (`TOKEN_MAX_AGE_MS`) |

### HMAC 토큰 인증

1. 클라이언트가 `POST /api/ws-token`으로 토큰 요청
2. 서버가 사용자 인증 및 페이지 접근 권한 확인 (`getPageAccessContext`)
3. 페이로드(userId, workspaceId, pageId, canEdit, timestamp)를 `WS_SECRET`으로 HMAC-SHA256 서명
4. 토큰 형식: `base64url(payload).base64url(signature)`
5. WebSocket 연결 시 `?token=` 쿼리 파라미터로 전달
6. 서버에서 서명 검증 + 타임스탬프 만료 확인 + 문서명(workspaceId:pageId) 일치 확인
7. 타이밍 안전 비교(timing-safe comparison) 적용

### 토큰 페이로드 구조

```typescript
interface TokenPayload {
  userId: string;
  workspaceId: string;
  pageId: string;
  canEdit: boolean;    // viewer 역할이면 false
  timestamp: number;
}
```

### Viewer 쓰기 차단

`canEdit: false`인 연결(viewer 역할)에서 sync message type 2(Update)가 수신되면 무시합니다.

```
y-protocols sync types:
  0 = SyncStep1 (상태 벡터 요청) → 허용
  1 = SyncStep2 (전체 동기화 응답) → 허용
  2 = Update (문서 변경) → canEdit=false이면 차단
```

Awareness 메시지(커서 위치, 사용자 정보)는 viewer도 전송 가능합니다.

### CORS 제어

- 개발 환경(`NODE_ENV !== "production"`): 모든 origin 허용
- 프로덕션: `NEXTAUTH_URL`의 origin + `CORS_ALLOWED_ORIGINS` 환경 변수에 등록된 origin만 허용
- 비브라우저 클라이언트(origin 없음): 허용

### 문서 관리

```typescript
interface SharedDoc {
  docName: string;                           // "workspaceId:pageId"
  ydoc: Y.Doc;                              // Yjs 문서 인스턴스
  awareness: awarenessProtocol.Awareness;   // 커서/사용자 정보
  conns: Map<WebSocket, Set<number>>;       // 연결별 awareness client ID 추적
  updateHandler: (update, origin) => void;  // 문서 업데이트 핸들러
  persistTimer: ReturnType<typeof setTimeout> | null;  // 디바운스 타이머
}
```

- 문서별 `SharedDoc` 인스턴스를 `docs` Map에 관리
- 동일 문서에 대한 동시 초기화 요청은 `docInitializations` Map으로 중복 방지
- 연결 종료 시 awareness state 정리, 마지막 연결이 끊기면 스냅샷 저장 후 문서 정리

### Redis PubSub

다중 서버 인스턴스 간 문서 업데이트를 동기화합니다.

- 채널: `yjs:{docName}` (예: `yjs:workspaceId:pageId`)
- 메시지 형식: `{ serverId, update(base64) }`
- 같은 서버에서 발생한 업데이트는 `serverId` 비교로 무시
- 문서 업데이트 origin 구분:
  - `REDIS_ORIGIN` - Redis에서 수신한 원격 업데이트
  - `SNAPSHOT_ORIGIN` - 스냅샷 로딩 시 적용된 업데이트
  - WebSocket 인스턴스 - 클라이언트에서 수신한 업데이트
- 마지막 연결 종료 시 채널 구독 해제

---

## 영속화 (`src/server/yjsPersistence.ts`)

### 파일 기반 스냅샷 저장

Yjs 문서 상태를 파일시스템에 바이너리 스냅샷으로 저장합니다.

| 항목 | 값 |
|------|-----|
| 저장 경로 | `data/yjs/{workspaceId}/{pageId}.bin` |
| 디바운스 | 300ms (마지막 업데이트 후) |
| 원자적 쓰기 | 임시 파일 작성 후 `rename` |
| 경로 정규화 | `[^a-zA-Z0-9._-]` → `_` 치환 |

### 저장 흐름

```
1. 문서 업데이트 발생
2. 300ms 디바운스 타이머 시작 (이전 타이머 취소)
3. 타이머 만료 시:
   a. Y.encodeStateAsUpdate(ydoc) → Uint8Array 스냅샷 생성
   b. 임시 파일 쓰기: {pageId}.bin.{pid}.{timestamp}.tmp
   c. rename으로 원자적 교체
4. 마지막 클라이언트 연결 종료 시 즉시 최종 스냅샷 저장
```

### 로드 흐름

```
1. 새 SharedDoc 생성 시 파일에서 스냅샷 로드
2. 스냅샷이 있으면 SNAPSHOT_ORIGIN으로 Yjs 문서에 적용
3. 스냅샷이 없으면(새 문서) 빈 상태로 시작
```

---

## 클라이언트 (`src/components/editor/CollaborativeEditor.tsx`)

### InnerEditor 분리 패턴

에디터를 `CollaborativeEditor`(외부)와 `InnerEditor`(내부) 2개 컴포넌트로 분리합니다.

```
CollaborativeEditor (외부)
├── Yjs Doc 생성 + WebSocket 연결
├── 타이틀 동기화 (pageMeta map)
└── InnerEditor (내부) ← collaboration이 준비된 후에만 마운트
    ├── useCreateBlockNote (Yjs fragment 전달)
    ├── 자동 저장 (디바운스)
    ├── 커서 컨텍스트 추적
    ├── 슬래시 메뉴 (AI 명령어)
    ├── 플로팅 AI 툴바
    └── 우클릭 컨텍스트 메뉴
```

- `InnerEditor`는 `CollaborationState`가 준비된 후에만 마운트
- `useCreateBlockNote` 훅이 첫 렌더에서 Yjs fragment를 받도록 보장
- key prop으로 `${workspaceId}:${pageId}` 사용하여 페이지 전환 시 완전 리마운트

### Yjs 연결 흐름

```
1. CollaborativeEditor 마운트
2. Y.Doc 생성
3. POST /api/ws-token → HMAC 토큰 발급
4. WebsocketProvider 생성 (ws://host:port/workspaceId:pageId?token=...)
5. CollaborationState 설정 → InnerEditor 마운트
6. Yjs sync 이벤트 대기
7. 동기화 완료 후 fragment가 비어있으면 REST API initialContent로 초기화
8. 3초 타임아웃 폴백 (동기화 미완료 시)
```

### 타이틀 동기화 (pageMeta Map)

Yjs `Map`을 사용하여 타이틀을 실시간 동기화합니다.

```typescript
const meta = collaboration.doc.getMap("pageMeta");
// 원격 타이틀 변경 감지
meta.observe(() => {
  const remoteTitle = meta.get("title");
  onRemoteTitleChange(remoteTitle);
});
// 로컬 타이틀 변경 시 공유
meta.set("title", title);
```

- `onRemoteTitleChange` 콜백으로 부모 컴포넌트에 원격 타이틀 변경 전달
- `title` prop 변경 시 Yjs Map에 반영

### 자동 저장

- 에디터 변경 감지 → 2초 디바운스 → Markdown 직렬화 → `onSave` 콜백
- 저장 상태 UI: "저장 중..." → "저장됨" (2초) → idle
- 저장 실패 시 "저장 실패" + 재시도 버튼
- `readOnly` 모드에서는 저장하지 않음

### 연결 상태 표시

- 초록 점 + "동기화" - WebSocket 연결됨
- 빨간 점 + "오프라인" - 연결 끊김
- `provider.on("status", ...)` 이벤트로 추적

### 읽기 전용 모드

- `readOnly: true` 전달 시 `BlockNoteView`의 `editable` 비활성화
- 자동 저장 비활성화
- 컨텍스트 메뉴 비활성화

---

## 분산 잠금 (`src/lib/git/lock.ts`)

Git 저장소에 동시 쓰기를 방지하는 Redis 기반 분산 잠금.

### 구현 방식

| 항목 | 값 |
|------|-----|
| 잠금 획득 | `SET key token PX 10000 NX` |
| 잠금 해제 | Lua 스크립트 (토큰 검증 후 DEL) |
| TTL | 10초 (데드락 방지) |
| 재시도 | 50ms 간격, 최대 100회 |

### 로컬 큐

- 같은 프로세스 내 요청은 로컬 큐로 직렬화
- Redis 호출 최소화

```typescript
await withGitLock(workspaceId, async () => {
  await commitPage(workspaceId, pageId, content, author);
});
```

---

## Markdown 직렬화 (`src/lib/markdown/serializer.ts`)

BlockNote 블록과 Markdown 간 양방향 변환.

### 지원 블록 타입

- 제목 (H1-H3)
- 단락
- 목록 (순서/비순서)
- 코드 블록
- 인용구
- 이미지
- 테이블

### 변환 파이프라인

```
에디터 저장: BlockNote Blocks → blocksToMarkdown() → Markdown String → Git/REST API
에디터 로드: Git/REST API → Markdown String → editor.tryParseMarkdownToBlocks() → BlockNote Blocks
```

---

## WS 토큰 발급 (`src/app/api/ws-token/route.ts`)

### 흐름

```
1. POST /api/ws-token { workspaceId, pageId }
2. requireAuth() → 사용자 인증
3. getPageAccessContext(userId, pageId) → 접근 권한 확인
4. canView 확인 (false면 403)
5. TokenPayload 생성 (canEdit = access.canEdit)
6. HMAC-SHA256 서명 (WS_SECRET 또는 NEXTAUTH_SECRET)
7. 토큰 반환: base64url(payload).base64url(signature)
```

### 권한 매핑

| 역할 | canView | canEdit |
|------|---------|---------|
| Owner | O | O |
| Admin | O | O |
| Maintainer | O | O |
| Editor | O | O |
| Viewer | O | X |
